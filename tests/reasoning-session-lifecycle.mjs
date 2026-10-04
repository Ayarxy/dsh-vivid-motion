// Offline regression: real Cordis service association and per-session directory
// creation, using the production entry unchanged. No running DSH is contacted.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(new URL('./reasoning-runtime/package.json', import.meta.url));
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html lang="zh"><head></head><body><div id="root"></div></body></html>', { url: 'http://offline.invalid/' });
for (const name of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'HTMLInputElement', 'MutationObserver', 'Event', 'MouseEvent', 'KeyboardEvent', 'navigator']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom.window : dom.window[name] });
}
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
globalThis.requestAnimationFrame = fn => setTimeout(fn, 0);
globalThis.cancelAnimationFrame = clearTimeout;
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
HTMLElement.prototype.scrollIntoView = function() {};

const runtime = 'D:/Code/dsh/.scratch/dsh-asar/extracted/dsh/node_modules/@deepseek-ai/';
const { modules } = await import('../.scratch/reasoning-host-seed.mjs');
const React = modules.react, ReactDOM = modules['react-dom'];
const { Context, Service } = modules['@deepseek-ai/cordis'];
const { createSnapshotStore } = modules['@deepseek-ai/dsh-client-store'];
const h = React.createElement;
function load(file) {
  let registration;
  window.__ModuleLoader__ = { load(value) { registration = value; } };
  vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: String(file) });
  return registration.factory(name => { assert.ok(name in modules, `missing seed: ${name}`); return modules[name]; });
}
const renderer = load(runtime + 'dsh-client-ui-renderer/lib/client.js');
const { LocaleRuntime } = load(runtime + 'dsh-client-locale/lib/client.js');
const official = load(runtime + 'dsh-client-ui-model-selection/lib/client.js');
const plugin = load(new URL('../packages/dsh-reasoning-slider/lib/client.js', import.meta.url));
const ctx = new Context();
const errors = [], consoleErrors = [];
const originalConsoleError = console.error;
console.error = (...args) => consoleErrors.push(args.map(String).join(' '));
const flush = async fn => { ReactDOM.flushSync(fn ?? (() => {})); await new Promise(r => setTimeout(r, 25)); };
await ctx.plugin(renderer);
const locale = new LocaleRuntime(ctx, undefined, { preference: 'zh', languages: ['zh'] });
ctx.provide('locale', locale);
ctx.slots.installLocale(locale);
const selected = { provider: 'fixture', model: 'model', reasoningEffort: 'low' };
const groups = [{ id: 'fixture', name: 'Fixture provider', models: [{ id: 'model', name: 'Fixture model', reasoning: {
  defaultEffort: 'low', efforts: ['low', 'high', 'max'].map(id => ({ id, name: id }))
} }] }];
const sessions = new Map();
function createSession(id, ready = true) {
  const fiber = ctx.plugin(function sessionScope() {});
  const projected = createSnapshotStore(ready ? { next: selected } : undefined);
  const binding = { key: id, ctx: fiber.ctx, hooks: {}, keyedHooks: {}, props: {},
    session: { projections: { faceOf: () => projected }, getSnapshot: () => ({ blank: id !== 'old' }) } };
  const record = { fiber, projected, binding };
  sessions.set(id, record);
  return record;
}
const initial = createSession('startup', false);
const sourceBinding = createSnapshotStore(initial.binding);
ctx.slots.installScope('session', { current: sourceBinding, bindingSource: () => sourceBinding, renderArea: (_binding, props) => props.children });
ctx.provide('sessions', {
  scope: id => sessions.get(id)?.binding.ctx,
  binding: id => sessions.get(id)?.binding,
  subagentAddress: () => undefined
});
const calls = [];
let resolveCatalog, catalog;
const remoteSession = {
  modelCatalog: () => catalog ? Promise.resolve(catalog) : new Promise(resolve => { resolveCatalog = resolve; }),
  selectModel: async ({ sessionId, ...next }) => {
    calls.push({ sessionId, ...next });
    sessions.get(sessionId).projected.set({ next });
    return { ok: true };
  }
};
// Real Cordis association and a separately owned namespace are essential:
// plain objects or root-provided namespaces hide the missing dependency.
class Remote extends Service {
  constructor(scope) { super(scope, 'remote'); }
  $on() { return () => {}; }
}
await ctx.plugin(Remote);
const namespacePlugin = { name: 'session-namespace-fixture', apply(scope) { scope.provide('remote.session', remoteSession); } };
let namespaceFiber;
ctx.plugin(official.ModelDirectoryResolver);
ctx.slots._core.onEntryError((key, entry, error, info) => {
  errors.push({ key, priority: entry.options.priority, message: error.message, stack: error.stack, ...info });
});
let sliderFiber = await ctx.plugin(plugin);
ctx.slots.register({ name: 'root', children: { 'conversation.input.model': { kind: 'single', scope: 'session' } } },
  function Root({ renderSlot }) { return renderSlot('conversation.input.model', { locked: false }); });
