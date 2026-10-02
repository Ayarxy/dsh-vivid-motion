// Full apply/mount/unmount/reapply tests against one cached production module.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = fs.readFileSync(new URL('../packages/dsh-copy-toast/lib/client.js', import.meta.url), 'utf8');

function fixture(t, { locale = true } = {}) {
  let now = 0;
  let sequence = 0;
  const timers = new Map();
  const setTimer = (fn, ms) => { const id = ++sequence; timers.set(id, { fn, at: now + ms }); return id; };
  const clearTimer = id => timers.delete(id);
  const flushEvents = () => {
    for (;;) {
      const next = [...timers.entries()].find(([, value]) => value.at <= now);
      if (!next) return;
      timers.delete(next[0]);
      next[1].fn();
    }
  };
  class Element {
    nodeType = 1;
    children = [];
    parentNode = null;
    style = {};
    attributes = {};
    listeners = new Map();
    offsetHeight = 44;
    offsetWidth = 124;
    constructor(tag) { this.tagName = tag.toUpperCase(); }
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
    removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parentNode = null; return child; }
    contains(node) { for (; node; node = node.parentNode) if (node === this) return true; return false; }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    getAttribute(key) { return this.attributes[key] ?? null; }
    addEventListener(type, fn) { const list = this.listeners.get(type) || []; list.push(fn); this.listeners.set(type, list); }
    removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) || []).filter(value => value !== fn)); }
    animate() { return { playState: 'running', finished: Promise.resolve(), cancel() { this.playState = 'idle'; } }; }
  }
  const document = new Element('document');
  document.body = new Element('body');
  document.documentElement = new Element('html');
  document.documentElement.setAttribute('lang', 'zh-CN');
  document.createElement = tag => new Element(tag);
  document.activeElement = document.body;
  const editor = new Element('div');
  editor.isContentEditable = true;
  let selected = 'selected';
  const selection = { rangeCount: 1, anchorNode: editor, focusNode: editor, toString: () => selected };
  class Clipboard {
    writeText() { return Promise.resolve(); }
    write() { return Promise.resolve(); }
  }
  const clipboard = new Clipboard();
  const hookEffects = [];
  const React = {
    Fragment: Symbol('Fragment'),
    createElement(type, props, ...children) { return { type, props: props || {}, children }; },
    useRef(value) { return { current: value }; },
    useEffect(effect) { hookEffects.push(effect); },
  };
  let language = 'zh';
  const dictionaries = new Map();
  const localeService = {
    register(namespace, id, dictionary) {
      const key = namespace + ':' + id;
      assert.equal(dictionaries.has(key), false, 'previous dictionary must be disposed');
      dictionaries.set(key, dictionary);
      return () => dictionaries.delete(key);
    },
    bind(namespace) { return key => dictionaries.get(namespace + ':' + language)?.[key] ?? key; },
  };
  let registration;
  const sandbox = {
    window: {
      __ModuleLoader__: { load: value => { registration = value; } },
      Clipboard, getSelection: () => selection,
      setTimeout: setTimer, clearTimeout: clearTimer,
      matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    },
    document, navigator: { clipboard, language: 'en' },
    performance: { now: () => now }, setTimeout: setTimer, clearTimeout: clearTimer,
    getComputedStyle: element => ({ transform: element.style.transform || 'none', opacity: element.style.opacity || '1', filter: 'none' }),
    console,
  };
  vm.runInNewContext(source, sandbox);
  assert.equal(registration.id, 'dsh-copy-toast');
  const mod = registration.factory(spec => { assert.equal(spec, 'react'); return React; });
  const activations = new Set();
  function enable() {
    const cleanups = [];
    let Component;
    let options;
    mod.apply({
      get: name => name === 'locale' && locale ? localeService : undefined,
      effect(effect) { const cleanup = effect(); cleanups.push(cleanup); return cleanup; },
      slots: {
        inject(key, callback) { assert.equal(key, 'shell.overlay'); return callback(); },
        register(value, component) { options = value; Component = component; return () => {}; },
      },
    });
    let unmount;
    const activation = {
      options,
      layer: null,
      mount() {
        const tree = Component({});
        assert.equal(tree.children[0].type, 'style');
        assert.match(tree.children[0].props.dangerouslySetInnerHTML.__html, /\.dct-layer/);
        const layer = new Element('div');
        layer.className = tree.children[1].props.className;
        tree.children[1].props.ref.current = layer;
        unmount = hookEffects.pop()();
        activation.layer = layer;
      },
      unmount() { unmount?.(); unmount = null; },
      disable() {
        if (!activations.delete(activation)) return;
        for (const cleanup of cleanups.reverse()) if (typeof cleanup === 'function') cleanup();
        activation.unmount();
      },
    };
    activations.add(activation);
    activation.mount();
    return activation;
  }
  t.after(() => { for (const activation of [...activations]) activation.disable(); });
  const emit = (type = 'copy', options = {}, afterCapture = () => {}) => {
    const event = { type, isTrusted: true, target: document.body, defaultPrevented: false, clipboardData: null, ...options };
    for (const listener of [...(document.listeners.get(type) || [])]) listener(event);
    afterCapture(event);
    return event;
  };
  const title = activation => activation.layer.children.at(-1)?.children[0]?.children[1]?.textContent;
  return {
    Clipboard, clipboard, document, dictionaries, timers, mod, enable, emit, flushEvents, title,
    setLanguage(value) { language = value; document.documentElement.setAttribute('lang', value); },
    setSelection(value) { selected = value; },
  };
}

