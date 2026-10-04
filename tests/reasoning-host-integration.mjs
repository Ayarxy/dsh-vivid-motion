import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(new URL('./reasoning-runtime/package.json', import.meta.url));
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html lang="zh"><head></head><body><div id="root"></div></body></html>', { url: 'http://offline.invalid/' });
for (const name of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'HTMLInputElement', 'MutationObserver', 'Event', 'MouseEvent', 'KeyboardEvent', 'navigator']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom.window : dom.window[name] });
}
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
globalThis.requestAnimationFrame = fn => setTimeout(fn, 0);
globalThis.cancelAnimationFrame = clearTimeout;
HTMLElement.prototype.scrollIntoView = function() {};
const runtime = 'D:/Code/dsh/.scratch/dsh-asar/extracted/dsh/node_modules/@deepseek-ai/';
const assets = runtime + 'dsh-web-frontend/dist/assets/';
const source = fs.readFileSync(assets + 'index-5SrrfWpU.js', 'utf8');
// Keep the installed shell's complete static module table, omit its app bootstrap.
const seedSource = source.slice(0, source.indexOf('const oM="data-window-drag"'))
  .replace('from"./vendor-CCJJTK99.js"', `from ${JSON.stringify(pathToFileURL(assets + 'vendor-CCJJTK99.js').href)}`)
  + '\nexport const modules = rM();\n';
