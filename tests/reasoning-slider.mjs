import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SlotCore } from '../.scratch/dsh-client-ui-slots_lib_index.js';

const source = fs.readFileSync(new URL('../packages/dsh-reasoning-slider/lib/client.js', import.meta.url), 'utf8')
  .replace('return { apply, inject: ["slots"] };', 'return { apply, ModelPicker, ReasoningSlider, modelSelection, effortSelection, modelChoices, position, fillPosition, TEXT };');
let registration, currentHooks;
const mediaListeners = new Set(), styles = new Set();
const media = { matches:false, addEventListener(_e, fn){mediaListeners.add(fn);}, removeEventListener(_e, fn){mediaListeners.delete(fn);} };
function element() {
  return { style:{setProperty(name,value){this[name]=value;}}, dataset:{}, listeners:new Map(), children:[], focus(){}, querySelector(){return null;}, querySelectorAll(){return [];},
    addEventListener(type, callback){this.listeners.set(type, callback);}, removeEventListener(type){this.listeners.delete(type);},
    setPointerCapture(id){this.capture = id;}, remove(){styles.delete(this);} };
}
const doc = { documentElement:{lang:'en'}, body:{}, head:{append(node){styles.add(node);}}, createElement:element, activeElement:null };
const depsEqual = (a,b) => a && b && a.length === b.length && a.every((item,i)=>Object.is(item,b[i]));
const React = {
  Fragment:Symbol('Fragment'),
  createElement(type, props, ...children){return {type, props:{...props, children:children.flat(Infinity).filter(c=>c!==false&&c!=null)}};},
  useState(initial){const state=currentHooks, i=state.index++;if(!(i in state.values))state.values[i]=typeof initial==='function'?initial():initial;
    return [state.values[i], next=>{state.writes++;state.values[i]=typeof next==='function'?next(state.values[i]):next;}];},
  useRef(initial){const state=currentHooks, i=state.index++;return state.values[i] ??= {current:initial};},
  useMemo(fn,deps){const state=currentHooks,i=state.index++;if(!depsEqual(state.values[i]?.deps,deps))state.values[i]={deps,value:fn()};return state.values[i].value;},
  useCallback(fn,deps){return React.useMemo(()=>fn,deps);},
  useId(){return React.useMemo(()=>':fixture:',[]);},
  useSyncExternalStore(_subscribe, snapshot){return snapshot();},
  useEffect(fn,deps){const state=currentHooks, i=state.index++;if(!depsEqual(state.values[i]?.deps,deps))state.effects.push(()=>{state.values[i]?.cleanup?.();state.values[i]={deps,cleanup:fn()};});},
  useLayoutEffect(fn,deps){React.useEffect(fn,deps);}
};
const primitives = new Proxy({
  useAnchoredPosition:()=>({top:80,left:80}), useDismissOnOutsidePointer(){},
  rankByName:(models, query)=>models.filter(model=>model.name.toLowerCase().includes(query.toLowerCase()))
}, {get:(object,key)=>object[key] ?? `official:${key}`});
vm.runInNewContext(source, {window:{__ModuleLoader__:{load(value){registration=value;}},matchMedia:()=>media,setTimeout,clearTimeout},document:doc,
  getComputedStyle:()=>({transform:'none'}),queueMicrotask,console});
const core=registration.factory(name=>name==='react'?React:name==='react-dom'?{createPortal:(node)=>node}:primitives);
const plain = value=>JSON.parse(JSON.stringify(value));
function mount(Component,props) {
  const state={index:0,values:[],effects:[],writes:0,refs:new Map()};
  return {props,state,render(){currentHooks=state;state.index=0;state.effects=[];const tree=Component(this.props);
    for(const node of nodes(tree))if(node?.props?.ref){let item=state.refs.get(node.props.ref);if(!item){item=element();state.refs.set(node.props.ref,item);}node.props.ref.current=item;}
    for(const effect of state.effects)effect();return tree;},
    unmount(){for(const value of state.values)value?.cleanup?.();}};
}
function nodes(tree){return !tree||typeof tree!=='object'?[tree]:[tree,...(tree.props?.children??[]).flatMap(nodes)];}
const find=(tree,predicate)=>nodes(tree).find(predicate);
const byClass=(tree,name)=>find(tree,n=>n?.props?.className?.split(' ').includes(name));
const text=tree=>nodes(tree).filter(n=>typeof n==='string').join(' ');
const levels=[{id:'low',name:'Light'},{id:'high',name:'High'},{id:'ultra',name:'Ultra'}];
const groups=[{id:'provider-a',name:'A',models:[{id:'model-a',name:'Model A',reasoning:{defaultEffort:'high',efforts:levels}},{id:'plain',name:'Plain'}]},
  {id:'provider-b',name:'B',models:[{id:'model-a',name:'Model A',reasoning:{efforts:[{id:'custom',name:'Custom'}]}}]}];

