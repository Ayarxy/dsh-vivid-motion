import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

// Use the existing offline test dependencies; no DSH or system clipboard.
const require = createRequire(new URL('./reasoning-runtime/package.json', import.meta.url));
const { JSDOM } = require('jsdom');
const source = fs.readFileSync(new URL('../packages/dsh-copy-toast/lib/client.js', import.meta.url), 'utf8');

function fixture(t) {
  // DSH 0.2.0-rc.2: shell.overlay is a z=20 stacking context, while Modal
  // portals its full-screen mask to body at z=1000. Toast uses z=1100.
  // JSDOM checks DOM/CSS contracts and lifecycle, not painting or hit testing.
  const dom = new JSDOM(`<!doctype html><html lang="en"><head><style>
    #frame { position: relative; overflow: hidden; transform: translateZ(0); }
    #overlay { position: absolute; inset: 0; z-index: 20; pointer-events: none; }
    #overlay > * { pointer-events: auto; }
    .modal { position: fixed; inset: 0; z-index: 1000; }
    .mask { position: absolute; inset: 0; background: rgba(0,0,0,.4); }
  </style></head><body><div id="frame"><div id="overlay"></div></div></body></html>`, {
    url: 'https://offline.invalid/', runScripts: 'outside-only',
  });
  const view = dom.window, doc = view.document;
  const saved = new Map();
  for (const [key, value] of Object.entries({
    window: view, document: doc, navigator: view.navigator, IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const React = require('react'), ReactDOM = require('react-dom');
  const { createRoot } = require('react-dom/client');
  const { act } = React;
  const timers = new Map(), mediaListeners = new Set(), animations = [];
  let timerId = 0;
  view.setTimeout = (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; };
  view.clearTimeout = id => timers.delete(id);
  view.matchMedia = () => ({
    matches: false,
    addEventListener(type, listener) { mediaListeners.add(listener); },
    removeEventListener(type, listener) { mediaListeners.delete(listener); },
  });
  view.HTMLElement.prototype.animate = function () {
    const animation = {
      playState: 'running', finished: new Promise(() => {}),
      cancel() { this.playState = 'idle'; },
    };
    animations.push(animation);
    return animation;
  };
  view.eval(`window.Clipboard = class Clipboard { writeText() { return Promise.resolve(); } };
    Object.defineProperty(navigator, 'clipboard', { value: new Clipboard() });`);
  const clipboard = view.navigator.clipboard, nativeWriteText = clipboard.writeText;
  let plugin, Component;
  view.__ModuleLoader__ = { load(registration) {
    plugin = registration.factory(name => {
      if (name === 'react') return React;
      if (name === 'react-dom') return ReactDOM;
      throw new Error('Unexpected module: ' + name);
    });
  } };
  view.eval(source);
  const disposers = [];
  plugin.apply({
    effect(fn) { disposers.push(fn()); },
    slots: {
      inject(name, fn) { assert.equal(name, 'shell.overlay'); fn(); },
      register(options, component) { Component = component; },
    },
  });
  const root = createRoot(doc.querySelector('#overlay'));
  t.after(async () => {
    await act(async () => root.unmount());
    for (const dispose of disposers.reverse()) dispose();
    assert.equal(clipboard.writeText, nativeWriteText);
    dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return {
    doc, view, timers, mediaListeners, animations,
    styles: () => [...doc.querySelectorAll('style')].filter(node => node.textContent.includes('.dct-layer')),
    async render(enabled = true) {
      await act(async () => root.render(enabled
        ? React.createElement(React.StrictMode, null, React.createElement(Component)) : null));
    },
    async copy() { await act(async () => { await clipboard.writeText('copied from the open menu'); }); },
    flushAnnouncements() {
      for (const [id, timer] of [...timers]) if (timer.delay === 0) {
        timers.delete(id);
        timer.fn();
      }
    },
    menu() {
      const modal = doc.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = '<div class="mask"></div><div role="dialog"><button>Copy</button></div>';
      doc.body.append(modal);
      const button = modal.querySelector('button');
      button.focus();
      return { modal, button };
    },
  };
}

for (const menuFirst of [true, false]) {
  test(`toast escapes the shell stacking context when the menu opens ${menuFirst ? 'before' : 'after'} mount`, async t => {
    const f = fixture(t);
    let menu;
    if (menuFirst) menu = f.menu();
    await f.render();
    if (!menuFirst) menu = f.menu();
    await f.copy();

    const layer = f.doc.querySelector('.dct-layer');
    assert.ok(layer.parentElement === f.doc.body, 'the shell must not trap the toast below the body mask');
    const style = f.view.getComputedStyle(layer);
    assert.equal(style.position, 'fixed', 'viewport anchoring must survive escaping the frame');
    assert.ok(Number(style.zIndex) > Number(f.view.getComputedStyle(menu.modal).zIndex));
    assert.equal(style.bottom, '26px');
    assert.equal(style.left, '50%');
    assert.equal(style.pointerEvents, 'none', 'the layer must not cover menu controls with a hit target');
    assert.equal(style.width, '0px');
    assert.equal(style.height, '0px');
    assert.equal(layer.querySelector('.dct-title').textContent, 'Copied');
    assert.equal(f.view.getComputedStyle(layer.querySelector('.dct-toast')).pointerEvents, 'auto');
    assert.ok(f.doc.activeElement === menu.button, 'copy feedback must leave focus in the menu');
    assert.equal(f.styles().length, 1);

    await f.render();
    assert.ok(f.doc.querySelector('.dct-layer') === layer, 'rerender must retain the current toast');
    assert.equal(layer.querySelectorAll('.dct-toast').length, 1);
  });
}

test('slot unmount removes the portal, styles and effects; remount creates one clean stack', async t => {
  const f = fixture(t), menu = f.menu();
  for (let cycle = 0; cycle < 2; cycle++) {
    await f.render();
    assert.equal(f.doc.querySelectorAll('.dct-layer').length, 1);
    assert.equal(f.mediaListeners.size, 1, 'StrictMode must leave exactly one stack engine');
    await f.copy();
    const layer = f.doc.querySelector('.dct-layer');
    assert.equal(layer.querySelectorAll('.dct-toast').length, 1);
    assert.ok(f.timers.size > 0);
    assert.ok(f.animations.some(animation => animation.playState === 'running'));

    await f.render(false);
    assert.equal(f.doc.querySelector('.dct-layer'), null);
    assert.equal(layer.children.length, 0);
    assert.equal(f.styles().length, 0);
    assert.equal(f.mediaListeners.size, 0);
    assert.equal(f.timers.size, 0);
    assert.ok(f.animations.every(animation => animation.playState === 'idle'));
    assert.ok(menu.modal.isConnected);
    assert.ok(f.doc.querySelector('#overlay').isConnected);
    assert.equal(f.doc.activeElement, menu.button);
    await f.copy();
    assert.equal(f.doc.querySelector('.dct-layer'), null, 'an unmounted slot must not resurrect its portal');
  }
});

test('a persistent live region receives later updates, including repeated confirmations', async t => {
  const f = fixture(t), menu = f.menu();
  await f.render();
  const status = f.doc.querySelector('[role="status"]');
  assert.ok(status, 'mount the empty region before a copy occurs');
  assert.equal(status.textContent, '');
  assert.equal(status.getAttribute('aria-live'), 'polite');
  assert.equal(status.getAttribute('aria-atomic'), 'true');
  assert.equal(status.closest('[aria-hidden="true"]'), null);
  for (let copy = 0; copy < 2; copy++) {
    await f.copy();
    assert.ok(f.doc.querySelector('[role="status"]') === status);
    assert.equal(status.textContent, '', 'repeat messages first clear the old content');
    f.flushAnnouncements();
    assert.equal(status.textContent, 'Copied');
    assert.equal(f.doc.querySelectorAll('[role="status"]').length, 1);
    assert.equal(f.doc.querySelector('.dct-layer').getAttribute('aria-hidden'), 'true');
    assert.equal(f.doc.querySelector('.dct-toast').getAttribute('role'), null);
    assert.ok(f.doc.activeElement === menu.button);
  }
  await f.copy();
  await f.render(false);
  f.flushAnnouncements();
  assert.equal(f.doc.querySelector('[role="status"]'), null);
  assert.equal(status.textContent, '');
  assert.equal(f.timers.size, 0);
  await f.render();
  assert.equal(f.doc.querySelector('[role="status"]').textContent, '');
});
