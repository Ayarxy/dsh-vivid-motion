import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(new URL('./reasoning-runtime/package.json', import.meta.url));
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html lang="zh"><body><div id="root"></div></body></html>');
for (const name of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'HTMLInputElement', 'Event', 'MouseEvent', 'KeyboardEvent']) globalThis[name] = dom.window[name];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react'), { act } = React, { createRoot } = require('react-dom/client');
const q = selector => document.querySelector(selector);
const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
const observers = new Set(), mediaListeners = new Set(), animations = new Set();
let reduced = false, anchorBox, modelHeight, root;
window.matchMedia = () => ({ get matches() { return reduced; },
  addEventListener: (_, listener) => mediaListeners.add(listener), removeEventListener: (_, listener) => mediaListeners.delete(listener) });
globalThis.ResizeObserver = class {
  constructor(callback) { this.callback = callback; this.targets = new Set(); observers.add(this); }
  observe(target) { this.targets.add(target); }
  disconnect() { this.targets.clear(); observers.delete(this); }
};
// Model the browser's interpolated WAAPI height separately from the natural
// content size. These controlled rectangles/keyframes are not a pixel test.
function valueAt(animation, property) {
  const position = Math.min(1, animation.currentTime / animation.options.duration) * (animation.keyframes.length - 1);
  const index = Math.min(animation.keyframes.length - 2, Math.floor(position));
  const first = parseFloat(animation.keyframes[index][property]);
  const last = parseFloat(animation.keyframes[index + 1][property]);
  return first + (last - first) * (position - index);
}
HTMLElement.prototype.animate = function(keyframes, options) {
  const animation = { node: this, keyframes, options, currentTime: 0, onfinish: null,
    cancel() { animations.delete(this); this.cancelled = true; },
    finish() { this.currentTime = options.duration; this.onfinish?.(); }
  };
  animations.add(animation);
  return animation;
};
const active = node => [...animations].find(animation => animation.node === node);
const contentHeight = node => node.querySelector('.dsh-reasoning-model-list') ? modelHeight : 77;
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() {
  if (this.matches('.dsh-reasoning-content')) return contentHeight(this);
  if (this.matches('.dsh-reasoning-panel')) return active(this) ? valueAt(active(this), 'height') : contentHeight(this) + 17;
  return 0;
} });
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return this.matches('.dsh-reasoning-panel') ? 256 : 0; } });
HTMLElement.prototype.getBoundingClientRect = function() {
  return this.matches('.dsh-reasoning-trigger') ? { ...anchorBox, right: anchorBox.left + anchorBox.width, bottom: anchorBox.top + anchorBox.height } : { top: 0, left: 0, width: 0, height: 0 };
};
HTMLElement.prototype.scrollIntoView = function() { this.closest('.dsh-reasoning-model-list')?.dispatchEvent(new Event('scroll')); };
let registration;
window.__ModuleLoader__ = { load: module => registration = module };
vm.runInThisContext(fs.readFileSync('packages/dsh-reasoning-slider/lib/client.js', 'utf8').replace('return { apply, inject: ["slots"] };', 'return {ModelPicker};'));
const { ModelPicker } = registration.factory(name => require(name));
const efforts = ['low', 'high', 'maximum'].map(id => ({ id, name: id }));
const state = { groups: [{ id: 'fixture', name: 'Fixture', models: Array.from({ length: 6 }, (_, n) => ({ id: 'model-' + n, name: 'Model ' + n, reasoning: { efforts, defaultEffort: 'high' } })) }],
  current: { provider: 'fixture', model: 'model-4', reasoningEffort: 'high' }, pending: null, failures: [], status: 'ready' };
const directory = { subscribe: () => () => {}, getSnapshot: () => state };
async function click(selector) { await act(async () => q(selector).click()); }
async function escape() { await act(async () => q('.dsh-reasoning-panel').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))); }
async function mount({ still = false, left = 430, top = 600, listHeight = 333 } = {}) {
  reduced = still; anchorBox = { left, top, width: 120, height: 28 }; modelHeight = listHeight;
  root = createRoot(q('#root'));
  await act(async () => root.render(React.createElement(React.StrictMode, null, React.createElement(ModelPicker, { directory, load() {}, select: async () => ({ ok: true }), available: true, locked: false }))));
  await click('.dsh-reasoning-trigger');
}
async function unmount() {
  await act(async () => root.unmount());
  assert.equal(animations.size, 0, 'all animations cancelled on unmount');
  assert.equal(observers.size, 0, 'all positioning observers disconnected');
  assert.equal(mediaListeners.size, 0, 'motion preference listeners removed');
}
function advance(ms) { for (const animation of [...animations]) animation.currentTime = Math.min(animation.options.duration, animation.currentTime + ms); }