test('payloads preserve provider identity and adapter-specific efforts; no synthetic default',()=>{
  const choices=core.modelChoices(groups);
  assert.equal(choices.length,3);assert.notEqual(choices[0].key,choices[2].key);
  assert.deepEqual(plain(core.modelSelection(choices[0],null)),{provider:'provider-a',model:'model-a',reasoningEffort:'high'});
  assert.deepEqual(plain(core.modelSelection(choices[2],null)),{provider:'provider-b',model:'model-a'});
  assert.deepEqual(plain(core.effortSelection({provider:'provider-b',model:'model-a'},groups[1].models[0].reasoning.efforts,0)),{provider:'provider-b',model:'model-a',reasoningEffort:'custom'});
  assert.equal(core.effortSelection(null,levels,0),null);assert.equal(core.effortSelection({},levels,99),null);
  const saved={provider:'provider-a',model:'model-a',reasoningEffort:'removed'};
  assert.equal(core.modelSelection(choices[0],saved),saved);
});

test('drag previews do not write; pointer release commits once, cancellation restores saved value',()=>{
  const commits=[],previews=[];
  const component=mount(core.ReasoningSlider,{efforts:levels,value:'high',disabled:false,reduced:true,label:'Effort',onPreview:i=>previews.push(i),onCommit:i=>commits.push(i)});
  let input=()=>byClass(component.render(),'dsh-reasoning-input').props;
  input().onPointerDown({button:0,pointerId:7,currentTarget:element()});
  input().onChange({currentTarget:{valueAsNumber:0}});
  input().onChange({currentTarget:{valueAsNumber:2}});
  assert.deepEqual(commits,[]);assert.equal(input().value,2);
  input().onPointerUp({pointerId:7,currentTarget:{valueAsNumber:2}});
  input().onLostPointerCapture();assert.deepEqual(commits,[2]);
  input().onPointerDown({button:0,pointerId:8,currentTarget:element()});
  input().onChange({currentTarget:{valueAsNumber:0}});input().onPointerCancel();
  assert.equal(input().value,1);assert.deepEqual(commits,[2]);assert.equal(previews.at(-1),null);
  component.unmount();
});