test('production module registers additive overlay and follows live locale for copy/cut', async t => {
  const f = fixture(t);
  assert.deepEqual([...f.mod.inject], ['slots']);
  const active = f.enable();
  assert.equal(active.options.id, 'dsh-copy-toast');
  assert.equal(active.options.order, 100);
  assert.equal(f.dictionaries.size, 2);
  await f.clipboard.writeText('hello');
  assert.equal(f.title(active), '已复制');
  assert.equal(active.layer.children[0].children[0].attributes.role, 'status');
  f.setLanguage('en');
  f.emit('cut');
  f.flushEvents();
  assert.equal(f.title(active), 'Cut');
  active.disable();
  assert.equal(f.dictionaries.size, 0);
  assert.equal(active.layer.children.length, 0);
  assert.equal(f.timers.size, 0);
});

test('native textarea cut shows 已剪切, not 已复制, and an empty Ctrl+X adds nothing', async t => {
  const f = fixture(t);
  const active = f.enable();
  const input = { nodeType: 1, tagName: 'TEXTAREA', value: 'preCUTpost', selectionStart: 3, selectionEnd: 6 };
  f.document.activeElement = input;
  await f.clipboard.writeText('normal copy');
  assert.equal(f.title(active), '已复制');
  f.emit('cut', { target: input });
  f.flushEvents();
  assert.equal(f.title(active), '已剪切');
  assert.equal(active.layer.children.length, 2);
  input.selectionEnd = input.selectionStart;
  f.emit('cut', { target: input });
  f.flushEvents();
  assert.equal(active.layer.children.length, 2);
});

test('editor-managed textarea cut renders one localized 已剪切 toast', t => {
  const f = fixture(t);
  const active = f.enable();
  const input = { nodeType: 1, tagName: 'TEXTAREA', value: 'preCUTpost', selectionStart: 3, selectionEnd: 6 };
  f.document.activeElement = input;
  let payload = '';
  const data = {
    get types() { return payload ? ['text/plain'] : []; },
    getData() { return payload; },
    setData(type, text) { payload = text; },
    clearData() { payload = ''; },
  };
  f.emit('cut', { target: input, clipboardData: data }, event => {
    event.defaultPrevented = true;
    event.clipboardData.setData('text/plain', 'CUT');
    input.value = 'prepost';
    input.selectionStart = input.selectionEnd = 3;
  });
  f.flushEvents();
  assert.equal(active.layer.children.length, 1);
  assert.equal(f.title(active), '已剪切');
});

