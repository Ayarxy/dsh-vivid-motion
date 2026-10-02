// Optional real-Chromium regression runner: isolated about:blank, no GUI server,
// no user browser profile, no clipboard calls and no external dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browserPath = process.argv.find(arg => arg.startsWith('--browser='))?.slice('--browser='.length)
  || process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (!fs.existsSync(browserPath)) throw new Error('Set CHROME_BIN or --browser=<Chrome executable> to run browser tests.');
const source = fs.readFileSync(path.join(root, 'packages/dsh-copy-toast/lib/client.js'), 'utf8').replace(
  'exports.TOAST = TOAST;',
  'exports.TOAST = TOAST; exports.__test = { createToastStack, CSS, installCopyWatcher };',
);
fs.mkdirSync(path.join(root, '.scratch'), { recursive: true });
const profile = fs.mkdtempSync(path.join(root, '.scratch/chrome-copy-toast-'));
const child = spawn(browserPath, [
  '--headless=new', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
  '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--disable-extensions', '--window-size=1280,800', 'about:blank',
], { stdio: 'ignore' });
let spawnError;
child.on('error', error => { spawnError = error; });

class CDP {
  constructor(socket) {
    this.socket = socket;
    this.sequence = 0;
    this.pending = new Map();
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      clearTimeout(entry.timeout);
      if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
      else entry.resolve(message.result);
    });
    socket.addEventListener('close', () => {
      for (const entry of this.pending.values()) { clearTimeout(entry.timeout); entry.reject(new Error('CDP closed')); }
      this.pending.clear();
    });
  }
  call(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { this.pending.delete(id); reject(new Error('CDP timed out: ' + method)); }, 15000);
      this.pending.set(id, { resolve, reject, timeout });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const response = await this.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result.value;
  }
}

