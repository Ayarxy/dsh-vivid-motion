import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';

// Run the real watcher against deterministic event/clipboard doubles. These
// tests exercise decisions and lifecycle, not browser permission or OS writes.
const source = fs.readFileSync(new URL('../packages/dsh-copy-toast/lib/client.js', import.meta.url), 'utf8')
  .replace('exports.TOAST = TOAST;', 'exports.TOAST = TOAST; exports.installCopyWatcher = installCopyWatcher;');

class Transfer {
  values = new Map();
  items = { add() {}, remove() {}, clear() {} };
  files = [];
  get types() { return [...this.values.keys()]; }
  getData(type) { return this.values.get(type) || ''; }
  setData(type, value) { this.values.set(type, String(value)); }
  clearData(type) { if (type === undefined) this.values.clear(); else this.values.delete(type); }
}

// Like platform ClipboardItem methods, these operations use internal data;
// neither constructor values nor instance getters are re-evaluated by getType.
const itemData = new WeakMap();
class ClipboardItem {
  constructor(data) { itemData.set(this, data); }
  get types() {
    if (!itemData.has(this)) throw new TypeError('Illegal invocation');
    return Object.freeze(Object.keys(itemData.get(this)));
  }
  getType(type) {
    if (!itemData.has(this)) throw new TypeError('Illegal invocation');
    return Promise.resolve(itemData.get(this)[type]).then(value =>
      typeof value === 'string' ? new Blob([value], { type }) : value);
  }
}
const nativeTypes = Object.getOwnPropertyDescriptor(ClipboardItem.prototype, 'types').get;
const nativeGetType = ClipboardItem.prototype.getType;

function fixture(clipboard = {}) {
  const listeners = new Map(), timers = new Map(), calls = [], writes = [];
  let seq = 0, registration, selection = null;
  clipboard.writeText ??= function (value) { writes.push(String(value)); return Promise.resolve(); };
  clipboard.write ??= async function (items) {
    for (const item of items) for (const type of nativeTypes.call(item)) {
      writes.push(await nativeGetType.call(item, type));
    }
  };
  const document = {
    activeElement: null,
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) { if (listeners.get(type) === listener) listeners.delete(type); },
  };
  const context = {
    document, navigator: { clipboard }, console,
    window: {
      ClipboardItem, Blob,
      __ModuleLoader__: { load(value) { registration = value; } },
      getSelection: () => selection,
      setTimeout(fn) { timers.set(++seq, fn); return seq; },
      clearTimeout(id) { timers.delete(id); },
    },
  };
  vm.runInNewContext(source, context);
  const core = registration.factory(() => ({}));
  const dispose = core.installCopyWatcher(() => calls.push('copy'), () => calls.push('cut'));
  return {
    clipboard, calls, writes, document, listeners, timers, dispose,
    select(value) { selection = value; },
    emit(event) { listeners.get(event.type)?.(event); },
    flush() { for (const [id, fn] of timers) { timers.delete(id); fn(); } },
  };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
const control = () => ({ nodeType: 1, tagName: 'TEXTAREA', value: 'ABCDE', selectionStart: 1,
  selectionEnd: 4, readOnly: false, disabled: false, isConnected: true });
const cut = (target, overrides = {}) => ({ type: 'cut', target, isTrusted: true,
  defaultPrevented: false, clipboardData: new Transfer(), ...overrides });