test('opening anchor stays fixed through label/composer movement and is refreshed on reopen', async () => {
  await mount();
  const panel = q('.dsh-reasoning-panel'), content = q('.dsh-reasoning-content');
  const left = panel.style.left, top = panel.style.top;
  await act(async () => {
    anchorBox = { left: 510, top: 510, width: 220, height: 40 };
    for (const observer of observers) observer.callback([{ target: content }]);
    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));
  });
  assert.equal(panel.style.left, left, 'label width and horizontal movement do not shift the popup');
  assert.equal(panel.style.top, top, 'composer movement does not shift the popup');
  await click('.dsh-reasoning-model-link');
  assert.equal(panel.style.left, left, 'pane switching keeps the opening center');
  for (const frame of active(panel).keyframes) closeTo(parseFloat(frame.top) + parseFloat(frame.height), 592);
  await click('.dsh-reasoning-trigger');
  await click('.dsh-reasoning-trigger');
  const reopened = q('.dsh-reasoning-panel');
  closeTo(parseFloat(reopened.style.left) + 128, anchorBox.left + anchorBox.width / 2);
  closeTo(parseFloat(reopened.style.top) + 94 + 8, anchorBox.top);
  await unmount();
});

test('model menu rises with a damped rebound, fixed bottom edge, full-size text and immediate keyboard focus', async () => {
  await mount();
  const panel = q('.dsh-reasoning-panel'), content = q('.dsh-reasoning-content');
  assert.equal(animations.size, 0, 'first popup open retains the reference entrance');
  await click('.dsh-reasoning-model-link');
  assert.equal(q('.dsh-reasoning-panel'), panel, 'the shell is retained');
  const shell = active(panel), entrance = active(content);
  assert.ok(shell && entrance, 'both shell and list animate');
  assert.equal(shell.keyframes[0].top, '498px'); assert.equal(shell.keyframes[0].height, '94px');
  assert.equal(shell.keyframes.at(-1).top, '242px'); assert.equal(shell.keyframes.at(-1).height, '350px');
  for (const frame of shell.keyframes) closeTo(parseFloat(frame.top) + parseFloat(frame.height), 592);
  const heights = shell.keyframes.map(frame => parseFloat(frame.height));
  assert.ok(Math.max(...heights) > 350 && Math.max(...heights) < 356, 'small spring overshoot');
  for (const frame of entrance.keyframes) assert.match(frame.transform, /^translateY\(/, 'content is never scaled');
  assert.equal(entrance.keyframes[0].transform, 'translateY(12px)');
  assert.equal(entrance.keyframes[0].opacity, 0); assert.equal(entrance.keyframes.at(-1).opacity, 1);
  assert.equal(document.activeElement, q('input[type=search]'), 'focus does not wait for animation');
  assert.ok([...q('[role=menu]').querySelectorAll('button')].every(button => !button.disabled));
  await act(async () => shell.finish());
  assert.equal(animations.size, 0); assert.equal(panel.style.height, '', 'auto layout restored');
  await unmount();
});

test('rapid return preserves displayed height, position and outward velocity before settling', async () => {
  await mount(); await click('.dsh-reasoning-model-link');
  const panel = q('.dsh-reasoning-panel'), first = active(panel);
  advance(67);
  const top = valueAt(first, 'top'), height = valueAt(first, 'height');
  // Choosing the already-selected model must work during entry, not after it.
  await click('[aria-checked=true]');
  const reverse = active(panel);
  assert.ok(first.cancelled && reverse !== first);
  closeTo(parseFloat(reverse.keyframes[0].top), top); closeTo(parseFloat(reverse.keyframes[0].height), height);
  assert.ok(parseFloat(reverse.keyframes[1].height) > height, 'in-flight velocity survives reversal');
  assert.equal(reverse.keyframes.at(-1).height, '94px');
  assert.equal(document.activeElement, q('input[type=range]'));
  await act(async () => reverse.finish());
  assert.equal(animations.size, 0); assert.equal(panel.style.top, '498px');
  await unmount();
});

test('content resizing retargets continuously; list scroll and focus do not cancel entry', async () => {
  await mount(); await click('.dsh-reasoning-model-link');
  const panel = q('.dsh-reasoning-panel'), content = q('.dsh-reasoning-content'), first = active(panel), entrance = active(content);
  advance(61);
  const height = valueAt(first, 'height');
  await act(async () => {
    // The first ResizeObserver delivery can arrive after a quick click.
    for (const observer of observers) observer.callback([{ target: content }]);
    q('[role=menu]').dispatchEvent(new Event('scroll'));
    q('[aria-checked=true]').scrollIntoView();
  });
  assert.equal(active(panel), first, 'unchanged content observations and internal scrolling keep the shell animation');
  await act(async () => { modelHeight += 40; for (const observer of observers) observer.callback([{ target: content }]); });
  const resized = active(panel);
  assert.ok(first.cancelled && resized !== first);
  closeTo(parseFloat(resized.keyframes[0].height), height);
  assert.equal(resized.keyframes.at(-1).height, '390px');
  assert.equal(active(content), entrance, 'retargeting does not restart or drop the fade');
  await act(async () => { anchorBox.top -= 40; window.dispatchEvent(new Event('scroll')); });
  assert.equal(active(panel), resized, 'external scrolling does not interrupt the shell animation');
  assert.equal(active(content), entrance);
  assert.equal(panel.style.top, '202px', 'content resizes around the original anchor');
  await unmount();
});

test('initial edge avoidance and viewport resizing use the opening anchor', async () => {
  await mount({ left: 0 });
  assert.equal(q('.dsh-reasoning-panel').style.left, '12px');
  await unmount();
  const width = window.innerWidth, height = window.innerHeight;
  await mount({ left: width - 40 });
  try {
    const panel = q('.dsh-reasoning-panel');
    closeTo(parseFloat(panel.style.left) + 256, width - 12);
    await act(async () => {
      anchorBox.left = 0; anchorBox.top = 20;
      window.innerWidth = 400; window.innerHeight = 300;
      window.dispatchEvent(new Event('resize'));
    });
    closeTo(parseFloat(panel.style.left) + 256, 388);
    closeTo(parseFloat(panel.style.top) + 94, 288);
    await act(async () => {
      window.innerWidth = width; window.innerHeight = height;
      window.dispatchEvent(new Event('resize'));
    });
    closeTo(parseFloat(panel.style.left) + 256, width - 12);
    assert.equal(panel.style.top, '498px', 'window growth restores placement around the opening anchor');
  } finally {
    window.innerWidth = width; window.innerHeight = height;
    await unmount();
  }
});

test('rebound respects the top gutter and below-anchor fallback', async () => {
  await mount({ listHeight: 563 }); await click('.dsh-reasoning-model-link');
  for (const frame of active(q('.dsh-reasoning-panel')).keyframes) {
    assert.ok(parseFloat(frame.top) >= 12); closeTo(parseFloat(frame.top) + parseFloat(frame.height), 592);
  }
  await unmount();
  await mount({ top: 20 }); await click('.dsh-reasoning-model-link');
  for (const frame of active(q('.dsh-reasoning-panel')).keyframes) {
    assert.equal(parseFloat(frame.top), 56); assert.ok(parseFloat(frame.height) + 56 < window.innerHeight - 12);
  }
  await unmount();
});

test('reduced motion snaps immediately, including when enabled during entry', async () => {
  await mount({ still: true }); await click('.dsh-reasoning-model-link');
  assert.equal(animations.size, 0); assert.equal(q('.dsh-reasoning-panel').style.top, '242px');
  await unmount();
  await mount(); await click('.dsh-reasoning-model-link'); advance(60);
  assert.equal(animations.size, 2);
  await act(async () => { reduced = true; for (const listener of mediaListeners) listener(); });
  assert.equal(animations.size, 0); assert.equal(q('.dsh-reasoning-panel').style.top, '242px');
  assert.equal(document.activeElement, q('input[type=search]'));
  await unmount();
});

test('close/reopen and unmount cancel old effects; a late completion cannot touch the new popup', async () => {
  await mount(); await click('.dsh-reasoning-model-link'); advance(55);
  const old = active(q('.dsh-reasoning-panel')), finish = old.onfinish;
  await click('.dsh-reasoning-trigger');
  assert.equal(animations.size, 0); assert.equal(observers.size, 0); assert.equal(q('.dsh-reasoning-panel'), null);
  await click('.dsh-reasoning-trigger'); await click('.dsh-reasoning-model-link');
  const next = active(q('.dsh-reasoning-panel'));
  finish(); assert.equal(active(q('.dsh-reasoning-panel')), next);
  await unmount();
  window.dispatchEvent(new Event('resize')); window.dispatchEvent(new Event('scroll'));
  assert.equal(animations.size, 0); assert.equal(q('.dsh-reasoning-panel'), null);
});
