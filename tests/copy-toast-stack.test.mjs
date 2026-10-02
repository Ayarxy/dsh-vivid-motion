// Deterministic DOM/WAAPI regression tests; no browser or clipboard access.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

const sourcePath = new URL('../packages/dsh-copy-toast/lib/client.js', import.meta.url);
const source = fs.readFileSync(sourcePath, 'utf8').replace(
  'exports.TOAST = TOAST;',
  'exports.TOAST = TOAST; exports.__test = { createToastStack, spring, toKeyframes, CSS };',
);

function fixture(t, { reduce = false } = {}) {
  let now = 0;
  let nextTimer = 0;
  const timers = new Map();
  const animations = [];
  const mediaListeners = new Set();
  const setTimer = (fn, delay) => {
    const id = ++nextTimer;
    timers.set(id, { fn, at: now + Number(delay) });
    return id;
  };
  const clearTimer = id => timers.delete(id);
  const advance = ms => {
    const target = now + ms;
    for (;;) {
      const next = [...timers.entries()].filter(([, timer]) => timer.at <= target)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      now = next[1].at;
      timers.delete(next[0]);
      next[1].fn();
    }
    now = target;
  };
  class EventTarget {
    listeners = new Map();
    addEventListener(type, fn) {
      const list = this.listeners.get(type) || [];
      list.push(fn);
      this.listeners.set(type, list);
    }
    removeEventListener(type, fn) {
      this.listeners.set(type, (this.listeners.get(type) || []).filter(value => value !== fn));
    }
    dispatch(type, event = {}) {
      for (const fn of [...(this.listeners.get(type) || [])]) fn(event);
    }
  }
  class Element extends EventTarget {
    constructor(tag) {
      super();
      this.tagName = tag.toUpperCase();
      this.nodeType = 1;
      this.children = [];
      this.parentNode = null;
      this.style = {};
      this.attributes = {};
      this.animations = [];
      this.offsetHeight = 44;
      this.offsetWidth = 124;
      this.captured = null;
    }
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
    removeChild(child) {
      this.children.splice(this.children.indexOf(child), 1);
      child.parentNode = null;
      return child;
    }
    contains(node) { for (; node; node = node.parentNode) if (node === this) return true; return false; }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    setPointerCapture(id) {
      if (this.captureFails) throw new Error('capture unavailable');
      if (!this.captureIgnored) this.captured = id;
    }
    hasPointerCapture(id) { return this.captured === id; }
    releasePointerCapture(id) {
      if (this.captured === id) {
        this.captured = null;
        this.dispatch('lostpointercapture', { pointerId: id });
      }
    }
    animate(keyframes, options) {
      let resolveFinished;
      let rejectFinished;
      let promise;
      const animation = {
        keyframes, options, playState: 'running', sample: keyframes[0],
        get finished() {
          promise ||= new Promise((resolve, reject) => { resolveFinished = resolve; rejectFinished = reject; });
          if (this.playState === 'finished') resolveFinished();
          return promise;
        },
        cancel() { this.playState = 'idle'; if (rejectFinished) rejectFinished(new Error('AbortError')); },
        finish() { this.playState = 'finished'; if (resolveFinished) resolveFinished(); },
      };
      this.animations.push(animation);
      animations.push(animation);
      return animation;
    }
  }
  class Matrix {
    constructor(value = 'none') {
      this.a = this.d = 1;
      this.e = this.f = 0;
      let match = /translate3d\(([-.\d]+)px,\s*([-.\d]+)px,\s*0\)/.exec(value);
      if (match) { this.e = +match[1]; this.f = +match[2]; }
      match = /translateX\(([-.\d]+)px\)/.exec(value);
      if (match) this.e = +match[1];
      match = /translateY\(([-.\d]+)px\)/.exec(value);
      if (match) this.f = +match[1];
      match = /scale\(([-.\d]+)(?:,\s*([-.\d]+))?\)/.exec(value);
      if (match) { this.a = +match[1]; this.d = +(match[2] ?? match[1]); }
    }
  }
  function computed(element) {
    const values = {
      transform: element.style.transform || 'none',
      opacity: element.style.opacity || '1',
      filter: element.style.filter || 'none',
    };
    for (const animation of element.animations) {
      const active = animation.playState === 'running';
      const filled = animation.playState === 'finished' && ['forwards', 'both'].includes(animation.options.fill);
      const frame = active ? animation.sample : filled ? animation.keyframes.at(-1) : null;
      if (frame) for (const key of ['transform', 'opacity', 'filter']) if (key in frame) values[key] = String(frame[key]);
    }
    return values;
  }
  let registration;
  const document = new EventTarget();
  document.createElement = tag => new Element(tag);
  let hit = null;
  document.elementFromPoint = () => hit;
  const media = {
    matches: reduce,
    addEventListener: (_, fn) => mediaListeners.add(fn),
    removeEventListener: (_, fn) => mediaListeners.delete(fn),
  };
  vm.runInNewContext(source, {
    window: { __ModuleLoader__: { load: value => { registration = value; } }, matchMedia: () => media },
    document, performance: { now: () => now },
    setTimeout: setTimer, clearTimeout: clearTimer,
    getComputedStyle: computed, DOMMatrixReadOnly: Matrix, console,
  }, { filename: sourcePath.pathname });
  const mod = registration.factory(spec => { assert.equal(spec, 'react'); return {}; });
  const container = new Element('div');
  const stack = mod.__test.createToastStack(container);
  t.after(() => stack.dispose());
  const pointer = (x, extra = {}) => ({ pointerId: 1, clientX: x, clientY: 100, pointerType: 'mouse', button: 0, isPrimary: true, ...extra });
  const entered = async item => { item.enterAnim.finish(); await Promise.resolve(); assert.equal(item.entered, true); };
  const finishAnimations = async () => { for (const anim of animations) if (anim.playState === 'running') anim.finish(); await Promise.resolve(); };
  return {
    mod, container, stack, document, timers, animations, mediaListeners, computed, advance, pointer, entered, finishAnimations,
    show: title => stack.show(title || 'Copied'),
    setHit: element => { hit = element; },
    mediaChange(value) { for (const fn of mediaListeners) fn({ matches: value }); },
  };
}