// DOM textContent / Range stringification include text nodes, never <br> or
// paragraph separators. The selected rendered text is supplied independently.
class Element {
  nodeType = 1;
  isContentEditable = true;
  isConnected = true;
  parentElement = null;
  childNodes = [];
  constructor(tag, ...children) { this.tagName = tag.toUpperCase(); this.replaceChildren(...children); }
  replaceChildren(...children) {
    for (const child of this.childNodes) child.parentElement = null;
    this.childNodes = children.map(child => typeof child === 'string' ? new Text(child) : child);
    for (const child of this.childNodes) child.parentElement = this;
  }
  get firstChild() { return this.childNodes[0] || null; }
  get nextSibling() { return sibling(this); }
  get textContent() { return this.childNodes.map(child => child.textContent).join(''); }
  contains(node) { for (; node; node = node.parentElement) if (node === this) return true; return false; }
}
class Text {
  nodeType = 3;
  parentElement = null;
  constructor(data) { this.data = data; }
  get textContent() { return this.data; }
  get nextSibling() { return sibling(this); }
}
function sibling(node) {
  const list = node.parentElement?.childNodes || [];
  return list[list.indexOf(node) + 1] || null;
}
function textOffset(root, endpoint, offset) {
  let size = 0, found = false;
  function visit(node) {
    if (found) return;
    if (node === endpoint) {
      size += node.nodeType === 3 ? offset : node.childNodes.slice(0, offset).reduce((sum, child) => sum + child.textContent.length, 0);
      found = true;
    } else if (node.nodeType === 3) size += node.data.length;
    else for (const child of node.childNodes) visit(child);
  }
  visit(root);
  if (!found) throw new Error('Endpoint outside root');
  return size;
}
function selectRange(f, root, start, startOffset, end, endOffset, renderedText) {
  const range = {
    startContainer: start, startOffset, endContainer: end, endOffset,
    cloneRange() {
      return {
        end: null, offset: 0,
        selectNodeContents() {},
        setEnd(node, offset) { this.end = node; this.offset = offset; },
        toString() { return root.textContent.slice(0, textOffset(root, this.end, this.offset)); },
      };
    },
  };
  f.select({ rangeCount: 1, anchorNode: start, focusNode: end, getRangeAt: () => range,
    toString: () => renderedText });
}
function managedCut(f, root, data = '\n') {
  const event = cut(root);
  f.emit(event);
  event.defaultPrevented = true;
  event.clipboardData.setData('text/plain', data);
  return event;
}

test('native cut confirms only after deletion, including beforeinput cancellation', () => {
  for (const deleted of [false, true]) {
    const f = fixture(), field = control();
    f.emit(cut(field));
    if (deleted) field.value = 'AE';
    f.flush();
    assert.deepEqual(f.calls, deleted ? ['cut'] : []);
    f.dispose();
  }
});

test('editor-managed cut requires both payload and the expected deletion', () => {
  for (const payload of ['', 'BCD']) for (const deleted of [false, true]) {
    const f = fixture(), field = control();
    const event = managedCut(f, field, payload);
    if (deleted) field.value = 'AE';
    f.flush();
    assert.deepEqual(f.calls, payload && deleted ? ['cut'] : []);
    assert.equal(Object.hasOwn(event.clipboardData, 'setData'), false);
    f.dispose();
  }
});

test('cutting a br confirms; collapsing the selection or rebuilding the same DOM does not', () => {
  for (const action of ['delete', 'collapse', 'rerender']) {
    const f = fixture(), root = new Element('div', new Element('p', 'A', new Element('br'), 'B'));
    const paragraph = root.firstChild;
    selectRange(f, root, paragraph.childNodes[0], 1, paragraph.childNodes[2], 0, '\n');
    managedCut(f, root);
    if (action === 'delete') paragraph.replaceChildren('AB');
    if (action === 'rerender') root.replaceChildren(new Element('p', 'A', new Element('br'), 'B'));
    f.select(null);
    f.flush();
    assert.deepEqual(f.calls, action === 'delete' ? ['cut'] : []);
    f.dispose();
  }
});

test('cutting a paragraph boundary confirms after merging the paragraphs', () => {
  const f = fixture(), root = new Element('div', new Element('p', 'A'), new Element('p', 'B'));
  selectRange(f, root, root.childNodes[0].firstChild, 1, root.childNodes[1].firstChild, 0, '\n');
  managedCut(f, root);
  root.replaceChildren(new Element('p', 'AB'));
  f.flush();
  assert.deepEqual(f.calls, ['cut']);
  f.dispose();
});

test('deleting only an empty paragraph confirms despite the remaining placeholder br', () => {
  const f = fixture(), root = new Element('div', new Element('p', new Element('br')), new Element('p', new Element('br')));
  selectRange(f, root, root.childNodes[0], 0, root.childNodes[1], 0, '\n');
  managedCut(f, root);
  root.replaceChildren(new Element('p', new Element('br')));
  f.flush();
  assert.deepEqual(f.calls, ['cut']);
  f.dispose();
});

test('deleting a different linebreak is not evidence of deleting the selected one', () => {
  const f = fixture(), root = new Element('div', 'A', new Element('br'), 'B', new Element('br'), 'C');
  selectRange(f, root, root.childNodes[0], 1, root.childNodes[2], 0, '\n');
  managedCut(f, root);
  root.replaceChildren('A', new Element('br'), 'BC');
  f.flush();
  assert.deepEqual(f.calls, []);
  f.dispose();
});

