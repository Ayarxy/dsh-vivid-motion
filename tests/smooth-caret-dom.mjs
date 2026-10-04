import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';

// Deterministic DOM/lifecycle tests. These deliberately do not pretend to be
// browser layout tests; smooth-caret.html separately exercises real layout.
const source=fs.readFileSync(new URL('../packages/dsh-smooth-caret/lib/client.js',import.meta.url),'utf8')
 .replace('return { apply, inject: ["slots"] };','return { mountEngine, createStore, measureRich, measureTextarea, clipRect, findEditor };');
function fixture() {
 const f={now:0,frames:new Map(),seq:0,reads:0,styleReads:0,observers:[],resizers:[],warnings:[],rangeReader:null};
 class Hub {
  listeners=new Map();
  addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
  removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
  emit(type,target=this,extra={}){for(const fn of this.listeners.get(type)||[])fn({type,target,...extra});}
  get listenerCount(){return [...this.listeners.values()].reduce((n,set)=>n+set.size,0);}
 }
 const css={visibility:'visible',display:'block',opacity:'1',overflowX:'visible',overflowY:'visible',contain:'none',writingMode:'horizontal-tb',direction:'ltr',textAlign:'start',fontSize:'16px',lineHeight:'26px',paddingLeft:'0px',paddingRight:'0px',paddingTop:'0px',paddingBottom:'0px',borderLeftWidth:'0px',borderRightWidth:'0px',borderTopWidth:'0px',textIndent:'0px',whiteSpace:'pre-wrap'};
 const box=(left=0,top=0,width=320,height=100)=>({left,top,width,height,right:left+width,bottom:top+height});
 class Element extends Hub {
  constructor(name){super();this.nodeType=1;this.nodeName=this.tagName=name.toUpperCase();this.childNodes=[];this.attributes=new Map();this.style={};this.computed={...css};this.rect=box();this.clientWidth=this.offsetWidth=320;this.clientHeight=this.offsetHeight=100;this.clientLeft=this.clientTop=this.scrollLeft=this.scrollTop=0;this.isContentEditable=false;this._editor=false;this.hidden=false;}
  get parentElement(){return this.parentNode?.nodeType===1?this.parentNode:null;}
  get firstChild(){return this.childNodes[0]||null;}
  get lastChild(){return this.childNodes.at(-1)||null;}
  get previousSibling(){return this.parentNode?.childNodes[this.parentNode.childNodes.indexOf(this)-1]||null;}
  get nextSibling(){return this.parentNode?.childNodes[this.parentNode.childNodes.indexOf(this)+1]||null;}
  get isConnected(){return this===f.document.documentElement || Boolean(this.parentNode?.isConnected);}
  get textContent(){return this._text??this.childNodes.map(node=>node.textContent).join('');}
  set textContent(value){this._text=value;this.childNodes=[];}
  append(...nodes){for(const node of nodes){node.remove?.();node.parentNode=this;this.childNodes.push(node);}}
  remove(){if(this.parentNode){this.parentNode.childNodes.splice(this.parentNode.childNodes.indexOf(this),1);this.parentNode=null;}}
  contains(node){for(let item=node;item;item=item.parentNode)if(item===this)return true;return false;}
  getAttribute(name){return this.attributes.get(name)??null;}
  setAttribute(name,value){this.attributes.set(name,String(value));}
  removeAttribute(name){this.attributes.delete(name);}
  toggleAttribute(name,force){const yes=force??!this.attributes.has(name);if(yes)this.setAttribute(name,'');else this.removeAttribute(name);return yes;}
  getBoundingClientRect(){return this.rect;}
  closest(selector){for(let item=this;item;item=item.parentElement){if(selector.includes('textarea[data-phase]')&&item._editor)return item;if(selector==='[contenteditable="false"]'&&item.getAttribute('contenteditable')==='false')return item;if(selector.startsWith('[inert]')&&(item.getAttribute('inert')!==null||item.getAttribute('aria-hidden')==='true'||item.tagName==='DIALOG'))return item;}return null;}
  querySelector(){for(const node of this.childNodes){if(node.tagName==='IMG'||node.getAttribute?.('contenteditable')==='false')return node;const child=node.querySelector?.();if(child)return child;}return null;}
 }
 class Text {
  nodeType=3;nodeName='#text';
  constructor(value){this.data=value;}
  get length(){return this.data.length;}
  get textContent(){return this.data;}
  get parentElement(){return this.parentNode;}
  get nextSibling(){return this.parentNode?.childNodes[this.parentNode.childNodes.indexOf(this)+1]||null;}
  get previousSibling(){return this.parentNode?.childNodes[this.parentNode.childNodes.indexOf(this)-1]||null;}
 }
 f.document=new Hub();const doc=f.document;
 doc.documentElement=new Element('html');doc.body=new Element('body');doc.head=new Element('head');doc.documentElement.append(doc.head,doc.body);doc.documentElement.lang='en';doc.hidden=false;doc.hasFocus=()=>f.focused!==false;
 doc.createElement=(name)=>new Element(name);doc.createElementNS=(ns,name)=>new Element(name);doc.createTextNode=(value)=>new Text(value);
 doc.createRange=()=>({setStart(node,offset){this.node=node;this.offset=offset;},collapse(value){assert.equal(value,true);},getClientRects(){f.reads++;if(f.rangeError)throw Error('layout unavailable');return f.rangeReader?f.rangeReader(this.node,this.offset):[box(110+this.offset*8,110,0,18)];},getBoundingClientRect(){throw Error('must not use bounding fallback');}});
 doc.getSelection=()=>f.selection;
 const descendants=(node)=>[node,...(node.childNodes||[]).flatMap(descendants)];doc.getElementById=(id)=>descendants(doc.documentElement).find(node=>node.id===id)||null;
 f.window=new Hub();f.window.innerWidth=1000;f.window.innerHeight=700;f.window.devicePixelRatio=1;
 const media=new Map();f.window.matchMedia=(query)=>{if(!media.has(query)){const m=new Hub();m.matches=false;media.set(query,m);}return media.get(query);};f.media=media;
 const saved=new Map();f.window.localStorage={getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)};
 const observer=(list)=>class{constructor(callback){this.callback=callback;this.targets=[];list.push(this);}observe(target,options){this.targets.push({target,options});}disconnect(){this.targets=[];}};
 let registration;
 f.window.__ModuleLoader__={load(value){registration=value;}};
 vm.runInNewContext(source,{window:f.window,document:doc,performance:{now:()=>f.now},getComputedStyle:el=>{f.styleReads++;return el.computed;},MutationObserver:observer(f.observers),ResizeObserver:observer(f.resizers),requestAnimationFrame:callback=>{const id=++f.seq;f.frames.set(id,callback);return id;},cancelAnimationFrame:id=>f.frames.delete(id),console:{warn:(...args)=>f.warnings.push(args)}});
 f.core=registration.factory(()=>({}));f.box=box;
 f.root=new Element('div');f.root._editor=true;f.root.isContentEditable=true;f.root.rect=box(100,100,320,100);doc.body.append(f.root);f.text=new Text('abcdefghijklmnop');f.root.append(f.text);
 f.select=(offset=2)=>{doc.activeElement=f.root;f.selection={focusNode:f.text,focusOffset:offset,anchorNode:f.text,anchorOffset:2};};f.select();
 f.step=(ms=16)=>{f.now+=ms;const callbacks=[...f.frames.values()];f.frames.clear();for(const fn of callbacks)fn(f.now);};
 f.drain=()=>{for(let i=0;i<100&&f.frames.size;i++)f.step();assert.equal(f.frames.size,0,'animation must settle');};
 f.overlay=()=>doc.getElementById('dsh-smooth-caret-overlay');
 f.caretX=()=>Number.parseFloat(f.overlay().lastChild.style.transform.match(/translate3d\(([-\d.]+)px/)[1])+Number.parseFloat(f.overlay().style.left);
 return f;
}