const drag = (f, item, distance) => {
  item.t.dispatch('pointerdown', f.pointer(100));
  item.t.dispatch('pointermove', f.pointer(100 + distance));
  item.t.dispatch('pointerup', f.pointer(100 + distance));
};

test('small drag settles at rest instead of exposing its old offset/stretch', async t => {
  const f = fixture(t);
  const item = f.show();
  await f.entered(item);
  drag(f, item, 40);
  const back = item.motionAnim;
  assert.match(back.keyframes[0].transform, /translate3d\(40\.00px,0\.00px,0\)/);
  assert.match(back.keyframes.at(-1).transform, /translate3d\(0\.00px,0\.00px,0\) scale\(1\.0000,1\.0000\)/);
  back.finish();
  await Promise.resolve();
  assert.equal(f.computed(item.t).transform, 'none');
  assert.equal(f.computed(item.t).opacity, '1');
  assert.equal(f.computed(item.t).filter, 'none');
  assert.equal(item.closing, false);
});

test('re-grab cancels old snap-back and continues from its visual position', async t => {
  const f = fixture(t);
  const item = f.show();
  await f.entered(item);
  drag(f, item, 40);
  const back = item.motionAnim;
  back.sample = { transform: 'translate3d(25px,0px,0) scale(1,1)', opacity: 1, filter: 'blur(0px)' };
  item.t.dispatch('pointerdown', f.pointer(100));
  item.t.dispatch('pointermove', f.pointer(110));
  assert.equal(back.playState, 'idle');
  assert.equal(item.motionAnim, null);
  assert.match(f.computed(item.t).transform, /translate3d\(35px,0px,0\)/);
  item.t.dispatch('pointerup', f.pointer(110));
});

test('entrance interruption preserves the visual translation and cancels its effect', t => {
  const f = fixture(t);
  const item = f.show();
  const entry = item.enterAnim;
  entry.sample = { transform: 'translate3d(0px,20px,0) scale(.9,1.1)', opacity: .75, filter: 'blur(3px)' };
  item.t.dispatch('pointerdown', f.pointer(100));
  item.t.dispatch('pointermove', f.pointer(115));
  assert.equal(entry.playState, 'idle');
  assert.equal(item.entered, true);
  assert.match(item.t.style.transform, /translate3d\(15px,20px,0\)/);
  item.t.dispatch('pointercancel', f.pointer(115));
  assert.equal(item.closing, false);
  assert.equal(item.motionAnim.keyframes.at(-1).filter, 'blur(0.00px)');
});

