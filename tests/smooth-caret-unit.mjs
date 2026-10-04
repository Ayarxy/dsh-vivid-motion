import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
const source = fs.readFileSync(new URL('../packages/dsh-smooth-caret/lib/client.js', import.meta.url), 'utf8');
let registration;
vm.runInNewContext(source.replace('return { apply, inject: ["slots"] };','return { advance, normalize, parseSettings, DEFAULTS, MOTION };'), {
 window: { __ModuleLoader__: { load(value) { registration = value; } } }
});
const core = registration.factory(() => ({}));
test('independent component id', () => assert.equal(registration.id,'dsh-smooth-caret'));
test('analytic response is refresh-rate independent', () => {
 const run = (hz) => { const p={x:0,y:20,vx:0,vy:0}; for(let i=0;i<hz/4;i++) core.advance(p,{x:100,y:10},1/hz); return p; };
 const baseline=run(60);
 for(const hz of [120,144,240]) { const actual=run(hz); for(const k of ['x','y','vx','vy']) assert.ok(Math.abs(actual[k]-baseline[k])<1e-8); }
});
test('retargets and long frames remain bounded', () => {
 const p={x:50,y:20,vx:800,vy:80};
 core.advance(p,{x:0,y:0},1/120); assert.ok(p.x<50 && p.x>=0); assert.ok(p.y<20 && p.y>=0);
 core.advance(p,{x:10,y:10},20); assert.equal(p.x,10); assert.equal(p.y,10);
});
test('storage values cannot inject CSS or disable through truthy coercion', () => {
 const result=core.normalize({enabled:'false',trail:null,blink:true,color:'red;display:none',width:100});
 assert.equal(result.enabled,true); assert.equal(result.trail,true); assert.equal(result.blink,true); assert.equal(result.color,'theme'); assert.equal(result.width,2);
 assert.equal(core.parseSettings('{bad').color,'theme'); assert.equal(core.normalize({color:'#ABCDEF',width:3}).color,'#abcdef');
});
test('bundle and component exports resolve locally', async () => {
 const manifest=JSON.parse(fs.readFileSync(new URL('../packages/dsh-smooth-caret/package.json',import.meta.url)));
 assert.equal(manifest.dsh.client.platform,'web'); assert.equal(manifest.dsh.client.immediately,true);
 assert.equal(typeof (await import('dsh-smooth-caret')).apply,'function');
 for(const lang of ['en','zh']) { const json=JSON.parse(fs.readFileSync(new URL(`../packages/dsh-smooth-caret/locale/${lang}.json`,import.meta.url))); assert.equal(json.meta.title,manifest.name); assert.ok(json.meta.description); }
 const patch=fs.readFileSync(new URL('../cordis.patch.yml',import.meta.url),'utf8'); assert.match(patch,/id: dsh-smooth-caret\s+name: dsh-smooth-caret/);
});