test('rich forward/backward selections measure the focus, not ordered start',()=>{
 const f=fixture();const range=f.document.createRange();f.select(12);f.core.measureRich(f.root,range);assert.equal(range.offset,12);
 f.select(2);f.selection.anchorOffset=12;f.core.measureRich(f.root,range);assert.equal(range.offset,2);
});
test('empty paragraph and BR preflight reject positive previous-line fallback',()=>{
 const f=fixture();f.rangeReader=()=>[];f.root.childNodes=[];const p=f.document.createElement('p'),br=f.document.createElement('br');p.rect=f.box(100,126,300,26);br.rect=f.box(100,128,0,18);p.append(br);f.root.append(p);
 f.selection={focusNode:p,focusOffset:0,anchorNode:p};let r=f.core.measureRich(f.root,f.document.createRange());assert.equal(r.y,128);assert.equal(r.height,18);
 f.selection={focusNode:f.root,focusOffset:0,anchorNode:f.root};r=f.core.measureRich(f.root,f.document.createRange());assert.equal(r.y,128,'root boundary descends into its paragraph');
 p.append(f.document.createTextNode(''));f.selection={focusNode:p,focusOffset:1,anchorNode:p};p.offsetHeight=26;r=f.core.measureRich(f.root,f.document.createRange());assert.equal(r.y,154,'real break advances exactly one line');
});
test('textarea mirrors used CSS and reads selection direction',()=>{
 const f=fixture();const root=f.document.createElement('textarea'),mirror={element:f.document.createElement('div'),text:f.document.createTextNode('')};root.value='abcdef';root.wrap='off';root.selectionStart=1;root.selectionEnd=5;root.selectionDirection='forward';root.rect=f.box(100,100,320,100);
 f.rangeReader=()=>[f.box(40,16,0,18)];const range=f.document.createRange();f.core.measureTextarea(root,range,mirror);assert.equal(range.offset,5);assert.equal(mirror.element.style.whiteSpace,'pre-wrap','CSS wins over wrap attribute');assert.equal(mirror.text.data,'abcdef\u200b');
 root.selectionDirection='backward';root.computed.whiteSpace='pre';f.core.measureTextarea(root,range,mirror);assert.equal(range.offset,1);assert.equal(mirror.element.style.whiteSpace,'pre');
});
test('clipping intersects both axes of each clipping ancestor',()=>{
 const f=fixture();const parent=f.document.createElement('div');parent.rect=f.box(120,120,160,60);parent.clientWidth=parent.offsetWidth=160;parent.clientHeight=parent.offsetHeight=60;parent.computed.overflowX='hidden';parent.computed.overflowY='auto';f.document.body.append(parent);parent.append(f.root);
 const rect=f.core.clipRect(f.root);assert.deepEqual({...rect},{left:120,top:120,right:280,bottom:180});
 parent.rect=f.box(500,500,160,60);assert.equal(f.core.clipRect(f.root),null);
});
test('one measurement per invalidation, zero layout reads in animation frames, zero idle frames',()=>{
 const f=fixture(),store=f.core.createStore(),stop=f.core.mountEngine(store);f.drain();assert.equal(f.root.getAttribute('data-dsh-smooth-caret'),'active');
 f.select(12);for(let i=0;i<12;i++)f.document.emit('selectionchange');assert.equal(f.frames.size,1);f.step();const reads=f.reads,styles=f.styleReads;
 assert.ok(f.frames.size>0,'movement has intermediate frames');f.drain();assert.equal(f.reads,reads);assert.equal(f.styleReads,styles);assert.equal(f.frames.size,0);stop();store.dispose();
});
test('text mutations do not snap a moving caret',()=>{
 const f=fixture(),store=f.core.createStore(),stop=f.core.mountEngine(store);f.drain();f.select(12);f.observers[0].callback([{type:'characterData'}]);f.step();assert.ok(f.frames.size>0,'text edit is animated');stop();store.dispose();
});
test('IME keeps the smooth caret, tracks internal preedit selection, and stops idle frames',()=>{
 const f=fixture(),store=f.core.createStore(),stop=f.core.mountEngine(store);store.set({blink:true});f.drain();assert.ok(f.overlay().getAttribute('data-blink')!==null);
 f.document.emit('compositionstart',f.root);assert.equal(f.root.getAttribute('data-dsh-smooth-caret'),'active');assert.equal(f.overlay().hidden,false);f.drain();assert.equal(f.overlay().getAttribute('data-blink'),null);
 f.document.emit('compositionupdate',f.root,{data:'zhongwen'});f.text.data='abzhongwenTAIL';f.select(10);f.selection.anchorOffset=10;
 f.document.emit('input',f.root,{isComposing:true,inputType:'insertCompositionText',data:'zhongwen'});f.step();assert.ok(f.caretX()>126&&f.caretX()<190,'preedit movement is animated');f.drain();assert.equal(f.caretX(),190);
 f.select(5);f.selection.anchorOffset=10;f.document.emit('selectionchange');f.drain();assert.equal(f.caretX(),150,'internal clause focus wins over end of composition data');assert.equal(f.frames.size,0);assert.equal(f.overlay().getAttribute('data-blink'),null);
 f.document.emit('compositionend',f.root,{data:'中文'});f.text.data='ab中文TAIL';f.select(4);f.selection.anchorOffset=4;f.drain();assert.equal(f.caretX(),142);assert.ok(f.overlay().getAttribute('data-blink')!==null);stop();store.dispose();
});
test('compositionupdate before default edit and a one-frame late selection both get measured',()=>{
 const f=fixture(),store=f.core.createStore(),stop=f.core.mountEngine(store);f.drain();f.document.emit('compositionstart',f.root);f.drain();
 f.document.emit('compositionupdate',f.root,{data:'abcd'});f.step();assert.equal(f.caretX(),126,'do not predict uninserted text');
 f.text.data='ababcdTAIL';f.select(6);f.selection.anchorOffset=6;f.drain();assert.equal(f.caretX(),158,'deferred recheck reads final selection without another event');assert.equal(f.frames.size,0);stop();store.dispose();
});
test('detached composition node bridges two frames, then adopts the replacement node',()=>{
 const f=fixture(),store=f.core.createStore(),stop=f.core.mountEngine(store);f.drain();f.document.emit('compositionstart',f.root);f.drain();const start=f.caretX();
 f.document.emit('compositionupdate',f.root,{data:'中文'});f.root.childNodes=[];f.text.parentNode=null;f.step();assert.equal(f.overlay().hidden,false);assert.equal(f.caretX(),start);
 f.text=f.document.createTextNode('ab中文TAIL');f.root.append(f.text);f.select(4);f.selection.anchorOffset=4;f.drain();assert.equal(f.caretX(),142);assert.equal(f.root.getAttribute('data-dsh-smooth-caret'),'active');stop();store.dispose();
});
test('unrecoverable composition selection does not retain a stale hidden native caret',()=>{
 const f=fixture(),store=f.core.createStore(),stop=f.core.mountEngine(store);f.drain();f.document.emit('compositionstart',f.root);f.drain();
 f.document.emit('compositionupdate',f.root);f.selection=null;f.step();assert.equal(f.overlay().hidden,false);f.drain();assert.equal(f.overlay().hidden,true);assert.equal(f.root.getAttribute('data-dsh-smooth-caret'),null);assert.equal(f.frames.size,0);
 f.select(3);f.document.emit('selectionchange');f.drain();assert.equal(f.overlay().hidden,false);stop();store.dispose();
});
test('browser ancestor-boundary reset during node replacement does not pull the caret backwards',()=>{
 const f=fixture(),store=f.core.createStore(),stop=f.core.mountEngine(store);f.select(8);f.drain();f.document.emit('compositionstart',f.root);f.drain();const previous=f.caretX();
 f.document.emit('compositionupdate',f.root,{data:'中文'});f.root.childNodes=[];f.text.parentNode=null;f.text=f.document.createTextNode('ab中文TAIL');f.root.append(f.text);
 f.selection={focusNode:f.root,focusOffset:0,anchorNode:f.root,anchorOffset:0};f.step();assert.equal(f.caretX(),previous,'hold instead of measuring the temporary element boundary');assert.equal(f.overlay().hidden,false);
 f.select(4);f.selection.anchorOffset=4;f.drain();assert.equal(f.caretX(),142);stop();store.dispose();
});
test('ongoing mutations cannot extend retention of an invalid composition selection forever',()=>{
 const f=fixture(),store=f.core.createStore(),stop=f.core.mountEngine(store);f.drain();f.document.emit('compositionstart',f.root);f.drain();f.document.emit('compositionupdate',f.root);f.selection=null;
 for(let i=0;i<3;i++){f.observers[0].callback([{type:'characterData'}]);f.step();}
 assert.equal(f.overlay().hidden,true);assert.equal(f.root.getAttribute('data-dsh-smooth-caret'),null);f.drain();stop();store.dispose();
});
test('beforeinput range hint waits for the actual edit, then real selection takes precedence',()=>{
 const f=fixture(),store=f.core.createStore(),stop=f.core.mountEngine(store);f.drain();f.document.emit('compositionstart',f.root);f.drain();const previous=f.text.data;
 f.document.emit('beforeinput',f.root,{isComposing:true,inputType:'insertCompositionText',data:'中🙂',getTargetRanges:()=>[{startContainer:f.text,endContainer:f.text,startOffset:2,endOffset:5}]});
 f.selection=null;f.step();assert.equal(f.caretX(),126,'no speculative advance');
 f.text.data=previous.slice(0,2)+'中🙂'+previous.slice(5);f.step();assert.equal(f.overlay().hidden,false);f.drain();assert.equal(f.caretX(),150,'UTF-16 target offset is validated against the resulting node');
 f.select(3);f.document.emit('selectionchange');f.drain();assert.equal(f.caretX(),134,'live internal focus overrides range hint');stop();store.dispose();
});
for(const order of ['input-before-end','input-after-end','cancel']) test('composition commit sequencing: '+order,()=>{
 const f=fixture(),store=f.core.createStore(),stop=f.core.mountEngine(store);store.set({blink:true});f.drain();f.document.emit('compositionstart',f.root);f.drain();f.select(9);f.document.emit('input',f.root,{isComposing:true});f.drain();
 if(order==='input-before-end'){f.select(5);f.document.emit('input',f.root,{isComposing:false,inputType:'insertFromComposition'});}
 f.document.emit('compositionend',f.root,{data:order==='cancel'?'':'中文'});f.step();
 f.select(order==='cancel'?2:5);f.selection.anchorOffset=f.selection.focusOffset;
 if(order==='input-after-end')f.document.emit('input',f.root,{isComposing:true,inputType:'insertCompositionText'});
 f.drain();assert.equal(f.caretX(),110+8*f.selection.focusOffset);assert.equal(f.overlay().hidden,false);assert.ok(f.overlay().getAttribute('data-blink')!==null,'commit leaves composition even with late isComposing=true');assert.equal(f.frames.size,0);stop();store.dispose();
});
test('orphan composing input recovers a missed compositionstart; unrelated end is ignored',()=>{
 const f=fixture(),store=f.core.createStore(),stop=f.core.mountEngine(store);store.set({blink:true});f.drain();f.select(6);f.document.emit('input',f.root,{isComposing:true,inputType:'insertCompositionText'});f.drain();assert.equal(f.caretX(),158);assert.equal(f.overlay().getAttribute('data-blink'),null);
 f.document.emit('compositionend',f.document.body);f.drain();assert.equal(f.overlay().getAttribute('data-blink'),null);f.document.emit('compositionend',f.root);f.drain();assert.ok(f.overlay().getAttribute('data-blink')!==null);stop();store.dispose();
});
test('textarea composition uses updated value and internal focus, including deferred selection',()=>{
 const f=fixture(),store=f.core.createStore();const area=f.document.createElement('textarea');area._editor=true;area.rect=f.box(100,100,320,100);area.value='abTAIL';area.selectionStart=area.selectionEnd=2;area.selectionDirection='none';f.document.body.append(area);f.document.activeElement=area;
 let text;f.rangeReader=(node,offset)=>{text=node.data;return[f.box(offset*8,10,0,18)];};const stop=f.core.mountEngine(store);f.drain();f.document.emit('compositionstart',area);f.drain();
 f.document.emit('beforeinput',area,{isComposing:true,inputType:'insertCompositionText',data:'中文'});area.value='ab中文TAIL';f.document.emit('input',area,{isComposing:true});f.step();area.selectionStart=area.selectionEnd=4;f.drain();assert.equal(f.caretX(),132);assert.equal(text,'ab中文TAIL\u200b');assert.equal(f.overlay().hidden,false);
 area.selectionStart=2;area.selectionEnd=4;area.selectionDirection='backward';f.document.emit('select',area);f.drain();assert.equal(f.caretX(),116);assert.equal(f.frames.size,0);stop();store.dispose();
});
test('composition cannot bridge a clipping change, leak onto a new input, or survive disable',()=>{
 const f=fixture(),store=f.core.createStore(),stop=f.core.mountEngine(store);f.drain();f.document.emit('compositionstart',f.root);f.drain();f.document.emit('compositionupdate',f.root);f.selection=null;f.root.rect=f.box(500,500,320,100);f.step();assert.equal(f.overlay().hidden,true);
 f.document.activeElement=f.document.body;f.document.emit('focusout',f.root);f.document.emit('compositionend',f.root);f.drain();assert.equal(f.overlay().hidden,true);f.root.rect=f.box(100,100,320,100);f.select(2);f.document.emit('focusin',f.root);f.drain();
 f.document.emit('compositionstart',f.root);assert.ok(f.frames.size);store.set({enabled:false});f.drain();assert.equal(f.root.getAttribute('data-dsh-smooth-caret'),null);f.document.emit('input',f.root,{isComposing:true});assert.equal(f.frames.size,0);stop();store.dispose();
});
test('in-flight disable restores borrowed attributes and cancels all listeners/observers/frames',()=>{
 const f=fixture(),store=f.core.createStore();f.root.setAttribute('data-dsh-smooth-caret','external');const stop=f.core.mountEngine(store);f.drain();f.select(12);f.document.emit('selectionchange');f.step();assert.ok(f.frames.size);
 stop();assert.equal(f.root.getAttribute('data-dsh-smooth-caret'),'external');assert.equal(f.overlay(),null);assert.equal(f.frames.size,0);assert.equal(f.document.listenerCount,0);assert.ok(f.observers.every(o=>o.targets.length===0));assert.ok(f.resizers.every(o=>o.targets.length===0));store.dispose();assert.equal(f.window.listenerCount,0);
});
test('re-enable creates a working fresh instance and duplicate mount does not own its cleanup',()=>{
 const f=fixture(),store=f.core.createStore();for(let i=0;i<8;i++){const stop=f.core.mountEngine(store);f.drain();assert.equal(f.overlay().hidden,false);const duplicate=f.core.mountEngine(store);duplicate();assert.equal(f.overlay().hidden,false);stop();assert.equal(f.frames.size,0);}store.dispose();
});
test('disabled and reduced-motion states stop measurements and return to native',()=>{
 const f=fixture(),store=f.core.createStore(),stop=f.core.mountEngine(store);f.drain();store.set({enabled:false});f.drain();const reads=f.reads;f.document.emit('input',f.root);assert.equal(f.frames.size,0);assert.equal(f.reads,reads);assert.equal(f.root.getAttribute('data-dsh-smooth-caret'),null);
 store.set({enabled:true});f.drain();const media=f.media.get('(prefers-reduced-motion: reduce)');media.matches=true;media.emit('change');f.drain();assert.equal(f.overlay().hidden,true);assert.equal(f.root.getAttribute('data-dsh-smooth-caret'),null);stop();store.dispose();
});
test('measurement exceptions fail open and recover on the next input',()=>{
 const f=fixture(),store=f.core.createStore(),stop=f.core.mountEngine(store);f.drain();f.rangeError=true;f.document.emit('input',f.root);f.drain();assert.equal(f.overlay().hidden,true);assert.equal(f.root.getAttribute('data-dsh-smooth-caret'),null);assert.equal(f.warnings.length,1);
 f.rangeError=false;f.document.emit('input',f.root);f.drain();assert.equal(f.overlay().hidden,false);stop();store.dispose();
});
test('scroll culls offscreen caret and clears its trail',()=>{
 const f=fixture(),store=f.core.createStore(),stop=f.core.mountEngine(store);f.drain();f.rangeReader=()=>[f.box(140,400,0,18)];f.document.emit('scroll',f.root);assert.equal(f.overlay().hidden,true);f.drain();assert.equal(f.root.getAttribute('data-dsh-smooth-caret'),null);assert.equal(f.frames.size,0);stop();store.dispose();
});
test('storage denial, invalid records and cross-tab settings have bounded behavior',()=>{
 const f=fixture();f.window.localStorage={getItem(){throw Error('denied');},setItem(){throw Error('quota');}};const store=f.core.createStore();assert.equal(store.getSnapshot().enabled,true);store.set({blink:true});assert.equal(store.getSnapshot().blink,true);
 f.window.emit('storage',f.window,{key:'dsh-vivid-motion:smooth-caret:v1',newValue:'{"width":3}'});assert.equal(store.getSnapshot().width,3);f.window.emit('storage',f.window,{key:'dsh-vivid-motion:smooth-caret:v1',newValue:'!'});assert.equal(store.getSnapshot().width,2);store.dispose();assert.equal(f.window.listenerCount,0);
});
