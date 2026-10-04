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
let resizeObservers=0;
const observers=new Set();
globalThis.ResizeObserver=window.ResizeObserver=class {
  constructor(callback){this.callback=callback;this.targets=new Set();}
  observe(target){if(!this.targets.has(target)){this.targets.add(target);resizeObservers++;}observers.add(this);}
  disconnect(){resizeObservers-=this.targets.size;this.targets.clear();observers.delete(this);}
};
// JSDOM has no layout. These explicit rectangles exercise positioning and
// observer/event wiring, not real viewport geometry or browser painting.
let anchorBox={left:430,top:600,width:120,height:28}, panelBox={width:256,height:94};
const nativeRect=HTMLElement.prototype.getBoundingClientRect;
HTMLElement.prototype.getBoundingClientRect=function(){
  return this.matches('.dsh-reasoning-trigger') ? {...anchorBox,right:anchorBox.left+anchorBox.width,bottom:anchorBox.top+anchorBox.height} : nativeRect.call(this);
};
for(const [property,dimension] of [['offsetWidth','width'],['offsetHeight','height']]){
  const descriptor=Object.getOwnPropertyDescriptor(HTMLElement.prototype,property);
  Object.defineProperty(HTMLElement.prototype,property,{configurable:true,get(){return this.matches('.dsh-reasoning-panel') ? panelBox[dimension] : descriptor.get.call(this);}});
}
const runtime = 'D:/Code/dsh/.scratch/dsh-asar/extracted/dsh/node_modules/@deepseek-ai/';
const assets = runtime + 'dsh-web-frontend/dist/assets/';
// Exercise the installed theme's supported branch. JSDOM does not evaluate
// @supports or compute/paint corner-shape; rule matching is not a pixel test.
const themeSource=fs.readFileSync(runtime+'dsh-client-ui-theme/lib/client.js','utf8');
const cornerCSS=JSON.parse(themeSource.match(/var corner_shape_css_default = ("[^\n]+?");/)[1]);
assert.match(cornerCSS,/superellipse\(1\.5\)/);
const themeStyle=document.createElement('style');
themeStyle.textContent=cornerCSS.slice(cornerCSS.indexOf('{')+1,-1);
document.head.append(themeStyle);
const outside=document.createElement('span'); outside.id='outside'; document.body.append(outside);
const { modules } = await import('../.scratch/reasoning-host-seed.mjs');
const React = modules.react, ReactDOM = modules['react-dom'];
const { Context, Service } = modules['@deepseek-ai/cordis'];
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
const plugin = load(new URL('../packages/dsh-reasoning-slider/lib/client.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ctx = new Context();
const errors = [];
const originalConsoleError = console.error;
console.error = (...args) => { errors.push(args.map(String).join(' ')); originalConsoleError(...args); };
ctx.plugin(renderer);
await new Promise(resolve => setImmediate(resolve));
const locale = new LocaleRuntime(ctx, undefined, { preference: 'zh', languages: ['zh'] });
ctx.provide('locale', locale);
ctx.slots.installLocale(locale);
HTMLElement.prototype.setPointerCapture = function() {};
const selected = { provider: 'test', model: 'test-model', reasoningEffort: 'high' };
const levelIds = ['off', 'low', 'high', 'provider-max'];
const groups = [{ id: 'test', name: 'Test provider', models: [{ id: 'test-model', name: 'Test model', reasoning: {
  defaultEffort: 'high', efforts: levelIds.map(id => ({ id, name: id }))
} }] }];
groups[0].models.push({id:'plain',name:'Plain'}, {id:'single',name:'One level',reasoning:{efforts:[{id:'vendor-only',name:'Only'}]}}, {id:'short',name:'Short',reasoning:{defaultEffort:'vendor-light',efforts:[{id:'vendor-light',name:'Light'},{id:'vendor-top',name:'Top'}]}});
groups.push({id:'other',name:'Other provider',models:[{id:'test-model',name:'Duplicate model ID',reasoning:{defaultEffort:'other-level',efforts:[{id:'other-level',name:'Other'}]}}]});
const projected = createSnapshotStore({ next: selected });
const sessionScope = ctx.extend();
const binding = { key: 'offline-session', ctx: sessionScope, hooks: {}, keyedHooks: {}, props: {},
  session: { projections: { faceOf: () => projected }, getSnapshot: () => ({ blank: true }) } };
const sourceBinding = createSnapshotStore(binding);
ctx.slots.installScope('session', { current: sourceBinding, bindingSource: () => sourceBinding, renderArea: (_binding, props) => props.children });
ctx.provide('sessions', { scope: () => sessionScope, binding: () => binding, subagentAddress: () => undefined });
let outcome = 'success', release, activeCalls=0, peakCalls=0; const calls = [];
const remoteSession = { modelCatalog: async () => ({ ok: true, value: { groups, failures: [], default: selected } }),
  selectModel: async ({ sessionId, ...next }) => {
    calls.push(next); peakCalls=Math.max(peakCalls,++activeCalls);
    try {
      if (outcome === 'wait') await new Promise(r => release = r);
      if (outcome === 'fail') return {ok:false,error:{code:'test',message:'Rejected offline'}};
      if (outcome === 'throw') throw new Error('Transport offline');
      projected.set({ next }); return { ok: true };
    } finally { activeCalls--; }
  } };
// Match the host's associated namespace lookup. Root-provided plain objects
// hide missing consumer injections when a session directory is first created.
class Remote extends Service {
  constructor(scope) { super(scope, 'remote'); }
  $on() { return () => {}; }
}
await ctx.plugin(Remote);
await ctx.plugin({ name: 'session-namespace-fixture', apply(scope) { scope.provide('remote.session', remoteSession); } });
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
const q = s => document.querySelector(s);
const flush = async fn => { ReactDOM.flushSync(fn ?? (() => {})); await new Promise(r => setTimeout(r, 12)); };
const click = s => flush(() => q(s).click());
const key = async (node, value) => {
  let native;
  await flush(() => { const event=new KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true}); native=node.dispatchEvent(event); });
  // JSDOM has no native range keyboard default; perform it only when not prevented.
  if(native && node.type==='range' && !node.disabled && ['Home','End','ArrowRight','ArrowLeft','ArrowUp','ArrowDown'].includes(value)) {
    const next=value==='Home'?0:value==='End'?Number(node.max):Math.max(0,Math.min(Number(node.max),Number(node.value)+(['ArrowRight','ArrowUp'].includes(value)?1:-1)));
    await input(node,next);
  }
};
const pointer = (node,type) => flush(() => { const e = new MouseEvent(type,{button:0,bubbles:true,cancelable:true}); Object.defineProperties(e,{pointerId:{value:1},isPrimary:{value:true}}); node.dispatchEvent(e); });
const input = (node,value) => flush(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,String(value)); node.dispatchEvent(new Event('input',{bubbles:true})); });
// Record intermediate mutations as well as the final DOM: a fast RPC can
// disable/re-enable text and remove/recreate an icon before a final snapshot.
const watchEffortChrome = () => {
  const trigger=q('.dsh-reasoning-trigger'), arrow=trigger.lastElementChild;
  const link=q('.dsh-reasoning-model-link'), label=q('.dsh-reasoning-label');
  const opacity=getComputedStyle(link).opacity, changes=[];
  assert.equal(arrow.tagName.toLowerCase(),'svg');
  const observer=new MutationObserver(records=>changes.push(...records));
  observer.observe(trigger,{childList:true});
  observer.observe(link,{attributes:true,attributeFilter:['disabled'],attributeOldValue:true});
  return () => {
    changes.push(...observer.takeRecords()); observer.disconnect();
    assert.ok(trigger.lastElementChild===arrow,'effort saves retain the same chevron DOM node');
    assert.ok(!changes.some(change=>[...change.removedNodes].includes(arrow)),'even short saves never replace the chevron with loading content');
    assert.ok(!changes.some(change=>change.target===link),'text navigation never briefly becomes disabled during effort saves');
    assert.equal(link.disabled,false);
    assert.equal(getComputedStyle(link).opacity,opacity,'pending and settled text have the same opacity');
    assert.ok(q('.dsh-reasoning-label')===label,'header text node is retained');
    assert.equal(label.textContent,q('input[type=range]').getAttribute('aria-valuetext'),'header agrees with the current slider preview');
  };
};
assert.ok(q('.dsh-reasoning-trigger'), 'new component mounts through real Cordis renderer');
assert.equal(calls.length,0);
await click('.dsh-reasoning-trigger');
let range = q('input[type=range]'); let flow; const thumb = q('.dsh-reasoning-thumb');
assert.ok(range);
const popup=q('.dsh-reasoning-panel');
const openingAnchor={...anchorBox}, viewportWidth=window.innerWidth;
const centerAligned=()=>assert.equal(Number.parseFloat(popup.style.left)+panelBox.width/2,openingAnchor.left+openingAnchor.width/2,'popup stays centered on the opening anchor');
centerAligned();
assert.equal(Number.parseFloat(popup.style.top)+panelBox.height+8,anchorBox.top);
await flush(()=>{anchorBox.width=180;for(const observer of observers)observer.callback();}); centerAligned();
await flush(()=>{panelBox.width=280;panelBox.height=180;for(const observer of observers)observer.callback();}); centerAligned();
assert.equal(Number.parseFloat(popup.style.top)+panelBox.height+8,openingAnchor.top,'resized popup retains the opening anchor gap');
await flush(()=>{anchorBox.left=0;anchorBox.top=20;window.dispatchEvent(new Event('scroll'));});
centerAligned();
assert.equal(Number.parseFloat(popup.style.top)+panelBox.height+8,openingAnchor.top,'scrolling does not reposition the popup');
await flush(()=>{window.innerWidth=420;window.dispatchEvent(new Event('resize'));});
assert.equal(Number.parseFloat(popup.style.left)+panelBox.width,window.innerWidth-12,'right edge keeps the viewport gutter');
await flush(()=>{window.innerWidth=viewportWidth;anchorBox={...openingAnchor};panelBox={width:256,height:94};window.dispatchEvent(new Event('resize'));});
centerAligned();
const pageStyle=q('style[data-plugin="dsh-reasoning-slider-page"]');
assert.ok(pageStyle);
const hostStyle=q('style[data-plugin="dsh-reasoning-slider-host"]');
const roundRule=[...hostStyle.sheet.cssRules].find(rule=>rule.style?.getPropertyValue('corner-shape')==='round' && rule.selectorText.includes('*::after'));
assert.ok(roundRule,'explicit corner reset includes descendants and pseudo-elements');
for(const node of [thumb,q('.dsh-reasoning-track'),q('.dsh-reasoning-tick')]) assert.ok(node.matches(roundRule.selectorText),'round rule targets actual reference markup');
assert.equal(outside.matches(roundRule.selectorText),false,'theme outside the component is untouched');
assert.equal(getComputedStyle(thumb).borderRadius,'50%','reference circular radius is preserved');
assert.equal(getComputedStyle(q('.dsh-reasoning-panel')).overflow,'clip','popup decorations do not use an auto scrollport');
assert.equal(getComputedStyle(q('.dsh-reasoning-panel')).display,'flex','overflowing real content can shrink into its own scroller');
assert.equal(getComputedStyle(q('.dsh-reasoning-panel')).getPropertyValue('--surface').trim(),'#fff','exact reference light palette');
assert.equal(getComputedStyle(q('.dsh-reasoning-panel')).getPropertyValue('--dsw-alias-state-business-primary').trim(),'#3c83ff');
document.body.classList.add('dark');
assert.equal(getComputedStyle(q('.dsh-reasoning-panel')).getPropertyValue('--surface').trim(),'#282a2e','exact reference dark palette');
document.body.classList.remove('dark');
let assertChrome=watchEffortChrome();
await pointer(range,'pointerdown');
await input(range,3); flow=q('.dsh-reasoning-ultra-canvas'); assert.ok(flow);
assert.equal(calls.length,0,'drag only previews');
assert.equal(q('.dsh-reasoning-label').dataset.maximum,'true','arbitrary real maximum ID activates effect');
await pointer(range,'pointerup');
assertChrome();
assert.equal(calls.length,1);
assert.equal(calls[0].reasoningEffort,'provider-max');
assert.equal(q('input[type=range]'),range,'selection does not remount slider');
assert.equal(q('.dsh-reasoning-ultra-canvas'),flow,'effect node remains stable');
assert.equal(q('.dsh-reasoning-thumb'),thumb);
await pointer(range,'pointerdown'); await input(range,0); await pointer(range,'pointercancel');
assert.equal(calls.length,1); assert.equal(range.value,'3');
await pointer(range,'pointerdown'); await input(range,0); await key(range,'Escape'); await pointer(range,'pointerup');
assert.equal(calls.length,1,'escape cancels without submitting');
assert.equal(q('.dsh-reasoning-panel'),null,'Escape closes the popup, exactly as in the reference');
await click('.dsh-reasoning-trigger'); range=q('input[type=range]');
await flush(() => projected.set({next:{...selected,reasoningEffort:'low'}}));
await pointer(range,'pointerup');
assert.equal(calls.length,1,'external confirmed selection does not write a new selection'); assert.equal(range.value,'1');
await key(range,'End'); assert.equal(calls.at(-1).reasoningEffort,'provider-max');
assertChrome=watchEffortChrome();
outcome='fail'; await key(range,'Home');
assert.match(q('[role=alert]').textContent,/Rejected offline/);
assert.equal(range.value,'3','failed selection restores confirmed value');
assertChrome();
assertChrome=watchEffortChrome();
outcome='wait'; await key(range,'Home');
assert.equal(range.disabled,false,'pending effort selection must not block the next gesture');
assert.equal(q('.dsh-reasoning-trigger').getAttribute('aria-busy'),'true','saving remains honest until the RPC completes');
const count = calls.length;
await key(range,'End'); await key(range,'ArrowLeft'); await key(range,'ArrowLeft');
assert.equal(calls.length,count,'new efforts wait for the single active RPC');
assert.equal(range.value,'1','latest effort displays without waiting for the host');
outcome='success'; release(); await flush();
assert.equal(calls.length,count+1,'only the newest queued effort is submitted');
assert.equal(calls.at(-1).reasoningEffort,'low'); assert.equal(range.value,'1');
assert.equal(q('.dsh-reasoning-trigger').getAttribute('aria-busy'),'false');
assertChrome();
await flush(() => { range.focus(); range.dispatchEvent(new window.WheelEvent('wheel',{deltaY:-100,bubbles:true,cancelable:true})); });
assert.equal(calls.at(-1).reasoningEffort,'high');

