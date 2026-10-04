import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

// Offline React 18 + DOM regression. No DSH process, network, or chat messages.
// Uses the installed host's real ModelDirectory and positioning/dismiss hooks;
// the host menu material and SVGs use small rendering adapters.
const require=createRequire(new URL('./reasoning-runtime/package.json',import.meta.url));
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><html lang="en"><body><div id="root"></div></body></html>',{url:'http://offline.invalid/'});
for(const name of ['window','document','HTMLElement','HTMLInputElement','Node','Element','Event','MouseEvent','KeyboardEvent','WheelEvent'])globalThis[name]=dom.window[name];
globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
HTMLElement.prototype.scrollIntoView=function(){};
HTMLElement.prototype.setPointerCapture=function(id){this.dataset.capture=String(id);};
const mediaListeners=new Set();
const media={matches:false,addEventListener(_event,fn){mediaListeners.add(fn);},removeEventListener(_event,fn){mediaListeners.delete(fn);}};
window.matchMedia=()=>media;
const React=require('react'),ReactDOM=require('react-dom'),{createRoot}=require('react-dom/client');
const {act}=React,h=React.createElement;
const primSource=fs.readFileSync(new URL('../.scratch/prim-index.js',import.meta.url),'utf8');
const extract=(name)=>{const start=primSource.indexOf('function '+name+'(');return primSource.slice(start,primSource.indexOf('//#endregion',start));};
const hostHooks=vm.runInNewContext(`
  ${extract('useAnchoredPosition')}
  ${extract('useDismissOnOutsidePointer')}
  ({useAnchoredPosition,useDismissOnOutsidePointer})
`,{...React,document,window,Node,overlayTopMargin:margin=>margin});
const primitives={...hostHooks,
  MenuSurface:React.forwardRef(function Surface({children,compact,...props},ref){return h('div',{...props,ref},children);}),
  StateDot:()=>h('span',{'aria-hidden':true},'…'),
  rankByName:(models,query)=>models.filter(model=>model.name.toLowerCase().includes(query.toLowerCase()))
};
for(const name of ['IconChevronDownOutlineRegular','IconChevronRightOutlineRegular','IconChevronLeftOutlineRegular','IconCheckOutlineRegular','IconRefreshOutlineRegular','IconDataOutlineRegular'])
  primitives[name]=props=>h('svg',{'aria-hidden':true,...props});

function store(initial){let value=initial;const listeners=new Set();return {getSnapshot:()=>value,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
  set(next){value=next;for(const listener of [...listeners])listener();},update(fn){const next={...value};fn(next);this.set(next);},listeners};}
let registration;
window.__ModuleLoader__={load(value){registration=value;}};
const modules={'react':React,'react-dom':ReactDOM,'react/jsx-runtime':require('react/jsx-runtime'),
  '@deepseek-ai/dsh-client-ui-primitives':primitives,'@deepseek-ai/cordis':{Service:class{}},
  '@deepseek-ai/dsh-client-store':{createSnapshotStore:store}};
vm.runInThisContext(fs.readFileSync(new URL('../.scratch/codex-reuse/dsh__node_modules__@deepseek-ai__dsh-client-ui-model-selection__lib__client.js',import.meta.url),'utf8'));
const {ModelDirectory}=registration.factory(name=>{assert.ok(name in modules,name);return modules[name];});
vm.runInThisContext(fs.readFileSync(new URL('../packages/dsh-reasoning-slider/lib/client.js',import.meta.url),'utf8'));
const plugin=registration.factory(name=>modules[name]);
const originalError=console.error,consoleErrors=[];
console.error=(...args)=>{consoleErrors.push(args.join(' '));originalError(...args);};
const levels=['low','medium','high','xhigh','max','ultra'].map(id=>({id,name:({low:'Light',xhigh:'Extra High'})[id]??id[0].toUpperCase()+id.slice(1)}));
const groups=[{id:'test-a',name:'Provider A',models:[
  {id:'render-model',name:'Rendering Model',reasoning:{efforts:levels,defaultEffort:'high'}},
  {id:'plain',name:'Plain Model'},
  {id:'no-default',name:'Explicit Only',reasoning:{efforts:[{id:'bespoke',name:'Bespoke'}]}},
  {id:'short',name:'Short Model',reasoning:{efforts:levels.slice(0,3),defaultEffort:'low'}}]},
  {id:'test-b',name:'Provider B',models:[{id:'render-model',name:'Rendering Model',reasoning:{efforts:levels.slice(0,2),defaultEffort:'low'}}]}];