test('all selected linebreaks must be removed, including element-offset endpoints', () => {
  for (const remaining of [0, 1, 2]) {
    const f = fixture(), root = new Element('div', 'A', new Element('br'), new Element('br'), 'B');
    selectRange(f, root, root, 1, root, 3, '\n\n');
    managedCut(f, root, '\n\n');
    root.replaceChildren('A', ...Array.from({ length: remaining }, () => new Element('br')), 'B');
    f.flush();
    assert.deepEqual(f.calls, remaining === 0 ? ['cut'] : []);
    f.dispose();
  }
});

test('native rich-text cut cannot confirm unchanged content', () => {
  for (const deleted of [false, true]) {
    const f = fixture(), root = new Element('div', 'A', new Element('br'), 'B');
    selectRange(f, root, root.childNodes[0], 1, root.childNodes[2], 0, '\n');
    f.emit(cut(root));
    if (deleted) root.replaceChildren('AB');
    f.flush();
    assert.deepEqual(f.calls, deleted ? ['cut'] : []);
    f.dispose();
  }
});

test('normal rich-text cuts still require the exact remaining text', () => {
  for (const remaining of ['AE', 'ABCDE', 'AXE']) {
    const f = fixture(), root = new Element('div', new Element('p', 'ABCDE'));
    const text = root.firstChild.firstChild;
    selectRange(f, root, text, 1, text, 4, 'BCD');
    managedCut(f, root, 'BCD');
    root.replaceChildren(new Element('p', remaining));
    f.flush();
    assert.deepEqual(f.calls, remaining === 'AE' ? ['cut'] : []);
    f.dispose();
  }
});

test('synthetic, readonly, disabled and collapsed cuts remain silent', () => {
  for (const kind of ['synthetic', 'readonly', 'disabled', 'collapsed']) {
    const f = fixture(), field = control();
    if (kind === 'readonly') field.readOnly = true;
    if (kind === 'disabled') field.disabled = true;
    if (kind === 'collapsed') field.selectionEnd = field.selectionStart;
    f.emit(cut(field, { isTrusted: kind !== 'synthetic' }));
    field.value = 'AE'; f.flush();
    assert.deepEqual(f.calls, []);
    f.dispose();
  }
});

test('write() distinguishes empty representations from nonempty text or images', async () => {
  for (const data of [
    { 'text/plain': '' },
    { 'text/plain': new Blob([], { type: 'text/plain' }) },
    { 'text/plain': '', 'text/html': new Blob([]) },
    { 'text/plain': 'hello' },
    { 'text/plain': '', 'text/html': '<b>hello</b>' },
    { 'image/png': new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }) },
  ]) {
    const f = fixture();
    await f.clipboard.write([new ClipboardItem(data)]);
    await settle();
    assert.deepEqual(f.calls, f.writes.some(blob => blob.size > 0) ? ['copy'] : []);
    f.dispose();
  }
});

test('write() snapshots item references before the caller mutates its array', async () => {
  for (const text of ['', 'hello']) {
    let finish;
    const nativeResult = new Promise(resolve => { finish = resolve; });
    const f = fixture({ write: () => nativeResult });
    const items = [new ClipboardItem({ 'text/plain': text })];
    const result = f.clipboard.write(items);
    assert.equal(result, nativeResult);
    items[0] = new ClipboardItem({ 'text/plain': text ? '' : 'later' });
    finish(); await result; await settle();
    assert.deepEqual(f.calls, text ? ['copy'] : []);
    f.dispose();
  }
});

test('payload inspection bypasses instance overrides without calling application code', async () => {
  const f = fixture();
  const item = new ClipboardItem({ 'text/plain': 'hello' });
  Object.defineProperty(item, 'types', { get() { throw new Error('custom types getter must not run'); } });
  item.getType = () => { throw new Error('custom getType must not run'); };
  await f.clipboard.write([item]); await settle();
  assert.deepEqual(f.calls, ['copy']);
  f.dispose();
});

test('array element accessors are read only by the underlying write', async () => {
  const f = fixture(); let reads = 0;
  const item = new ClipboardItem({ 'text/plain': 'hello' });
  const items = [];
  Object.defineProperty(items, '0', { get() { reads++; return item; } });
  await f.clipboard.write(items); await settle();
  assert.equal(reads, 1);
  assert.deepEqual(f.calls, []);
  f.dispose();
});