// Returning to the original confirmed value still needs a second RPC after
// the active request has changed it. Intermediate queued efforts are omitted.
outcome='wait'; await key(range,'Home');
let before=calls.length; await key(range,'End'); await key(range,'ArrowLeft');
assert.equal(range.value,'2');
outcome='success'; release(); await flush();
assert.equal(calls.length,before+1); assert.equal(calls.at(-1).reasoningEffort,'high');
assert.equal(range.value,'2');

// Returning to the already in-flight effort cancels an unsent choice.
outcome='wait'; await key(range,'Home'); before=calls.length;
await key(range,'End'); await key(range,'Home');
outcome='success'; release(); await flush();
assert.equal(calls.length,before); assert.equal(range.value,'0');

// A delayed acknowledgement cannot reset an active drag or steal its focus.
outcome='wait'; await key(range,'End');
await pointer(range,'pointerdown'); await pointer(range,'pointermove'); await input(range,1);
range.focus(); outcome='success'; release(); await flush();
assert.equal(range.value,'1'); assert.equal(q('.dsh-reasoning-slider').dataset.dragging,'true');
assert.equal(document.activeElement,range);
await pointer(range,'pointerup'); assert.equal(calls.at(-1).reasoningEffort,'low');

// The queue must survive an earlier rejection, but a final failure rolls back
// to the actual confirmed value and remains visible to the user.
outcome='wait'; await key(range,'End'); await key(range,'Home');
before=calls.length; outcome='fail'; release(); await flush();
assert.equal(calls.length,before+1); assert.equal(range.value,'1');
assert.match(q('[role=alert]').textContent,/Rejected offline/);
assert.equal(q('.dsh-reasoning-trigger').getAttribute('aria-busy'),'false');
outcome='throw'; await key(range,'End');
assert.match(q('[role=alert]').textContent,/Transport offline/);
assert.equal(range.disabled,false); assert.equal(range.value,'1');
assert.equal(q('.dsh-reasoning-trigger').getAttribute('aria-busy'),'false');
outcome='success'; await key(range,'End'); assert.equal(range.value,'3');
assert.equal(q('[role=alert]'),null);