const seedFile = new URL('../.scratch/reasoning-host-seed.mjs', import.meta.url);
fs.writeFileSync(seedFile, seedSource);
const { modules } = await import(seedFile.href);
const React = modules.react, ReactDOM = modules['react-dom'];
const { Context } = modules['@deepseek-ai/cordis'];
const { createSnapshotStore } = modules['@deepseek-ai/dsh-client-store'];
const h = React.createElement;
function load(file) {
  let registration;
  window.__ModuleLoader__ = { load(value) { registration = value; } };
  vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
  return registration.factory(name => { assert.ok(name in modules, `missing seed: ${name}`); return modules[name]; });
}
const renderer = load(runtime + 'dsh-client-ui-renderer/lib/client.js');
const { LocaleRuntime } = load(runtime + 'dsh-client-locale/lib/client.js');
const official = load(runtime + 'dsh-client-ui-model-selection/lib/client.js');
const plugin = load(new URL(process.argv.includes('--served') ? '../.scratch/reasoning-currently-served.js' : '../packages/dsh-reasoning-slider/lib/client.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ctx = new Context();
const errors = [];
const originalConsoleError = console.error;
console.error = (...args) => { errors.push(args.map(String).join(' ')); originalConsoleError(...args); };
ctx.plugin(renderer);
await new Promise(resolve => setImmediate(resolve));
const locale = new LocaleRuntime(ctx, undefined, { preference: 'zh', languages: ['zh'] });
ctx.provide('locale', locale);
ctx.slots.installLocale(locale);
const selected = { provider: 'test', model: 'test-model', reasoningEffort: 'high' };
const levelIds = process.argv.includes('--deepseek') ? ['off', 'low', 'high', 'max'] : ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
const groups = [{ id: 'test', name: 'Test provider', models: [{ id: 'test-model', name: 'Test model', reasoning: {
  defaultEffort: 'high', efforts: levelIds.map(id => ({ id, name: id }))
} }] }];
const projected = createSnapshotStore({ next: selected });
const sessionScope = ctx.extend();
const binding = { key: 'offline-session', ctx: sessionScope, hooks: {}, keyedHooks: {}, props: {},
  session: { projections: { faceOf: () => projected }, getSnapshot: () => ({ blank: true }) } };
const sourceBinding = createSnapshotStore(binding);
ctx.slots.installScope('session', { current: sourceBinding, bindingSource: () => sourceBinding, renderArea: (_binding, props) => props.children });
ctx.provide('sessions', { scope: () => sessionScope, binding: () => binding, subagentAddress: () => undefined });
const remoteSession = { modelCatalog: async () => ({ ok: true, value: { groups, failures: [], default: selected } }),
  selectModel: async ({ sessionId, ...next }) => { projected.set({ next }); return { ok: true }; } };
ctx.provide('remote', { session: remoteSession, $on: () => () => {} });
ctx.provide('remote.session', remoteSession);
ctx.plugin(official.ModelDirectoryResolver);
ctx.slots.register({ name: 'root', children: { 'conversation.input.model': { kind: 'single', scope: 'session' } } },
  function Root({ renderSlot }) { return renderSlot('conversation.input.model', { locked: false }); });
ctx.slots.register({ name: 'conversation.input.model' }, () => h('button', { id: 'original' }, 'Original model picker'));
// The installed dsh-codex-subscription 2.5.1 already occupies this same slot at -10.
const subscription = { name: 'subscription-fixture', inject: ['slots'], apply(scope) {
  scope.slots.register({ name: 'conversation.input.model', priority: -10 }, () => h('button', { id: 'subscription' }, 'Subscription model picker'));
} };
const subscriptionFirst = !process.argv.includes('--subscription-last');
let subscriptionFiber = subscriptionFirst ? ctx.plugin(subscription) : undefined;
const sliderFiber = ctx.plugin(plugin);
await new Promise(resolve => setImmediate(resolve));
subscriptionFiber ??= ctx.plugin(subscription);
ctx.slots._core.onEntryError((key, entry, error) => errors.push(`${key}: ${error.message}`));
await new Promise(resolve => setImmediate(resolve));
const unmount = ctx.get('uiRenderer').mount(document.getElementById('root'));
await new Promise(resolve => setTimeout(resolve, 30));
console.log('rendered:', document.body.textContent);
console.log('entries:', ctx.slots._core.inventory?.() ?? ctx.slots.entries('conversation.input.model').map(entry => ({ priority: entry.options.priority, registrant: entry.registrant })));
assert.ok(document.querySelector('.dsh-reasoning-trigger'), 'slider trigger must mount through the real host renderer');
ReactDOM.flushSync(() => document.querySelector('.dsh-reasoning-trigger').click());
await new Promise(resolve => setTimeout(resolve, 30));
assert.ok(document.querySelector('input[type=range]'), 'slider must open using the real host primitives');
const range = document.querySelector('input[type=range]');
ReactDOM.flushSync(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(range, String(levelIds.length - 1));
  range.dispatchEvent(new Event('input', { bubbles: true }));
});
await new Promise(resolve => setTimeout(resolve, 30));
assert.equal(projected.getSnapshot().next.reasoningEffort, levelIds.at(-1));
assert.equal(document.querySelector('.dsh-reasoning-slider').dataset.maximum, 'true');
assert.equal(document.querySelector('.dsh-reasoning-label').dataset.maximum, 'true');
assert.ok(document.querySelector('.dsh-reasoning-ultra-canvas'), 'the actual maximum effort must mount the effect through the host renderer');
assert.equal(document.querySelector('input[type=range]'), range, 'host submission must retain the slider');
assert.deepEqual(errors, [], 'the host must not silently retire the custom slot after a render error');
ReactDOM.flushSync(() => document.querySelector('.dsh-reasoning-trigger').click());
await sliderFiber.dispose();
await new Promise(resolve => setTimeout(resolve, 30));
assert.ok(document.querySelector('#subscription'), 'disabling the slider must restore the existing subscription picker');
assert.equal(document.querySelector('style[data-plugin="dsh-reasoning-slider"]'), null);
await subscriptionFiber.dispose();
await new Promise(resolve => setTimeout(resolve, 30));
assert.ok(document.querySelector('#original'), 'disabling both replacements must restore the official picker');
unmount();
await ctx.fiber.dispose();
dom.window.close();
console.log('Installed host static modules + Cordis + renderer integration passed.');
