import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(new URL('./reasoning-runtime/package.json', import.meta.url));
const { JSDOM, ResourceLoader } = require('jsdom');
const source = fs.readFileSync(new URL('../packages/dsh-copy-toast/lib/client.js', import.meta.url), 'utf8')
  .replace('exports.TOAST = TOAST;', 'exports.TOAST = TOAST; exports.installCopyWatcher = installCopyWatcher;');

// Real JSDOM frame documents/realms and mutations; clipboard writes and trusted
// events are doubles. No running DSH, remote resources or system clipboard.
class InlineFrames extends ResourceLoader {
  fetch(url) {
    assert.equal(url, 'https://offline.invalid/frame.html');
    const response = Promise.resolve(Buffer.from('<!doctype html><html><body></body></html>'));
    response.abort = () => {};
    return response;
  }
}

function installClipboardFixture() {
  const representations = new WeakMap();
  const NativeBlob = Blob;
  class Item {
    constructor(data) { representations.set(this, data); }
    get types() {
      if (!representations.has(this)) throw new TypeError('Illegal invocation');
      return Object.freeze(Object.keys(representations.get(this)));
    }
    getType(type) {
      if (!representations.has(this)) throw new TypeError('Illegal invocation');
      return Promise.resolve(representations.get(this)[type]).then(value =>
        typeof value === 'string' ? new NativeBlob([value], { type }) : value);
    }
  }
  const types = Object.getOwnPropertyDescriptor(Item.prototype, 'types').get;
  const getType = Item.prototype.getType;
  class Clipboard {
    texts = [];
    async writeText(value) {
      if (value === 'rejected') throw new Error('denied');
      this.texts.push(String(value));
    }
    async write(items) {
      const sequence = Array.from(items);
      for (const item of sequence) for (const type of types.call(item)) await getType.call(item, type);
    }
  }
  Object.defineProperty(window, 'ClipboardItem', { configurable: true, value: Item });
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: new Clipboard() });
}

function prepare(view) {
  view.eval('(' + installClipboardFixture.toString() + ')()');
  const doc = view.document, listeners = new Map(), observers = new Set();
  const add = doc.addEventListener.bind(doc), remove = doc.removeEventListener.bind(doc);
  doc.addEventListener = (type, listener, options) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(listener);
    add(type, listener, options);
  };
  doc.removeEventListener = (type, listener, options) => {
    listeners.get(type)?.delete(listener);
    remove(type, listener, options);
  };
  const NativeObserver = view.MutationObserver;
  view.MutationObserver = class extends NativeObserver {
    constructor(callback) { super(callback); observers.add(this); }
    disconnect() { observers.delete(this); super.disconnect(); }
  };
  return {
    view, doc, observers, clipboard: view.navigator.clipboard,
    writeText: view.navigator.clipboard.writeText, write: view.navigator.clipboard.write,
    count(type) { return listeners.get(type)?.size || 0; },
    emit(type, target = doc.body, extra = {}) {
      const event = { type, target, isTrusted: true, defaultPrevented: false, ...extra };
      for (const listener of listeners.get(type) || []) listener(event);
      return event;
    },
  };
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function deferred() {
  let resolve;
  const promise = new Promise(finish => { resolve = finish; });
  return { promise, resolve };
}

function fixture(t) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://offline.invalid/', runScripts: 'outside-only', resources: new InlineFrames(),
  });
  const root = prepare(dom.window), calls = [];
  let core, stop, started = false;
  dom.window.__ModuleLoader__ = { load(registration) { core = registration.factory(() => ({})); } };
  dom.window.eval(source);
  const f = {
    root, calls,
    start() { started = true; stop = core.installCopyWatcher(() => calls.push('copy'), () => calls.push('cut')); },
    stop() { stop?.(); },
    frame(parent = root) {
      const frame = parent.doc.createElement('iframe');
      // A controlled asynchronous response allows API doubles to exist before
      // load observers, just as native APIs do, and exercises an unparsed doc.
      if (started) frame.src = 'https://offline.invalid/frame.html';
      parent.doc.body.append(frame);
      return { ...prepare(frame.contentWindow), frame };
    },
  };
  t.after(() => { f.stop(); dom.window.close(); });
  return f;
}

function selectControl(scope, value = 'ABCDE') {
  const input = scope.doc.createElement('textarea');
  input.value = value;
  scope.doc.body.append(input);
  input.focus();
  input.setSelectionRange(1, 4);
  return input;
}

function assertReleased(scope) {
  assert.equal(scope.count('copy'), 0);
  assert.equal(scope.count('cut'), 0);
  assert.equal(scope.count('load'), 0);
  assert.equal(scope.observers.size, 0);
  assert.equal(scope.clipboard.writeText, scope.writeText);
  assert.equal(scope.clipboard.write, scope.write);
}

