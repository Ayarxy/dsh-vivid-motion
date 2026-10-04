import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
const require=createRequire(new URL('./reasoning-runtime/package.json',import.meta.url));
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><div id="root"></div>');
for(const name of ['window','document','HTMLElement','HTMLInputElement','Node','Element','Event','MouseEvent'])globalThis[name]=dom.window[name];
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
HTMLElement.prototype.setPointerCapture=function(){};
const React=require('react'),{act}=React,{createRoot}=require('react-dom/client');
let now=0,sequence=0,frames=new Map(),timers=new Map();
Object.defineProperty(window.performance,'now',{value:()=>now});
window.requestAnimationFrame=fn=>{const id=++sequence;frames.set(id,fn);return id;};
window.cancelAnimationFrame=id=>frames.delete(id);
window.setTimeout=(fn,delay)=>{const id=++sequence;timers.set(id,{fn,at:now+delay});return id;};
window.clearTimeout=id=>timers.delete(id);
async function advance(ms){await act(async()=>{
  now+=ms;const pending=[...frames.values()];frames.clear();for(const fn of pending)fn(now);
  for(const [id,timer] of [...timers])if(timer.at<=now){timers.delete(id);timer.fn();}
});}
let registration;
window.__ModuleLoader__={load(module){registration=module;}};
const source=fs.readFileSync('packages/dsh-reasoning-slider/lib/client.js','utf8');
vm.runInThisContext(source.replace('return { apply, inject: ["slots"] };','return {ReasoningSlider,position,fillPosition,startUltraCanvas,ULTRA_VERTEX,ULTRA_FRAGMENT};'));
const core=registration.factory(name=>name==='react'?React:{});
const original=fs.readFileSync('.scratch/codex-reuse/webview__assets__impl-5f62465d8678.js','utf8');
const geometry=original.slice(original.indexOf('function ot('),original.indexOf('var dt,Y,X'));
const originalGeometry=vm.runInNewContext('const vt=28,Z=1;'+geometry+';({position:ot,fill:st})');
const shaders=original.match(/L=`([\s\S]*?)`,R=`([\s\S]*?)`,z=/);
const efforts=['low','medium','high','xhigh','max','ultra'].map(id=>({id,name:id}));
let root,props,commits;
const query=selector=>document.querySelector(selector);
async function mount(value='low',levels=efforts){
  commits=[];props={efforts:levels,value,disabled:false,reduced:false,label:'Effort',onPreview(){},onCommit(index){commits.push(index);props={...props,value:props.efforts[index].id};render();}};
  root=createRoot(query('#root'));await act(async()=>render());
}
function render(){root.render(React.createElement(core.ReasoningSlider,props));}
async function change(patch){props={...props,...patch};await act(async()=>render());}
async function pointer(type){await act(async()=>{
  const event=new MouseEvent(type,{bubbles:true,button:0});Object.defineProperties(event,{pointerId:{value:1},isPrimary:{value:true}});query('input').dispatchEvent(event);
});}
async function input(value){await act(async()=>{
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(query('input'),String(value));query('input').dispatchEvent(new Event('input',{bubbles:true}));
});}
const percent=()=>Number(query('.dsh-reasoning-slider').style.getPropertyValue('--rs-position').match(/calc\(([^%]+)/)[1]);
const scale=()=>Number(query('.dsh-reasoning-thumb').style.transform.match(/scale\(([^)]+)/)?.[1]??1);
async function unmount(){await act(async()=>root.unmount());assert.equal(frames.size,0,'animation frames must be disposed');assert.equal(timers.size,0,'timers must be disposed');}

test('every animated fill and thumb sample agrees with extracted Codex geometry; GLSL is verbatim',()=>{
  assert.equal(core.ULTRA_VERTEX,shaders[1]);assert.equal(core.ULTRA_FRAGMENT,shaders[2]);
  for(const steps of [0,1,2,5,7])for(let p=0;p<=100;p+=.125){
    assert.equal(core.position(p),originalGeometry.position(p));
    assert.equal(core.fillPosition(p,steps),originalGeometry.fill(p,steps));
    assert.equal(core.fillPosition(p,steps,-.9),originalGeometry.fill(p,steps,-.9));
  }
});
test('track clicks stay on the 300 ms curve and a held pointer expands the thumb before dragging',async()=>{
  await mount();await pointer('pointerdown');await input(4);
  assert.equal(query('.dsh-reasoning-slider').dataset.dragging,'false');assert.equal(percent(),0);
  await advance(75);const first=percent();assert.ok(first>40&&first<80);assert.ok(scale()>1&&scale()<32/28);
  await advance(75);assert.ok(percent()>first&&percent()<80,'click animation is unfinished at 150 ms');
  await advance(150);assert.equal(percent(),80);assert.deepEqual(commits,[]);
  const range=query('input');await pointer('pointerup');assert.deepEqual(commits,[4]);assert.equal(query('input'),range);assert.equal(percent(),80);
  await unmount();
});
test('dragging uses 150 ms, retargets from the current frame, and fill/Ultra countertranslation stay synchronized',async()=>{
  await mount();await pointer('pointerdown');await pointer('pointermove');await input(4);
  assert.equal(query('.dsh-reasoning-slider').dataset.dragging,'true');
  await advance(75);const middle=percent();assert.ok(middle>40&&middle<80);
  const element=query('.dsh-reasoning-slider');
  assert.equal(element.style.getPropertyValue('--rs-fill'),originalGeometry.fill(middle,5));
  assert.equal(element.style.getPropertyValue('--rs-effects'),originalGeometry.fill(middle,5,-.9));
  await input(1);assert.equal(percent(),middle,'reversal must not snap to the old or new target');
  await advance(75);assert.ok(percent()>20&&percent()<middle);
  await advance(75);assert.equal(percent(),20);
  await pointer('pointerup');assert.deepEqual(commits,[1]);assert.equal(query('.dsh-reasoning-slider'),element);
  await unmount();
});
test('spring reversal preserves velocity, settles, and reduced motion clears running animation',async()=>{
  await mount();await pointer('pointerdown');await advance(60);const expanding=scale();assert.ok(expanding>1);
  await pointer('pointercancel');assert.equal(scale(),expanding);
  await advance(1);assert.ok(scale()>expanding,'outward velocity is retained briefly after release');
  for(let n=0;n<60;n++)await advance(16);
  assert.equal(scale(),1);assert.equal(frames.size,0,'settled slider must not keep a RAF loop');
  await pointer('pointerdown');await pointer('pointermove');await input(5);await advance(30);
  assert.ok(percent()>0&&percent()<100);assert.equal(queryAll('.dsh-reasoning-particle').length,14);
  await change({reduced:true});assert.equal(percent(),100);assert.equal(scale(),1);
  assert.equal(query('.dsh-reasoning-burst'),null);assert.equal(query('.dsh-reasoning-particles'),null);
  assert.equal(frames.size,0);assert.equal(timers.size,0);await unmount();
});
function queryAll(selector){return [...document.querySelectorAll(selector)];}
test('Ultra entry survives commit, exit fades for 300 ms, and early re-entry cancels stale cleanup',async()=>{
  await mount('max');const range=query('input');await pointer('pointerdown');await input(5);await advance(16);
  const effects=query('.dsh-reasoning-effects'),canvas=query('canvas'),burst=query('.dsh-reasoning-burst');
  assert.ok(effects&&canvas&&burst);assert.equal(queryAll('.dsh-reasoning-burst i').length,16);
  assert.equal(queryAll('.dsh-reasoning-particle').length,14);
  assert.equal(query('.dsh-reasoning-ultra-fill').dataset.reveal,'true');
  await pointer('pointerup');assert.equal(query('input'),range);assert.equal(query('canvas'),canvas);assert.equal(query('.dsh-reasoning-burst'),burst);
  await input(4);assert.equal(effects.dataset.visible,'false');await advance(150);assert.equal(query('canvas'),canvas);
  await input(5);await advance(16);assert.equal(query('canvas'),canvas);assert.equal(effects.dataset.visible,'true');
  await advance(150);assert.equal(query('canvas'),canvas,'stale exit timer must not remove a reactivated effect');
  await input(4);await advance(299);assert.equal(query('canvas'),canvas);await advance(1);assert.equal(query('canvas'),null);
  await unmount();
});
test('DeepSeek Max and provider-specific highest levels get the effect without changing their submitted ID',async()=>{
  const catalogs=[['off','low','high','max'],['low','medium','high'],['brief','thorough'],['ultra','custom-final']];
  for(const ids of catalogs){
    const levels=ids.map(id=>({id,name:id})),last=ids.length-1;
    await mount(ids[last-1],levels);assert.equal(query('.dsh-reasoning-slider').dataset.maximum,'false');assert.equal(query('canvas'),null);
    await pointer('pointerdown');await input(last);await advance(16);
    assert.equal(query('.dsh-reasoning-slider').dataset.maximum,'true');assert.ok(query('canvas'));
    assert.equal(queryAll('.dsh-reasoning-particle').length,14);assert.equal(queryAll('.dsh-reasoning-burst i').length,16);
    const canvas=query('canvas');await pointer('pointerup');assert.equal(query('canvas'),canvas);
    assert.equal(props.value,ids[last],'host payload retains the real highest effort ID');assert.deepEqual(commits,[last]);
    await input(last-1);assert.equal(query('.dsh-reasoning-slider').dataset.maximum,'false');await advance(300);assert.equal(query('canvas'),null);
    await unmount();
  }
});
function glFixture({failCompile=false,failLink=false,failBuffer=false}={}){
  const deleted={shaders:[],programs:[],buffers:[]},uniformTimes=[],shaderSources=[];let draws=0,observed=0;
  const gl={VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,ARRAY_BUFFER:5,STATIC_DRAW:6,FLOAT:7,TRIANGLES:8,
    createShader:type=>({type}),shaderSource:(_,source)=>shaderSources.push(source),compileShader(){},getShaderParameter:()=>!failCompile,deleteShader:shader=>deleted.shaders.push(shader),
    createProgram:()=>({program:true}),attachShader(){},linkProgram(){},getProgramParameter:()=>!failLink,deleteProgram:program=>deleted.programs.push(program),
    createBuffer:()=>failBuffer?null:{buffer:true},deleteBuffer:buffer=>deleted.buffers.push(buffer),getAttribLocation:()=>0,getUniformLocation:(_,name)=>name,
    useProgram(){},bindBuffer(){},bufferData(){},enableVertexAttribArray(){},vertexAttribPointer(){},uniform1f:(_,time)=>uniformTimes.push(time),uniform2f(){},drawArrays:()=>draws++,viewport(){}
  };
  window.WebGLRenderingContext=function(){};
  window.ResizeObserver=class{observe(){observed++;}disconnect(){observed--;}};
  const canvas={getContext:()=>gl,getBoundingClientRect:()=>({width:234,height:26})};
  return {canvas,deleted,uniformTimes,shaderSources,draws:()=>draws,observed:()=>observed};
}
test('Ultra WebGL lifecycle renders continuously, then releases shaders, buffer, program, resize observer and RAF',async()=>{
  const fixture=glFixture();const stop=core.startUltraCanvas(fixture.canvas,false);
  assert.deepEqual(fixture.shaderSources,[shaders[1],shaders[2]]);assert.equal(fixture.deleted.shaders.length,2);assert.equal(fixture.observed(),1);
  const before=fixture.draws();await advance(16);assert.equal(fixture.draws(),before+1);assert.ok(fixture.uniformTimes.at(-1)>0);
  stop();assert.equal(frames.size,0);assert.equal(fixture.observed(),0);assert.equal(fixture.deleted.buffers.length,1);assert.equal(fixture.deleted.programs.length,1);
});
test('reduced-motion WebGL renders once and compile/link/allocation failures retain the CSS fallback without leaking',()=>{
  const still=glFixture();const stop=core.startUltraCanvas(still.canvas,true);assert.equal(still.draws(),1);assert.equal(still.uniformTimes[0],0);assert.equal(frames.size,0);stop();
  for(const failure of [{failCompile:true},{failLink:true},{failBuffer:true}]){
    const fixture=glFixture(failure);assert.equal(core.startUltraCanvas(fixture.canvas,false),undefined);
    assert.equal(frames.size,0);assert.equal(fixture.observed(),0);assert.equal(fixture.deleted.shaders.length,2);
    assert.equal(fixture.deleted.programs.length,failure.failCompile?0:1);
  }
});