test('已剪切 still works with the built-in Chinese fallback without locale', t => {
  const f = fixture(t, { locale: false });
  const active = f.enable();
  f.emit('cut');
  f.flushEvents();
  assert.equal(f.title(active), '已剪切');
  assert.equal(active.layer.children.length, 1);
});

test('optional locale fallback follows html lang without the locale service', async t => {
  const f = fixture(t, { locale: false });
  const active = f.enable();
  await f.clipboard.writeText('hello');
  assert.equal(f.title(active), '已复制');
  f.setLanguage('en-US');
  await f.clipboard.writeText('hello again');
  assert.equal(f.title(active), 'Copied');
});

test('empty writes, empty DOM actions and untrusted events add no toast', async t => {
  const f = fixture(t);
  const active = f.enable();
  await f.clipboard.writeText('');
  await f.clipboard.write([]);
  f.setSelection('');
  f.emit('copy');
  f.flushEvents();
  assert.equal(active.layer.children.length, 0);
  f.setSelection('selected');
  for (const listener of f.document.listeners.get('copy')) listener({ isTrusted: false, target: f.document.body });
  f.flushEvents();
  assert.equal(active.layer.children.length, 0);
});

test('layer remount keeps one watcher and does not replay copies while no layer existed', async t => {
  const f = fixture(t);
  const active = f.enable();
  active.unmount();
  assert.equal(f.document.listeners.get('copy').length, 1);
  await f.clipboard.writeText('while absent');
  active.mount();
  assert.equal(active.layer.children.length, 0);
  await f.clipboard.writeText('after remount');
  assert.equal(active.layer.children.length, 1);
});

test('queued DOM event from old activation never creates a toast after re-enable', async t => {
  const f = fixture(t);
  const first = f.enable();
  f.emit('copy');
  first.disable();
  const second = f.enable();
  f.flushEvents();
  assert.equal(second.layer.children.length, 0);
  f.emit('copy');
  f.flushEvents();
  assert.equal(second.layer.children.length, 1);
});

test('pending old API promise stays silent when the cached module is re-enabled', async t => {
  const f = fixture(t);
  let resolveWrite;
  const original = f.Clipboard.prototype.writeText;
  f.Clipboard.prototype.writeText = function () { return new Promise(resolve => { resolveWrite = resolve; }); };
  const first = f.enable();
  const pending = f.clipboard.writeText('pending');
  first.disable();
  const second = f.enable();
  resolveWrite();
  await pending;
  assert.equal(second.layer.children.length, 0);
  second.disable();
  f.Clipboard.prototype.writeText = original;
});

test('retained third-party wrappers plus repeated re-enable still give exactly one toast per copy', async t => {
  const f = fixture(t);
  let active = f.enable();
  for (let i = 0; i < 4; i++) {
    const saved = f.Clipboard.prototype.writeText;
    const wrapper = function () { return saved.apply(this, arguments); };
    f.Clipboard.prototype.writeText = wrapper;
    active.disable();
    assert.equal(f.Clipboard.prototype.writeText, wrapper);
    active = f.enable();
    await f.clipboard.writeText('copy ' + i);
    assert.equal(active.layer.children.length, 1);
  }
  active.disable();
  assert.equal(f.document.listeners.get('copy').length, 0);
  assert.equal(f.document.listeners.get('cut').length, 0);
  assert.equal(f.timers.size, 0);
});

test('ordinary disable restores the exact original API methods and removes both listeners', t => {
  const f = fixture(t);
  const before = Object.getOwnPropertyDescriptors(f.Clipboard.prototype);
  const active = f.enable();
  active.disable();
  assert.deepEqual(Object.getOwnPropertyDescriptors(f.Clipboard.prototype), before);
  assert.equal(f.document.listeners.get('copy').length, 0);
  assert.equal(f.document.listeners.get('cut').length, 0);
});