test('pointerup while hovered stays paused, then mouseleave resumes the remainder', async t => {
  const f = fixture(t);
  const item = f.show();
  await f.entered(item);
  f.advance(300);
  f.setHit(item.t);
  item.t.dispatch('mouseenter');
  assert.equal(item.remaining, 1700);
  drag(f, item, 0);
  assert.equal(item.hovered, true);
  assert.equal(item.timer, null);
  f.advance(4000);
  assert.equal(item.closing, false);
  f.setHit(null);
  item.t.dispatch('mouseleave');
  f.advance(1699);
  assert.equal(item.closing, false);
  f.advance(1);
  assert.equal(item.closing, true);
});

test('mouseleave during a held drag does not restart the timer', async t => {
  const f = fixture(t);
  const item = f.show();
  await f.entered(item);
  item.t.dispatch('mouseenter');
  item.t.dispatch('pointerdown', f.pointer(100));
  item.t.dispatch('mouseleave');
  f.advance(3000);
  assert.equal(item.timer, null);
  assert.equal(item.closing, false);
  item.t.dispatch('pointerup', f.pointer(120));
  assert.notEqual(item.timer, null);
});

for (const type of ['pointercancel', 'lostpointercapture']) {
  test(`${type} beyond the discard threshold cancels instead of flinging`, async t => {
    const f = fixture(t);
    const item = f.show();
    await f.entered(item);
    item.t.dispatch('pointerdown', f.pointer(100));
    item.t.dispatch('pointermove', f.pointer(180));
    item.t.dispatch(type, f.pointer(180));
    assert.equal(item.dragging, false);
    assert.equal(item.closing, false);
    assert.notEqual(item.timer, null);
    assert.equal(item.exitTimer, null);
    f.advance(2000);
    assert.equal(item.closing, true);
  });
}

test('final pointerup movement is handled even without pointermove', async t => {
  const f = fixture(t);
  const item = f.show();
  await f.entered(item);
  item.t.dispatch('pointerdown', f.pointer(100));
  item.t.dispatch('pointerup', f.pointer(180));
  assert.equal(item.closing, true);
  assert.equal(item.slot.style.pointerEvents, 'none');
  assert.equal(item.t.style.pointerEvents, 'none');
});

test('secondary buttons, nonprimary touches and extra pointers cannot steal a drag', async t => {
  const f = fixture(t);
  const item = f.show();
  await f.entered(item);
  item.t.dispatch('pointerdown', f.pointer(100, { button: 2 }));
  assert.equal(item.dragging, false);
  item.t.dispatch('pointerdown', f.pointer(100, { isPrimary: false }));
  assert.equal(item.dragging, false);
  item.t.dispatch('pointerdown', f.pointer(100));
  item.t.dispatch('pointerdown', f.pointer(300, { pointerId: 2 }));
  item.t.dispatch('pointerup', f.pointer(300, { pointerId: 2 }));
  assert.equal(item.dragging, true);
  item.t.dispatch('pointerup', f.pointer(130));
  assert.equal(item.dragging, false);
  assert.equal(item.closing, false);
});

test('document fallback finishes an outside release when pointer capture fails', async t => {
  const f = fixture(t);
  const item = f.show();
  await f.entered(item);
  item.t.captureFails = true;
  item.t.dispatch('pointerdown', f.pointer(100));
  assert.equal(f.document.listeners.get('pointerup').length, 1);
  f.document.dispatch('pointermove', f.pointer(120));
  f.document.dispatch('pointerup', f.pointer(120));
  assert.equal(item.dragging, false);
  assert.equal(item.closing, false);
  assert.equal(f.document.listeners.get('pointerup').length, 0);
});