await ctx.plugin({ name: 'official-seat-fixture', inject: ['slots', 'modelDirectories', 'sessions', 'remote', 'remote.session'], apply(scope) {
  const models = scope.modelDirectories;
  // Match the official entry's real directoryFor call, including cache creation
  // when the native fallback is elected after the custom entry crashes.
  scope.slots.register({ name: 'conversation.input.model', inject: sessionId => {
    const directory = models.directoryFor(sessionId);
    return { directory: directory.store };
  } }, () => h('button', { id: 'original' }, 'Original model picker'));
} });
const unmount = ctx.get('uiRenderer').mount(document.getElementById('root'));
const q = s => document.querySelector(s);
function assertVisible(expected, phase) {
  assert.deepEqual(errors, [], phase + ': no slot errors or abdication');
  assert.deepEqual(consoleErrors, [], phase + ': no hidden render errors');
  assert.equal(!!q('.dsh-reasoning-trigger'), expected, phase);
  assert.equal(!!q('#original'), !expected, phase);
}
const effort = () => q('.dsh-reasoning-trigger-effort')?.textContent;
const slotEntries = () => ctx.slots.entries('conversation.input.model');
const sliderEntry = () => slotEntries().find(entry => entry.options.priority === -20);
const click = selector => flush(() => q(selector).click());
const input = value => flush(() => {
  const range = q('input[type=range]');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(range, String(value));
  range.dispatchEvent(new Event('input', { bubbles: true }));
});
try {
  await flush();
  assert.equal(sliderEntry(), undefined, 'wait for the remote namespace without registering an unusable entry');
  namespaceFiber = await ctx.plugin(namespacePlugin);
  await flush();
  assertVisible(true, 'cold startup before catalog/history');
  const originalEntry = sliderEntry();
  await flush(() => {
    catalog = { ok: true, value: { groups, failures: [], default: selected } };
    resolveCatalog(catalog);
  });
  assertVisible(true, 'catalog ready while history is pending');
  await flush(() => initial.projected.set({ next: selected }));
  assert.equal(effort(), 'low');

  // No toggle, fallback or directory prewarming between these transitions.
  const old = createSession('old', false);
  await flush(() => sourceBinding.set(old.binding));
  assertVisible(true, 'unseen old session with history pending');
  await flush(() => old.projected.set({ next: { ...selected, reasoningEffort: 'high' } }));
  assert.equal(effort(), 'high');
  await click('.dsh-reasoning-trigger');
  assert.equal(q('input[type=range]').value, '1', 'old session uses its own selection');
  const fresh = createSession('new');
  await flush(() => sourceBinding.set(fresh.binding));
  assertVisible(true, 'new session after old session');
  assert.equal(q('.dsh-reasoning-panel'), null, 'session switch cleans up the old popup');
  assert.equal(effort(), 'low');
  await click('.dsh-reasoning-trigger');
  await input(1);
  assert.deepEqual(calls, [{ sessionId: 'new', ...selected, reasoningEffort: 'high' }], 'selection targets only the active session');
  await flush(() => sourceBinding.set(initial.binding));
  assertVisible(true, 'return to the initial session');
  assert.equal(effort(), 'low', 'another session selection does not leak into the initial session');
  assert.equal(sliderEntry(), originalEntry, 'session navigation keeps the original registration alive');

  // Reopening an evicted session must create a fresh directory even for the same ID.
  await old.fiber.dispose();
  const reopened = createSession('old');
  await flush(() => sourceBinding.set(reopened.binding));
  assertVisible(true, 'new generation of an evicted session');
  assert.equal(effort(), 'low', 'the disposed generation cannot supply stale selection');

  // Namespace replacement uses Cordis dependency lifecycles without a manual toggle.
  await namespaceFiber.dispose();
  await flush();
  assert.equal(sliderEntry(), undefined, 'namespace unload removes its dependent entry');
  assert.equal(q('.dsh-reasoning-trigger'), null);
  namespaceFiber = await ctx.plugin(namespacePlugin);
  await flush();
  assertVisible(true, 'namespace reload restores the entry automatically');
  assert.equal(slotEntries().filter(entry => entry.options.priority === -20).length, 1);

  await click('.dsh-reasoning-trigger');
  await sliderFiber.dispose();
  await flush();
  assertVisible(false, 'disabling restores the native entry');
  assert.equal(q('.dsh-reasoning-panel'), null);
  assert.equal(q('style[data-plugin^="dsh-reasoning-slider"]'), null);
  sliderFiber = await ctx.plugin(plugin);
  await flush();
  assertVisible(true, 're-enabling restores exactly one slider entry');
  assert.equal(slotEntries().filter(entry => entry.options.priority === -20).length, 1);
  assert.equal(calls.length, 1, 'navigation and reload never submit a model selection');
  console.log('PASS: cold startup, deferred namespace, old/new sessions, generation disposal, selection isolation, namespace reload and plugin toggle');
} finally {
  unmount();
  await ctx.fiber.dispose();
  console.error = originalConsoleError;
  dom.window.close();
}