outcome='wait'; await key(range,'Home'); await key(range,'End');
before=calls.length; release(); await flush();
assert.equal(calls.length,before+1,'the latest queued effort starts after the first acknowledgement');
assert.equal(projected.getSnapshot().next.reasoningEffort,'off');
assert.equal(range.value,'3','first acknowledgement does not snap back the optimistic latest value');
assert.equal(q('.dsh-reasoning-trigger').getAttribute('aria-busy'),'true','pending lasts until the final actual response');
outcome='fail'; release(); await flush();
assert.equal(range.value,'0','last failure restores the last successful selection, not the initial selection');
assert.match(q('[role=alert]').textContent,/Rejected offline/);
outcome='success'; await key(range,'End');
assert.equal(peakCalls,1,'queued efforts never race real host RPCs');

// Navigation stays available while effort writes serialize. Model mutations
// remain blocked for both pointer clicks and search Enter, then resume on ack.
outcome='wait'; await key(range,'Home'); before=calls.length;
await click('.dsh-reasoning-model-link');
assert.equal(document.querySelectorAll('[role=menuitemradio]:disabled').length,5);
await click('[role=menuitemradio]'); await key(q('.dsh-reasoning-search'),'Enter');
assert.equal(calls.length,before,'opening the menu never races a model write with an effort save');
outcome='success'; release(); await flush();
assert.equal(document.querySelectorAll('[role=menuitemradio]:disabled').length,0);
await key(q('.dsh-reasoning-search'),'Escape'); range=q('input[type=range]');