const saved={provider:'test-a',model:'render-model',reasoningEffort:'high'};
const projected=store({next:saved});
const catalog={store:store({status:'ready',error:null,value:{groups,failures:[],default:saved}}),load:async()=>{},
  reasoningFor(selection){return groups.find(group=>group.id===selection.provider)?.models.find(model=>model.id===selection.model)?.reasoning;}};
const calls=[];let outcome='success',settle;
const sessions={async selectModel(selection){calls.push(selection);if(outcome==='wait')await new Promise(resolve=>{settle=resolve;});
  if(outcome==='error')return {ok:false,error:{code:'offline-test',message:'Simulated selection failure'}};
  const {sessionId,...next}=selection;projected.set({next});return {ok:true,value:undefined};}};
const directory=new ModelDirectory(sessions,'offline-session',()=>true,catalog,projected,()=>true);
let Component,props,root,disposers=[];
const scope={slots:{inject(_name,fn){disposers.push(fn());},register(spec,component){Component=component;props=spec.inject('offline-session');return()=>{};}},
  modelDirectories:{directoryFor:()=>directory},sessions:{subagentAddress:()=>undefined}};
plugin.apply({get:()=>null,effect(fn){disposers.push(fn());},inject(_names,fn){fn(scope);}});
const query=selector=>document.querySelector(selector);
async function click(selector){await act(async()=>{const el=typeof selector==='string'?query(selector):selector;assert.ok(el,'Missing click target '+selector);el.click();});}
async function key(element,key,extra={}){await act(async()=>element.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...extra})));}
async function pointer(element,type,id=1){await act(async()=>{const event=new MouseEvent(type,{bubbles:true,cancelable:true,button:0});Object.defineProperties(event,{pointerId:{value:id},isPrimary:{value:true}});element.dispatchEvent(event);});}
async function input(element,value){await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(element,String(value));element.dispatchEvent(new Event('input',{bubbles:true}));});}
async function open(){if(!query('.dsh-reasoning-panel'))await click('.dsh-reasoning-trigger');}
async function setSelection(next){await act(async()=>projected.set({next}));}
async function flush(){await act(async()=>{await new Promise(resolve=>setImmediate(resolve));});}