test('existing and nested frames use their own active control for copy and cut', async t => {
  const f = fixture(t), child = f.frame(), nested = f.frame(child);
  f.start();
  const parentInput = selectControl(f.root, 'parent');
  const childInput = selectControl(child);
  child.emit('copy'); await tick();
  assert.deepEqual(f.calls, ['copy']);
  child.emit('cut'); childInput.value = 'AE'; await tick();
  assert.deepEqual(f.calls, ['copy', 'cut']);
  assert.equal(parentInput.value, 'parent');
  selectControl(nested);
  nested.emit('copy'); await tick();
  assert.deepEqual(f.calls, ['copy', 'cut', 'copy']);
  childInput.setSelectionRange(0, 0);
  child.emit('copy', childInput);
  nested.emit('copy', nested.doc.body, { isTrusted: false }); await tick();
  assert.equal(f.calls.length, 3);
});

test('rich-text cut checks the frame selection and the actual deletion', async t => {
  const f = fixture(t), child = f.frame();
  f.start();
  const editor = child.doc.createElement('div');
  Object.defineProperty(editor, 'isContentEditable', { value: true });
  editor.textContent = 'ABCDEF'; child.doc.body.append(editor);
  const range = child.doc.createRange();
  range.setStart(editor.firstChild, 2); range.setEnd(editor.firstChild, 4);
  child.view.getSelection().addRange(range);
  child.emit('cut', editor); await tick();
  assert.deepEqual(f.calls, []);
  child.emit('cut', editor); editor.textContent = 'ABEF'; await tick();
  assert.deepEqual(f.calls, ['cut']);
});

test('frame APIs accept native items, blobs, arrays and boxed strings from that realm', async t => {
  const f = fixture(t), child = f.frame(), nested = f.frame(child);
  delete f.root.view.ClipboardItem;
  f.start();
  const items = new child.view.Array(new child.view.ClipboardItem({ 'text/plain': 'hello' }));
  await child.clipboard.write(items); await tick();
  await nested.clipboard.writeText(new nested.view.String('hello')); await tick();
  assert.deepEqual(f.calls, ['copy', 'copy']);
  await child.clipboard.write(new child.view.Array(new child.view.ClipboardItem({ 'text/plain': '' })));
  await child.clipboard.writeText('');
  await assert.rejects(child.clipboard.writeText('rejected'), /denied/); await tick();
  assert.equal(f.calls.length, 2);
});

test('frame observation never repeats custom conversion or element accessors', async t => {
  const f = fixture(t), child = f.frame();
  f.start();
  let reads = 0, conversions = 0;
  const items = new child.view.Array();
  Object.defineProperty(items, '0', { get() { reads++; return new child.view.ClipboardItem({ 'text/plain': 'hello' }); } });
  await child.clipboard.write(items);
  await child.clipboard.writeText({ toString() { conversions++; return 'hello'; } }); await tick();
  assert.equal(reads, 1); assert.equal(conversions, 1);
  assert.deepEqual(f.calls, []);
});

test('an overridden frame String prototype cannot turn an empty write into a confirmation', async t => {
  const f = fixture(t), child = f.frame();
  let conversions = 0;
  child.view.String.prototype.toString = function () { conversions++; return ''; };
  f.start();
  await child.clipboard.writeText(new child.view.String('internal nonempty text')); await tick();
  assert.equal(conversions, 1);
  assert.deepEqual([...child.clipboard.texts], ['']);
  assert.deepEqual(f.calls, []);
});

test('frames inserted later and their nested frames acquire exactly one watcher', async t => {
  const f = fixture(t);
  f.start();
  const child = f.frame(); await tick();
  const nested = f.frame(child); await tick();
  child.frame.dispatchEvent(new f.root.view.Event('load'));
  nested.frame.dispatchEvent(new child.view.Event('load'));
  assert.equal(child.count('copy'), 1, 'child listener'); assert.equal(nested.count('copy'), 1, 'nested listener');
  await child.clipboard.writeText('first');
  await nested.clipboard.writeText('second'); await tick();
  assert.deepEqual(f.calls, ['copy', 'copy']);
});

test('navigation releases the old document and ignores its pending API result', async t => {
  const f = fixture(t), child = f.frame(), pending = deferred();
  child.writeText = child.clipboard.writeText = () => pending.promise;
  f.start();
  assert.equal(child.clipboard.writeText('old'), pending.promise);
  child.frame.src = 'about:blank';
  const replacement = prepare(child.frame.contentWindow);
  assert.notEqual(replacement.doc, child.doc);
  pending.resolve(); await pending.promise; await tick();
  assert.deepEqual(f.calls, []); assertReleased(child);
  await replacement.clipboard.writeText('new'); await tick();
  assert.deepEqual(f.calls, ['copy']);
  f.stop(); assertReleased(replacement);
});