test('a silently ignored capture request also uses the document fallback', async t => {
  const f = fixture(t);
  const item = f.show();
  await f.entered(item);
  item.t.captureIgnored = true;
  item.t.dispatch('pointerdown', f.pointer(100));
  assert.equal(item.t.hasPointerCapture(1), false);
  assert.equal(f.document.listeners.get('pointerup').length, 1);
  f.document.dispatch('pointermove', f.pointer(120));
  f.document.dispatch('pointerup', f.pointer(120));
  assert.equal(item.dragging, false);
  assert.equal(item.closing, false);
  assert.equal(f.document.listeners.get('pointerup').length, 0);
});

test('hidden fourth slot is click-through and expanded gaps are a real hover region', t => {
  const f = fixture(t);
  const items = Array.from({ length: 4 }, () => f.show());
  const hidden = items[0];
  assert.equal(hidden.slot.style.opacity, '0');
  assert.equal(hidden.slot.style.pointerEvents, 'none');
  assert.equal(hidden.t.style.pointerEvents, 'none');
  assert.equal(hidden.slot.attributes['aria-hidden'], 'true');
  assert.equal(f.container.style.pointerEvents, 'none');
  f.container.dispatch('mouseenter');
  assert.equal(f.container.style.width, '124px');
  assert.equal(f.container.style.height, '212px');
  assert.equal(f.container.style.pointerEvents, 'auto');
  assert.equal(hidden.slot.style.opacity, '1');
  assert.equal(hidden.slot.attributes['aria-hidden'], 'false');
  items[3].t.dispatch('mouseleave', { relatedTarget: f.container });
  assert.equal(f.container.style.pointerEvents, 'auto');
  f.container.dispatch('mouseleave', { relatedTarget: new Object() });
  assert.equal(f.container.style.width, '0px');
  assert.equal(f.container.style.height, '0px');
  assert.equal(hidden.slot.style.pointerEvents, 'none');
});

test('full stack retirement releases an active drag and ignores closing nodes', async t => {
  const f = fixture(t);
  const item = f.show();
  await f.entered(item);
  item.t.dispatch('pointerdown', f.pointer(100));
  for (let i = 0; i < 4; i++) f.show();
  assert.equal(item.closing, true);
  assert.equal(item.dragging, false);
  assert.equal(item.t.captured, null);
  assert.equal(item.slot.style.pointerEvents, 'none');
  f.advance(220);
  assert.equal(f.container.children.length, 4);
});

test('dispose cancels every owned animation/timer/listener, including outgoing and dragging nodes', async t => {
  const f = fixture(t);
  const first = f.show();
  await f.entered(first);
  drag(f, first, 80);
  const second = f.show();
  second.t.captureFails = true;
  second.t.dispatch('pointerdown', f.pointer(100));
  f.stack.dispose();
  await Promise.resolve();
  assert.equal(f.container.children.length, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(f.mediaListeners.size, 0);
  assert.equal(f.animations.filter(anim => anim.playState === 'running').length, 0);
  for (const listeners of f.document.listeners.values()) assert.equal(listeners.length, 0);
  for (const listeners of f.container.listeners.values()) assert.equal(listeners.length, 0);
  assert.equal(f.stack.show('after dispose'), null);
  f.stack.dispose();
});

test('reduced motion and a live preference change preserve drag/timer behavior', async t => {
  const f = fixture(t, { reduce: true });
  const item = f.show();
  assert.equal(item.enterAnim.options.duration, 1);
  assert.equal(item.iconAnim.options.delay, 0);
  await f.entered(item);
  drag(f, item, 40);
  assert.equal(item.motionAnim.options.duration, 1);
  item.motionAnim.finish();
  await Promise.resolve();
  assert.equal(f.computed(item.t).transform, 'none');
  f.mediaChange(false);
  const next = f.show();
  assert.ok(next.enterAnim.options.duration > 1);
});

test('spring keyframes have an exact start and velocity-free destination', t => {
  const f = fixture(t);
  const { spring, toKeyframes } = f.mod.__test;
  const sp = spring(52, 0, 520, 26);
  const frames = toKeyframes(sp, frame => ({ x: frame.x, velocity: frame.v }));
  assert.equal(frames[0].offset, 0);
  assert.equal(frames[0].x, 52);
  assert.equal(frames.at(-1).offset, 1);
  assert.equal(frames.at(-1).x, 0);
  assert.equal(frames.at(-1).velocity, 0);
  assert.ok(frames.every((frame, i) => i === 0 || frame.offset > frames[i - 1].offset));
});