test('real React rendering, host directory synchronization, failures, and disposal',async(t)=>{
  await act(async()=>{root=createRoot(query('#root'));root.render(h(Component,{...props,locked:false}));});
  await t.test('mount is read-only and opens with the confirmed effort',async()=>{
    assert.equal(calls.length,0);assert.match(query('.dsh-reasoning-trigger').textContent,/Rendering Model.*High/);
    await open();assert.equal(query('input[type=range]').value,'2');assert.equal(document.activeElement,query('input[type=range]'));
    assert.equal(query('.dsh-reasoning-panel').textContent.includes('Default'),false);
  });
  await t.test('pointer drag previews several levels and submits just one host request',async()=>{
    const range=query('input[type=range]');await pointer(range,'pointerdown');await input(range,0);await input(range,4);
    assert.equal(calls.length,0);assert.equal(query('.dsh-reasoning-label').textContent,'Max');assert.equal(directory.store.getSnapshot().current.reasoningEffort,'high');
    await pointer(range,'pointerup');assert.equal(calls.length,1);assert.equal(calls[0].reasoningEffort,'max');
    assert.equal(directory.store.getSnapshot().current.reasoningEffort,'max');assert.equal(query('input[type=range]').value,'4');
    assert.equal(query('input[type=range]'),range,'confirmed effort must preserve the live slider DOM');
  });
  await t.test('pointer cancel rolls preview back without changing the host',async()=>{
    const range=query('input[type=range]');await pointer(range,'pointerdown',2);await input(range,0);await pointer(range,'pointercancel',2);
    assert.equal(calls.length,1);assert.equal(query('input[type=range]').value,'4');assert.equal(query('.dsh-reasoning-label').textContent,'Max');
  });
  await t.test('reset uses the model metadata, while failed selections retain confirmed effort',async()=>{
    await click('.dsh-reasoning-reset');assert.equal(calls.at(-1).reasoningEffort,'high');
    outcome='error';await input(query('input[type=range]'),5);assert.match(query('[role=alert]').textContent,/Simulated selection failure/);
    assert.equal(query('input[type=range]').value,'2');assert.equal(directory.store.getSnapshot().current.reasoningEffort,'high');outcome='success';
  });
  await t.test('pending submissions disable edits and external directory updates reach the picker',async()=>{
    outcome='wait';const count=calls.length;const range=query('input[type=range]');await input(range,1);
    assert.equal(calls.length,count+1);assert.equal(query('input[type=range]').disabled,true);
    assert.equal(query('input[type=range]'),range,'pending effort must not remount the slider');
    await act(async()=>{outcome='success';settle();});await flush();assert.equal(query('input[type=range]').disabled,false);
    assert.equal(query('input[type=range]'),range,'host acknowledgement must not remount the slider');
    await setSelection({...saved,reasoningEffort:'ultra'});assert.equal(query('input[type=range]').value,'5');assert.equal(query('.dsh-reasoning-slider').dataset.maximum,'true');
  });
  await t.test('model search handles duplicate model IDs across providers and no default entry',async()=>{
    await click('.dsh-reasoning-model-link');assert.equal(query('[role=menu]').querySelectorAll('button').length,5);
    assert.equal(query('.dsh-reasoning-menu-heading'),null);assert.equal(query('.dsh-reasoning-icon'),null);
    assert.equal(document.activeElement,query('input[type=search]'));assert.equal(query('[role=menu]').textContent.includes('Default'),false);
    await input(query('input[type=search]'),'Rendering');assert.equal(query('[role=menu]').querySelectorAll('button').length,2);
    await key(query('input[type=search]'),'ArrowDown');await key(query('input[type=search]'),'Enter');
    assert.equal(directory.store.getSnapshot().current.provider,'test-b');assert.equal(query('input[type=range]').max,'1');
  });
  await t.test('models without reasoning render an explanation and never get fake levels',async()=>{
    await click('.dsh-reasoning-model-link');await input(query('input[type=search]'),'Plain');await key(query('input[type=search]'),'Enter');
    assert.equal(query('input[type=range]'),null);assert.match(query('.dsh-reasoning-panel').textContent,/no reasoning levels/);
    assert.equal(directory.store.getSnapshot().current.reasoningEffort,undefined);
  });
  await t.test('unknown effort and absent provider default remain unselected until explicit input',async()=>{
    await setSelection({provider:'test-a',model:'no-default'});
    const count=calls.length;assert.equal(query('.dsh-reasoning-slider').dataset.unknown,'true');assert.equal(calls.length,count);
    await key(query('input[type=range]'),'ArrowRight');assert.equal(calls.at(-1).reasoningEffort,'bespoke');assert.equal(query('input[type=range]').disabled,true);
    await setSelection({...saved,reasoningEffort:'removed'});assert.equal(query('.dsh-reasoning-label').textContent,'removed');assert.equal(query('.dsh-reasoning-slider').dataset.unknown,'true');
  });
  await t.test('Escape, outside dismissal, reduced motion, and empty catalog are safe',async()=>{
    await setSelection(saved);await key(query('input[type=range]'),'Escape');assert.equal(query('.dsh-reasoning-panel'),null);assert.equal(document.activeElement,query('.dsh-reasoning-trigger'));
    await open();await pointer(document.body,'pointerdown');assert.equal(query('.dsh-reasoning-panel'),null);
    await act(async()=>{media.matches=true;for(const listener of mediaListeners)listener();});await open();
    await act(async()=>{catalog.store.set({status:'ready',error:null,value:{groups:[],failures:[],default:saved}});});
    await click('.dsh-reasoning-model-link');assert.match(query('.dsh-reasoning-panel').textContent,/No models available/);
    await act(async()=>catalog.store.set({status:'ready',error:null,value:{groups,failures:[],default:saved}}));
  });
  await t.test('unmount cancels subscriptions, portal, styles, media listeners, and late UI writes',async()=>{
    await click('.dsh-reasoning-trigger');await open();outcome='wait';await input(query('input[type=range]'),0);
    await act(async()=>root.unmount());for(const dispose of disposers.reverse())dispose();disposers=[];
    assert.equal(document.querySelectorAll('.dsh-reasoning-panel').length,0);assert.equal(document.querySelectorAll('style[data-plugin="dsh-reasoning-slider"]').length,0);
    assert.equal(mediaListeners.size,0);assert.equal(directory.store.listeners.size,0);
    await act(async()=>{outcome='success';settle();});directory.dispose();assert.equal(projected.listeners.size,0);assert.equal(catalog.store.listeners.size,0);
    assert.deepEqual(consoleErrors,[]);
  });
});
