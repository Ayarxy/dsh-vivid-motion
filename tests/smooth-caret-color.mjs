import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';

// Exercise color conversion and React event/state contracts, not browser
// focus or rendering. The actual Modal/Menu own those behaviors in DSH.
const source=fs.readFileSync(new URL('../packages/dsh-smooth-caret/lib/client.js',import.meta.url),'utf8')
 .replace('return { apply, inject: ["slots"] };','return { parseHex, hexToHsv, hsvToHex, Settings, ColorEditor, TEXT, CSS };');
let registration, hooks;
const React={
 Fragment: Symbol('Fragment'),
 createElement(type,props,...children){return {type,props:{...props,children:children.flat(Infinity).filter(c=>c!==false&&c!==null&&c!==undefined)}};},
 useSyncExternalStore(_subscribe,snapshot){return snapshot();},
 useState(initial){const state=hooks, index=state.index++;if(!(index in state.values))state.values[index]=typeof initial==='function'?initial():initial;
  return [state.values[index],next=>{state.values[index]=typeof next==='function'?next(state.values[index]):next;}];}
};
const primitives=Object.fromEntries(['Switch','Menu','Button','Input','Modal','IconChevronDownOutlineRegular'].map(name=>[name,'official:'+name]));
vm.runInNewContext(source,{window:{__ModuleLoader__:{load(value){registration=value;}}},document:{documentElement:{lang:'zh'}}});
const core=registration.factory(name=>name==='react'?React:primitives);
const translate=key=>core.TEXT.zh[key];
function mount(Component,props){const state={values:[],index:0};return {render(){hooks=state;state.index=0;return Component(props);}};}
function nodes(tree){return typeof tree!=='object'||!tree?[tree]:[tree,...(tree.props?.children||[]).flatMap(nodes)];}
const find=(tree,predicate)=>nodes(tree).find(predicate);
const input=(tree)=>find(tree,node=>node?.type==='official:Input');
const button=(tree,label)=>find(tree,node=>node?.type==='official:Button'&&node.props.children[0]===label);