test('inaccessible frames are skipped, release old watchers and recover on accessible load', async t => {
  const f = fixture(t), child = f.frame(), blocked = f.frame();
  Object.defineProperty(blocked.frame, 'contentDocument', {
    configurable: true, get() { throw new f.root.view.DOMException('Blocked', 'SecurityError'); },
  });
  f.start();
  assert.equal(blocked.count('copy'), 0);
  Object.defineProperty(child.frame, 'contentDocument', { configurable: true, get: () => null });
  child.frame.dispatchEvent(new f.root.view.Event('load'));
  assertReleased(child);
  await f.root.clipboard.writeText('parent'); await tick();
  assert.deepEqual(f.calls, ['copy']);
  delete child.frame.contentDocument;
  child.frame.dispatchEvent(new f.root.view.Event('load'));
  await child.clipboard.writeText('child'); await tick();
  assert.deepEqual(f.calls, ['copy', 'copy']);
});

test('removing a frame suppresses queued DOM feedback and pending writes immediately', async t => {
  const f = fixture(t), child = f.frame(), nested = f.frame(child), pending = deferred();
  nested.writeText = nested.clipboard.writeText = () => pending.promise;
  f.start();
  selectControl(child); child.emit('copy');
  assert.equal(nested.clipboard.writeText('waiting'), pending.promise);
  child.frame.remove();
  pending.resolve(); await pending.promise; await tick();
  assert.deepEqual(f.calls, []); assertReleased(child); assertReleased(nested);
  await f.root.clipboard.writeText('parent'); await tick();
  assert.deepEqual(f.calls, ['copy']);
});

test('removal also suppresses payload inspection that completes after a successful write', async t => {
  const f = fixture(t), child = f.frame(), pending = deferred();
  child.write = child.clipboard.write = () => Promise.resolve();
  const item = new child.view.ClipboardItem({ 'text/plain': pending.promise });
  const blob = new child.view.Blob(['hello']);
  f.start();
  await child.clipboard.write([item]); await tick();
  assert.deepEqual(f.calls, []);
  child.frame.remove(); pending.resolve(blob); await tick();
  assert.deepEqual(f.calls, []); assertReleased(child);
});

test('synchronous calls across realms share one operation while consecutive copies stay distinct', async t => {
  const f = fixture(t), child = f.frame();
  child.writeText = child.clipboard.writeText = value => f.root.clipboard.writeText(value);
  f.start();
  await child.clipboard.writeText('hello'); await tick();
  assert.deepEqual(f.calls, ['copy']);
  await child.clipboard.writeText('hello'); await tick();
  assert.deepEqual(f.calls, ['copy', 'copy']);
});

for (const removed of [false, true]) {
  test(`a child cut delegated to the parent ${removed ? 'is silent after removal' : 'keeps its cut identity'}`, async t => {
    const f = fixture(t), child = f.frame(), pending = deferred();
    f.root.writeText = f.root.clipboard.writeText = () => pending.promise;
    f.start();
    const input = selectControl(child);
    const event = child.emit('cut', input, { eventPhase: 2 });
    event.defaultPrevented = true;
    const result = f.root.clipboard.writeText('BCD');
    event.eventPhase = 0;
    await tick();
    assert.deepEqual(f.calls, []);
    if (removed) child.frame.remove();
    pending.resolve(); await result;
    input.value = 'AE'; await tick();
    assert.deepEqual(f.calls, removed ? [] : ['cut']);
    if (removed) assertReleased(child);
    await f.root.clipboard.writeText('independent parent copy'); await tick();
    assert.equal(f.calls.at(-1), 'copy');
  });
}

test('a frame operation delegated to the parent is silent after its originating frame is removed', async t => {
  const f = fixture(t), child = f.frame(), pending = deferred();
  f.root.writeText = f.root.clipboard.writeText = () => pending.promise;
  child.writeText = child.clipboard.writeText = value => f.root.clipboard.writeText(value);
  f.start();
  assert.equal(child.clipboard.writeText('waiting'), pending.promise);
  child.frame.remove(); pending.resolve(); await pending.promise; await tick();
  assert.deepEqual(f.calls, []); assertReleased(child);
  await f.root.clipboard.writeText('new parent operation'); await tick();
  assert.deepEqual(f.calls, ['copy']);
});

test('disable restores every realm, disconnects observers and can enable again without duplicates', async t => {
  const f = fixture(t), child = f.frame(), nested = f.frame(child), pending = deferred();
  nested.writeText = nested.clipboard.writeText = () => pending.promise;
  f.start();
  nested.clipboard.writeText('waiting');
  f.stop(); f.stop(); pending.resolve(); await tick();
  assert.deepEqual(f.calls, []);
  assertReleased(f.root); assertReleased(child); assertReleased(nested);
  const later = f.frame(); await tick();
  assert.equal(later.count('copy'), 0);
  f.start();
  assert.equal(child.count('copy'), 1); assert.equal(later.count('copy'), 1);
  await later.clipboard.writeText('enabled'); await tick();
  assert.deepEqual(f.calls, ['copy']);
  f.stop(); assertReleased(later);
});