// Small catalogs have no search input. Their pending menu still needs a focus
// target for Escape instead of dropping keyboard focus onto document.body.
outcome='wait'; await key(range,'End');
const directory=ctx.modelDirectories.directoryFor('offline-session');
await flush(()=>directory.store.update(state=>{state.groups=[{...groups[0],models:[groups[0].models[0]]}];}));
await click('.dsh-reasoning-model-link');
assert.equal(q('.dsh-reasoning-search'),null);
assert.ok(document.activeElement===q('.dsh-reasoning-panel'),'pending non-searchable menu retains keyboard focus');
await key(document.activeElement,'Escape'); assert.ok(q('input[type=range]'));
outcome='success'; release(); await flush(); range=q('input[type=range]');
await click('.dsh-reasoning-model-link');
assert.equal(q('.dsh-reasoning-header'),null,'model menu has no title/back header');
assert.equal(document.querySelectorAll('[role=menuitemradio]').length,5,'only actual catalog models are listed');
assert.ok(!q('.dsh-reasoning-model-list').textContent.includes('默认'));
await click('.dsh-reasoning-search');
await flush(() => { const search=q('.dsh-reasoning-search'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(search,'Duplicate'); search.dispatchEvent(new Event('input',{bubbles:true})); });
assert.equal(document.querySelectorAll('[role=menuitemradio]').length,1);
await click('[role=menuitemradio]');
assert.deepEqual(calls.at(-1),{provider:'other',model:'test-model',reasoningEffort:'other-level'});
assert.ok(q('input[type=range]').disabled);
assert.equal(q('.dsh-reasoning-label').dataset.maximum,'true','one-level model still marks its advertised maximum');
await click('.dsh-reasoning-model-link');
await flush(() => { const search=q('.dsh-reasoning-search'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(search,'One level'); search.dispatchEvent(new Event('input',{bubbles:true})); });
await click('[role=menuitemradio]');
assert.deepEqual(calls.at(-1),{provider:'test',model:'single'},'no invented default effort');
assert.equal(q('.dsh-reasoning-slider').dataset.unknown,'true');
assert.equal(q('input[type=range]').disabled,false,'unknown single effort can be selected');
await key(q('input[type=range]'),'Home');
assert.equal(calls.at(-1).reasoningEffort,'vendor-only');
await flush(() => projected.set({next:{provider:'test',model:'plain'}}));
assert.equal(q('input[type=range]'),null,'model without reasoning has no fake slider');
await flush(() => projected.set({next:selected}));
assert.ok(q('input[type=range]'));
await click('.dsh-reasoning-model-link');
await key(q('[role=menuitemradio]'),'Escape'); assert.ok(q('input[type=range]'));
await click('.dsh-reasoning-trigger');
assert.equal(q('.dsh-reasoning-panel'),null);
assert.deepEqual(errors,[]);
const styleText=q('style[data-plugin="dsh-reasoning-slider"]').textContent;
assert.match(styleText,/@media \(prefers-reduced-motion:reduce\)/);
assert.match(styleText,/animation:none !important; transition:none !important/);
await click('.dsh-reasoning-trigger');
outcome='wait'; await key(q('input[type=range]'),'End');
await key(q('input[type=range]'),'Home'); before=calls.length;
assert.ok(q('.dsh-reasoning-panel'));
await sliderFiber.dispose(); await flush();
assert.equal(q('.dsh-reasoning-panel'),null,'disable removes open portal during submission');
outcome='success'; release(); await flush();
assert.equal(calls.length,before,'disable discards unsent effort changes');
assert.equal(q('.dsh-reasoning-panel'),null,'late completion cannot revive disabled UI');
assert.ok(q('#subscription'),'disable restores existing -10 occupant');
assert.equal(q('style[data-plugin="dsh-reasoning-slider"]'),null);
assert.equal(q('style[data-plugin="dsh-reasoning-slider-page"]'),null);
assert.equal(q('style[data-plugin="dsh-reasoning-slider-host"]'),null);
assert.equal(resizeObservers,0,'popup content positioning observations are disposed');
await subscriptionFiber.dispose(); await flush();
assert.ok(q('#original'),'disable both restores official occupant');
unmount(); await ctx.fiber.dispose(); dom.window.close();
console.log('PASS: reference view with explicit host adapters / installed loader, renderer, directory, gestures, queued efforts, pending/failure, stable effects, disposal');