test('HSV preserves exact 8-bit colors and retains hue when typing gray',()=>{
 for(const hex of ['#000000','#ffffff','#fd3a4a','#4d7cff','#010101','#fefefe','#ff0000','#00ff00','#0000ff'])assert.equal(core.hsvToHex(core.hexToHsv(hex)),hex);
 let seed=9172;for(let i=0;i<2000;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const hex='#'+(seed&0xffffff).toString(16).padStart(6,'0');assert.equal(core.hsvToHex(core.hexToHsv(hex)),hex);}
 assert.equal(core.hexToHsv('#999999',225).h,225);
});
test('hex input accepts hash/no hash and mixed case, and rejects incomplete or CSS text',()=>{
 for(const value of ['#FD3A4A','FD3A4A','#fd3a4a',' fd3A4a '])assert.equal(core.parseHex(value),'#fd3a4a');
 for(const value of ['#abc','red','255, 58, 74','#FD3A4AX','#000000;background:red','','#gggggg'])assert.equal(core.parseHex(value),null);
});
test('settings show the exact four color choices and open custom without changing saved color',()=>{
 let value={enabled:true,trail:true,blink:false,color:'theme',width:2};
 const store={getSnapshot:()=>value,subscribe(){},set(patch){value={...value,...patch};}};
 const component=mount(core.Settings,{store});
 const choice=()=>find(component.render(),node=>node?.type?.name==='Choice'&&node.props.label==='光标颜色');
 assert.deepEqual(Array.from(choice().props.options,item=>item.label),['跟随主题','蓝色','萨尔萨红','自定义']);
 choice().props.onSelect('#fd3a4a');assert.equal(value.color,'#fd3a4a');assert.equal(choice().props.value,'#fd3a4a');
 choice().props.onSelect('custom');let editor=find(component.render(),node=>node?.type===core.ColorEditor);assert.ok(editor);assert.equal(editor.props.initialColor,'#fd3a4a');assert.equal(value.color,'#fd3a4a');
 editor.props.onClose();assert.equal(find(component.render(),node=>node?.type===core.ColorEditor),undefined);assert.equal(value.color,'#fd3a4a');
 choice().props.onSelect('custom');editor=find(component.render(),node=>node?.type===core.ColorEditor);editor.props.onApply('#123456');assert.equal(value.color,'#123456');assert.equal(choice().props.value,'custom');
 const reopen=find(component.render(),node=>node?.type==='official:Button'&&node.props['aria-label']==='自定义光标颜色');assert.ok(reopen);reopen.props.onClick();editor=find(component.render(),node=>node?.type===core.ColorEditor);assert.equal(editor.props.initialColor,'#123456');
 value.color='#9868d9';assert.equal(choice().props.value,'custom','old purple remains a valid custom color');
});
test('custom popup uses official Modal, rounded styling, only hex text, and explicit apply/cancel',()=>{
 const applied=[];let closed=0;
 const component=mount(core.ColorEditor,{initialColor:'#fd3a4a',translate,onApply:value=>applied.push(value),onClose:()=>closed++});
 let tree=component.render();assert.equal(tree.type,'official:Modal');assert.equal(tree.props.className,'dsh-vivid-motion-color-dialog');assert.match(core.CSS,/color-dialog\[role="dialog"\][^}]*border-radius:20px/);
 assert.equal(input(tree).props.type,'text');assert.equal(input(tree).props.value,'#FD3A4A');assert.equal(input(tree).props['data-modal-autofocus'],true);assert.equal(nodes(tree).filter(node=>node?.props?.type==='color').length,0);
 input(tree).props.onChange({target:{value:'ABCDEF'}});tree=component.render();assert.equal(input(tree).props['aria-invalid'],false);assert.deepEqual(applied,[],'typing previews without persisting');
 button(tree.props.footer,'应用').props.onClick();assert.deepEqual(applied,['#abcdef']);button(tree.props.footer,'取消').props.onClick();assert.equal(closed,1);assert.equal(applied.length,1);
});
test('invalid hex never saves, and Enter during IME does not submit the popup',()=>{
 const applied=[];const component=mount(core.ColorEditor,{initialColor:'#123456',translate,onApply:value=>applied.push(value),onClose(){}});
 let tree=component.render();input(tree).props.onChange({target:{value:'#FF'}});tree=component.render();assert.equal(input(tree).props['aria-invalid'],true);assert.equal(button(tree.props.footer,'应用').props.disabled,true);button(tree.props.footer,'应用').props.onClick();assert.deepEqual(applied,[]);
 assert.ok(find(tree,node=>node?.props?.role==='alert'));
 input(tree).props.onChange({target:{value:'#ABCDEF'}});tree=component.render();const key=input(tree).props.onKeyDown;
 key({key:'Enter',nativeEvent:{isComposing:true},preventDefault(){throw Error('must not consume composition');}});key({key:'Enter',keyCode:229,nativeEvent:{},preventDefault(){throw Error('must not consume composition');}});assert.deepEqual(applied,[]);
 key({key:'Enter',nativeEvent:{isComposing:false},preventDefault(){}});assert.deepEqual(applied,['#abcdef']);
});
test('spectrum pointer picking and keyboard sliders update the same hex draft',()=>{
 const component=mount(core.ColorEditor,{initialColor:'#ff0000',translate,onApply(){},onClose(){}});let tree=component.render();
 const spectrum=find(tree,node=>node?.props?.className==='dsh-vivid-motion-spectrum');let captured=false;
 const currentTarget={getBoundingClientRect:()=>({left:0,top:0,width:100,height:100}),setPointerCapture(){captured=true;},hasPointerCapture:()=>captured,releasePointerCapture(){captured=false;}};
 spectrum.props.onPointerDown({button:0,isPrimary:true,clientX:50,clientY:50,pointerId:1,currentTarget,preventDefault(){}});tree=component.render();assert.equal(input(tree).props.value,'#804040');
 const hue=find(tree,node=>node?.props?.type==='range'&&node.props['aria-label']==='色相');hue.props.onChange({target:{value:'120'}});tree=component.render();assert.equal(input(tree).props.value,'#408040');
 const saturation=find(tree,node=>node?.props?.type==='range'&&node.props['aria-label']==='饱和度');saturation.props.onChange({target:{value:'0'}});tree=component.render();assert.equal(input(tree).props.value,'#808080');
 const brightness=find(tree,node=>node?.props?.type==='range'&&node.props['aria-label']==='明度');brightness.props.onChange({target:{value:'1'}});tree=component.render();assert.equal(input(tree).props.value,'#FFFFFF');
});