test('unknown effort remains unselected; keyboard starts at a real choice, one-level model is usable',()=>{
  const commits=[];let prevented=false;
  const component=mount(core.ReasoningSlider,{efforts:[levels[0]],value:undefined,disabled:false,reduced:true,label:'Effort',onPreview(){},onCommit:i=>commits.push(i)});
  const tree=component.render(),input=byClass(tree,'dsh-reasoning-input').props;
  assert.equal(byClass(tree,'dsh-reasoning-slider').props['data-unknown'],true);assert.equal(input.disabled,false);
  input.onKeyDown({key:'ArrowRight',preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.deepEqual(commits,[0]);component.unmount();
});

test('keyboard and wheel select actual levels and block edits while pending',()=>{
  const commits=[];const component=mount(core.ReasoningSlider,{efforts:levels,value:'high',disabled:false,reduced:true,label:'Effort',onPreview(){},onCommit:i=>commits.push(i)});
  let input=byClass(component.render(),'dsh-reasoning-input').props;
  input.onChange({currentTarget:{valueAsNumber:0}});assert.deepEqual(commits,[0]);
  input=byClass(component.render(),'dsh-reasoning-input').props;
  const wheel=input.ref.current.listeners.get('wheel');
  const event={deltaY:-16,deltaX:0,deltaMode:0,timeStamp:1,preventDefault(){},stopPropagation(){}};
  wheel(event);assert.equal(commits.length,1);wheel({...event,timeStamp:50});assert.deepEqual(commits,[0,2]);
  wheel({...event,ctrlKey:true,timeStamp:51});assert.equal(commits.length,2);
  component.props.disabled=true;input=byClass(component.render(),'dsh-reasoning-input').props;
  input.onChange({currentTarget:{valueAsNumber:0}});assert.equal(commits.length,2);
  const element=input.ref.current;component.unmount();assert.equal(element.listeners.size,0);
});

function pickerFixture(select) {
  let snapshot={current:{provider:'provider-a',model:'model-a',reasoningEffort:'high'},groups,failures:[],status:'ready',pending:null,error:null};
  const component=mount(core.ModelPicker,{available:true,locked:false,directory:{subscribe(){return()=>{};},getSnapshot:()=>snapshot},load(){},select,t:key=>core.TEXT.en[key]});
  component.render();
  const open=()=>{byClass(component.render(),'dsh-reasoning-trigger').props.onClick();return component.render();};
  return {component,open,setSnapshot:patch=>{snapshot={...snapshot,...patch};}};
}

test('picker uses host labels and groups, omits default row, and handles models without reasoning',()=>{
  const fixture=pickerFixture(async()=>({ok:true}));let tree=fixture.open();
  assert.equal(text(tree).includes('High'),true);
  byClass(tree,'dsh-reasoning-model-link').props.onClick();tree=fixture.component.render();
  assert.equal(nodes(tree).filter(n=>n?.props?.role==='menuitemradio').length,3);
  assert.equal(/\bDefault\b|默认/.test(text(tree)),false);
  assert.equal(byClass(tree,'dsh-reasoning-menu-heading'),undefined);
  assert.equal(byClass(tree,'dsh-reasoning-icon'),undefined);
  fixture.setSnapshot({current:{provider:'provider-a',model:'plain'}});
  byClass(tree,'dsh-reasoning-panel').props.onKeyDown({key:'Escape',preventDefault(){},stopPropagation(){}});tree=fixture.component.render();
  assert.equal(text(tree).includes('This model provides no reasoning levels'),true);
  assert.equal(nodes(tree).some(n=>n?.type===core.ReasoningSlider),false);
  fixture.component.unmount();
});

test('async failures retain confirmed selection and suppress duplicate submissions',async()=>{
  const calls=[];let resolve;
  const fixture=pickerFixture(selection=>{calls.push(plain(selection));return new Promise(done=>{resolve=done;});});
  let tree=fixture.open();const slider=find(tree,n=>n?.type===core.ReasoningSlider);
  slider.props.onCommit(0);slider.props.onCommit(2);assert.equal(calls.length,1);
  tree=fixture.component.render();assert.equal(byClass(tree,'dsh-reasoning-trigger').props['aria-busy'],true);
  resolve({ok:false,error:{code:'session/writer-held',message:'held'}});await new Promise(done=>setImmediate(done));
  tree=fixture.component.render();assert.match(text(tree),/another DSH instance/);
  assert.equal(find(tree,n=>n?.type===core.ReasoningSlider).props.value,'high');
  assert.equal(byClass(tree,'dsh-reasoning-trigger').props['aria-busy'],false);
  find(tree,n=>n?.type===core.ReasoningSlider).props.onCommit(2);assert.equal(calls.length,2);
  fixture.component.unmount();const writes=fixture.component.state.writes;resolve({ok:true});await new Promise(done=>setImmediate(done));
  assert.equal(fixture.component.state.writes,writes);
});

test('loading or opening never submits an inferred effort; locked/subagent seats cannot select',()=>{
  let calls=0;const fixture=pickerFixture(()=>{calls++;return Promise.resolve({ok:true});});
  fixture.setSnapshot({current:{provider:'provider-b',model:'model-a'}});let tree=fixture.open();
  assert.equal(find(tree,n=>n?.type===core.ReasoningSlider).props.value,undefined);assert.equal(calls,0);
  fixture.component.props.locked=true;tree=fixture.component.render();
  assert.equal(byClass(tree,'dsh-reasoning-trigger').props.disabled,true);
  fixture.component.props.available=false;assert.equal(fixture.component.render(),null);
  fixture.component.unmount();
});

test('real host SlotCore coexists with the subscription picker and restores it on unload',()=>{
  const slots=new SlotCore(),disposers=[],parent=slots.register({name:'root',children:{'conversation.input.model':{kind:'single',scope:'session'}}},()=>null);
  const original=()=>null,stopOriginal=slots.register({name:'conversation.input.model'},original);
  const subscription=()=>null,stopSubscription=slots.register({name:'conversation.input.model',priority:-10},subscription);
  let localeRemoved=false;const directory={store:{},load:async()=>{},select:async()=>({ok:true})};
  const scope={slots:{inject(_name,fn){disposers.push(fn());},register:(...args)=>slots.register(...args)},
    modelDirectories:{directoryFor:()=>directory},sessions:{subagentAddress:()=>undefined}};
  core.apply({get:()=>({register:()=>()=>{localeRemoved=true;}}),effect(fn){disposers.push(fn());},inject(_names,fn){fn(scope);}});
  assert.equal(slots.entriesOfSlot('conversation.input.model')[0].component,core.ModelPicker);assert.equal(styles.size,1);
  for(const dispose of disposers.reverse())dispose();
  assert.equal(slots.entriesOfSlot('conversation.input.model')[0].component,subscription);
  assert.equal(styles.size,0);assert.equal(localeRemoved,true);
  stopSubscription();assert.equal(slots.entriesOfSlot('conversation.input.model')[0].component,original);
  stopOriginal();parent();assert.equal(mediaListeners.size,0);
});