let cdp;
let socket;
let passed = 0;
try {
  const portFile = path.join(profile, 'DevToolsActivePort');
  const deadline = Date.now() + 20000;
  while (!fs.existsSync(portFile)) {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null) throw new Error('Chrome exited before opening CDP: ' + child.exitCode);
    if (Date.now() >= deadline) throw new Error('Chrome did not open CDP within 20 seconds.');
    await delay(100);
  }
  const port = Number(fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0]);
  assert.ok(Number.isSafeInteger(port) && port > 0);
  const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  const page = targets.find(target => target.type === 'page');
  assert.ok(page?.webSocketDebuggerUrl);
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  cdp = new CDP(socket);
  await cdp.call('Page.enable');
  await cdp.call('Runtime.enable');
  await cdp.evaluate('window.__ModuleLoader__={load(reg){window.__toastModule=reg.factory(name=>{if(name!=="react")throw Error(name);return {};});}};');
  await cdp.evaluate(source);

  const move = (x, y, buttons = 0) => cdp.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons });
  const press = (x, y) => cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  const release = (x, y) => cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  const rect = index => cdp.evaluate(`(()=>{const r=__items[${index}].t.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,top:r.top,bottom:r.bottom,width:r.width};})()`);
  const landed = () => cdp.evaluate('(async()=>{await Promise.allSettled(__items.flatMap(i=>[i.enterAnim,i.slotAnim,i.iconAnim].filter(Boolean).map(a=>a.finished)));})()');
  const frame = () => cdp.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  async function setup(count = 1, reduce = false) {
    await cdp.evaluate('if(window.__cutWatchDispose){__cutWatchDispose();__cutWatchDispose=null;}if(window.__stack) __stack.dispose();');
    await move(5, 5);
    await cdp.call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduce ? 'reduce' : 'no-preference' }] });
    await cdp.call('Page.setDocumentContent', {
      frameId: (await cdp.call('Page.getFrameTree')).frameTree.frame.id,
      html: '<!doctype html><html lang="en"><head></head><body><button id="underlay" style="position:fixed;inset:0;border:0;background:#f0f2f5"></button><div id="shell" style="position:fixed;inset:0;pointer-events:none"></div></body></html>',
    });
    await cdp.evaluate(`(()=>{
      const style=document.createElement('style');style.textContent=__toastModule.__test.CSS;document.head.appendChild(style);
      window.__layer=document.createElement('div');__layer.className='dct-layer';document.getElementById('shell').appendChild(__layer);
      window.__stack=__toastModule.__test.createToastStack(__layer);window.__items=[];window.__underClicks=0;
      document.getElementById('underlay').addEventListener('click',()=>__underClicks++);
      for(let i=0;i<${count};i++){const item=__stack.show('Copied '+i);item.t.addEventListener('pointerdown',e=>window.__pointerId=e.pointerId);__items.push(item);}
    })()`);
    await landed();
  }
  const pass = label => { passed++; console.log('PASS browser: ' + label); };

  await setup();
  let point = await rect(0);
  await move(point.x, point.y);
  await press(point.x, point.y);
  await move(point.x + 40, point.y, 1);
  await release(point.x + 40, point.y);
  await cdp.evaluate('(async()=>{await __items[0].motionAnim.finished;})()');
  await frame();
  let state = await cdp.evaluate('({inline:__items[0].t.style.transform,computed:getComputedStyle(__items[0].t).transform,closing:__items[0].closing})');
  assert.equal(state.inline, '');
  assert.equal(state.computed, 'none');
  assert.equal(state.closing, false);
  pass('small drag finishes at the true resting style');

  await setup();
  point = await rect(0);
  await move(point.x, point.y);
  await press(point.x, point.y);
  await move(point.x + 40, point.y, 1);
  await release(point.x + 40, point.y);
  await cdp.evaluate('window.__previousBack=__items[0].motionAnim;');
  await press(point.x + 40, point.y);
  const before = await cdp.evaluate('new DOMMatrixReadOnly(getComputedStyle(__items[0].t).transform).e');
  await move(point.x + 50, point.y, 1);
  state = await cdp.evaluate('({x:new DOMMatrixReadOnly(getComputedStyle(__items[0].t).transform).e,old:__previousBack.playState,dragging:__items[0].dragging})');
  assert.equal(state.old, 'idle');
  assert.equal(state.dragging, true);
  assert.ok(Math.abs(state.x - before - 10) < .2, JSON.stringify({ before, ...state }));
  await release(point.x + 50, point.y);
  pass('re-grab cancels the old WAAPI effect and follows the pointer');

  await setup();
  point = await rect(0);
  await move(point.x, point.y);
  await press(point.x, point.y);
  await release(point.x, point.y);
  await cdp.evaluate('new Promise(resolve=>setTimeout(resolve,2200))');
  state = await cdp.evaluate('({hovered:__items[0].hovered,timer:__items[0].timer,closing:__items[0].closing,connected:__items[0].slot.isConnected,remaining:__items[0].remaining})');
  assert.equal(state.hovered, true);
  assert.equal(state.timer, null);
  assert.equal(state.closing, false);
  assert.equal(state.connected, true);
  await move(5, 5);
  await cdp.evaluate('new Promise(resolve=>setTimeout(resolve,__items[0].remaining+250))');
  assert.equal(await cdp.evaluate('__items[0].slot.isConnected'), false);
  pass('hover remains paused after mouseup and departure resumes expiry');

  await setup();
  await cdp.call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await cdp.evaluate('window.__captureTrace=[];for(const type of ["gotpointercapture","lostpointercapture","pointerdown","pointermove","pointerup"])document.addEventListener(type,e=>__captureTrace.push({type,id:e.pointerId,target:e.target.className,captured:__items[0].t.hasPointerCapture(e.pointerId)}),true);');
  point = await rect(0);
  await cdp.call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x, y: point.y, id: 1 }] });
  await cdp.call('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x + 80, y: point.y, id: 1 }] });
  await frame();
  await cdp.evaluate('window.__captureBefore=__items[0].t.hasPointerCapture(__pointerId);__items[0].t.releasePointerCapture(__pointerId);');
  await cdp.call('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x + 81, y: point.y, id: 1 }] });
  await frame();
  state = await cdp.evaluate('({dragging:__items[0].dragging,closing:__items[0].closing,captured:__items[0].t.hasPointerCapture(__pointerId),before:__captureBefore,trace:__captureTrace})');
  assert.equal(state.before, true, JSON.stringify(state));
  assert.equal(state.dragging, false, JSON.stringify(state));
  assert.equal(state.closing, false);
  assert.equal(state.captured, false);
  assert.ok(state.trace.some(event => event.type === 'lostpointercapture'));
  await cdp.call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.call('Emulation.setTouchEmulationEnabled', { enabled: false });
  pass('real lostpointercapture cancels instead of flinging or sticking');

  await setup();
  await cdp.call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  point = await rect(0);
  await cdp.call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x, y: point.y, id: 1 }] });
  await cdp.call('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x + 80, y: point.y, id: 1 }] });
  await frame();
  assert.equal(await cdp.evaluate('__items[0].dragging'), true);
  await cdp.call('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await frame();
  state = await cdp.evaluate('({dragging:__items[0].dragging,closing:__items[0].closing,hovered:__items[0].hovered,timer:__items[0].timer})');
  assert.equal(state.dragging, false);
  assert.equal(state.closing, false);
  assert.equal(state.hovered, false);
  assert.notEqual(state.timer, null);
  await cdp.call('Emulation.setTouchEmulationEnabled', { enabled: false });
  pass('real touch cancellation beyond 64px restores the toast');

  await setup(4);
  const hiddenPoint = await cdp.evaluate('(()=>{const r=__items[0].t.getBoundingClientRect();const x=r.x+r.width/2,y=r.top+2;return {x,y,hit:document.elementFromPoint(x,y)?.id,opacity:getComputedStyle(__items[0].slot).opacity};})()');
  assert.equal(hiddenPoint.opacity, '0');
  assert.equal(hiddenPoint.hit, 'underlay');
  await move(hiddenPoint.x, hiddenPoint.y);
  await press(hiddenPoint.x, hiddenPoint.y);
  await release(hiddenPoint.x, hiddenPoint.y);
  assert.equal(await cdp.evaluate('__underClicks'), 1);
  pass('the transparent fourth card does not intercept an actual click');

  await setup(2);
  point = await rect(1);
  await move(point.x, point.y);
  await cdp.evaluate('(async()=>{await Promise.allSettled(__items.map(i=>i.slotAnim?.finished));})()');
  const gap = await cdp.evaluate('(()=>{const older=__items[0].t.getBoundingClientRect(),front=__items[1].t.getBoundingClientRect();const x=front.x+front.width/2,y=(older.bottom+front.top)/2;return {x,y,hit:document.elementFromPoint(x,y)?.className,height:__layer.offsetHeight};})()');
  assert.equal(gap.hit, 'dct-layer');
  assert.ok(gap.height > 0);
  await move(gap.x, gap.y);
  await frame();
  assert.equal(await cdp.evaluate('__layer.style.pointerEvents'), 'auto');
  assert.equal(await cdp.evaluate('__items[0].slot.style.opacity'), '1');
  await move(5, 5);
  await frame();
  assert.equal(await cdp.evaluate('__layer.style.height'), '0px');
  pass('expanded gaps keep the stack open without a zero-size hover hole');

  await setup(1, true);
  assert.equal(await cdp.evaluate('__items[0].enterAnim.effect.getTiming().duration'), 1);
  point = await rect(0);
  await move(point.x, point.y);
  await press(point.x, point.y);
  await move(point.x + 40, point.y, 1);
  await release(point.x + 40, point.y);
  await frame();
  assert.equal(await cdp.evaluate('getComputedStyle(__items[0].t).transform'), 'none');
  await cdp.evaluate('__stack.dispose();');
  assert.equal(await cdp.evaluate('__layer.children.length'), 0);
  assert.equal(await cdp.evaluate('document.getAnimations().filter(a=>a.playState==="running").length'), 0);
  pass('reduced motion, resting style and complete animation disposal');

  // Use actual contenteditable/Range/DataTransfer APIs with a simulated trusted
  // clipboard event. Do not press Ctrl+X or write to the user's system clipboard.
  for (const [name, removeText, writePayload, expectedCount] of [
    ['multi-node editor-managed cut shows 已剪切', true, true, 1],
    ['clipboard data without deletion is not a cut', false, true, 0],
    ['deletion without clipboard data is not a cut', true, false, 0],
  ]) {
    await setup(0, true);
    const cutState = await cdp.evaluate(`(async()=>{
      const editor=document.createElement('div');editor.contentEditable='true';
      editor.innerHTML='before <b>CU</b><i>T</i> after';document.body.appendChild(editor);
      const range=document.createRange();range.setStart(editor.querySelector('b').firstChild,0);
      range.setEnd(editor.querySelector('i').firstChild,1);
      const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
      let capture;const add=document.addEventListener;const descriptor=Object.getOwnPropertyDescriptor(document,'addEventListener');
      document.addEventListener=function(type,listener,options){
        if(type==='cut'&&(options===true||options?.capture))capture=listener;
        return Reflect.apply(add,this,arguments);
      };
      try{
        window.__cutWatchDispose=__toastModule.__test.installCopyWatcher(
          ()=>__stack.show('已复制'),()=>__stack.show('已剪切'));
      }finally{
        if(descriptor)Object.defineProperty(document,'addEventListener',descriptor);else delete document.addEventListener;
      }
      if(typeof capture!=='function')throw Error('cut capture listener missing');
      const data=new DataTransfer();
      const event={type:'cut',isTrusted:true,target:editor,defaultPrevented:false,clipboardData:data};
      capture(event);event.defaultPrevented=true;
      data.setData('text/plain',${writePayload}?'CUT':'');
      if(${removeText})queueMicrotask(()=>range.deleteContents());
      await new Promise(resolve=>setTimeout(resolve,20));
      const texts=[...__layer.querySelectorAll('.dct-title')].map(node=>node.textContent);
      __cutWatchDispose();__cutWatchDispose=null;
      return {texts,remaining:editor.textContent,setDataRestored:!Object.hasOwn(data,'setData')};
    })()`);
    assert.equal(cutState.texts.length, expectedCount, JSON.stringify(cutState));
    if (expectedCount) assert.deepEqual(cutState.texts, ['已剪切']);
    assert.equal(cutState.remaining, removeText ? 'before  after' : 'before CUT after');
    assert.equal(cutState.setDataRestored, true);
    pass(name + ' (real DOM; simulated clipboard event)');
  }

  console.log(`${passed}/${passed} real-browser checks passed. No GUI or system clipboard was accessed.`);
} finally {
  if (cdp && socket?.readyState === WebSocket.OPEN) {
    try { await cdp.call('Browser.close'); } catch {}
  }
  if (socket) socket.close();
  if (child.exitCode === null && !child.killed) child.kill();
  // Retain this isolated profile under .scratch for diagnosis; never remove an
  // unchecked computed path or touch the user's normal browser profile.
}