test('empty inputs and rejected writes remain silent, original return values are preserved', async () => {
  const f = fixture();
  await f.clipboard.writeText(''); await f.clipboard.write([]); await settle();
  assert.deepEqual(f.calls, []); f.dispose();
  const failure = new Error('denied');
  const result = Promise.reject(failure);
  const rejected = fixture({ write: () => result });
  assert.equal(rejected.clipboard.write([new ClipboardItem({ 'text/plain': 'hello' })]), result);
  await assert.rejects(result, error => error === failure); await settle();
  assert.deepEqual(rejected.calls, []); rejected.dispose();
});

test('pending payload inspection is silent after disable', async () => {
  let finish;
  const data = new Promise(resolve => { finish = resolve; });
  const original = () => Promise.resolve();
  const f = fixture({ write: original });
  await f.clipboard.write([new ClipboardItem({ 'text/plain': data })]);
  f.dispose(); finish(new Blob(['hello'])); await settle();
  assert.deepEqual(f.calls, []);
  assert.equal(f.clipboard.write, original);
  assert.equal(f.listeners.size, 0);
});

test('a delayed nonempty payload confirms only after both write and inspection complete', async () => {
  let finishWrite, finishPayload;
  const writeResult = new Promise(resolve => { finishWrite = resolve; });
  const payload = new Promise(resolve => { finishPayload = resolve; });
  const f = fixture({ write: () => writeResult });
  const result = f.clipboard.write([new ClipboardItem({ 'text/plain': payload })]);
  assert.equal(result, writeResult);
  await settle(); assert.deepEqual(f.calls, []);
  finishWrite(); await result; await settle(); assert.deepEqual(f.calls, []);
  finishPayload(new Blob(['hello'])); await settle(); assert.deepEqual(f.calls, ['copy']);
  f.dispose();
});

test('payload inspection failures cannot reject a successful write or leak rejections', async () => {
  let rejectPayload;
  const payload = new Promise((resolve, reject) => { rejectPayload = reject; });
  const result = Promise.resolve('native result');
  const f = fixture({ write: () => result });
  assert.equal(f.clipboard.write([new ClipboardItem({ 'text/plain': payload })]), result);
  assert.equal(await result, 'native result');
  rejectPayload(new Error('inspection failed')); await settle();
  assert.deepEqual(f.calls, []);
  f.dispose();
});

test('wrapper preserves the receiver, arguments, return identity and synchronous exception', async () => {
  for (const method of ['write', 'writeText']) {
    let receiver, args;
    const sentinel = Promise.resolve('result');
    const f = fixture({ [method]: function (...values) { receiver = this; args = values; return sentinel; } });
    const value = method === 'write' ? [new ClipboardItem({ 'text/plain': 'hello' })] : 'hello';
    const customThis = {};
    const result = f.clipboard[method].call(customThis, value, 'extra');
    assert.equal(receiver, customThis); assert.equal(args[0], value); assert.equal(args[1], 'extra');
    assert.equal(result, sentinel); await result; await settle();
    assert.deepEqual(f.calls, ['copy']); f.dispose();
    const failure = new Error('synchronous failure');
    const throwing = fixture({ [method]() { throw failure; } });
    assert.throws(() => throwing.clipboard[method](value), error => error === failure);
    assert.deepEqual(throwing.calls, []); throwing.dispose();
  }
});

test('nonstandard iteration and text coercion execute only in the underlying API', async () => {
  const f = fixture(); let iterations = 0, coercions = 0;
  const items = [new ClipboardItem({ 'text/plain': 'hello' })];
  items[Symbol.iterator] = function* () { iterations++; yield this[0]; };
  await f.clipboard.write(items);
  await f.clipboard.writeText({ toString() { coercions++; return 'hello'; } });
  await settle();
  assert.equal(iterations, 1); assert.equal(coercions, 1); assert.deepEqual(f.calls, []);
  f.dispose();
});

test('nested synchronous APIs confirm once while consecutive copies remain distinct', async () => {
  const clipboard = { write() { return this.writeText('hello'); } };
  const f = fixture(clipboard);
  await clipboard.write([new ClipboardItem({ 'text/plain': 'hello' })]); await settle();
  assert.deepEqual(f.calls, ['copy']);
  await clipboard.write([new ClipboardItem({ 'text/plain': 'hello' })]); await settle();
  assert.deepEqual(f.calls, ['copy', 'copy']);
  f.dispose();
});

test('queued DOM events are cancelled on disable', () => {
  const f = fixture(), field = control();
  const event = cut(field);
  f.emit(event); field.value = 'AE'; f.dispose(); f.flush();
  assert.deepEqual(f.calls, []);
  assert.equal(f.listeners.size, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(Object.hasOwn(event.clipboardData, 'setData'), false);
});
