import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import * as cordis from 'file:///D:/Code/dsh/.scratch/dsh-asar/extracted/dsh/node_modules/@deepseek-ai/cordis/lib/index.js';
const require = createRequire(new URL('./reasoning-runtime/package.json', import.meta.url));
const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html lang="en"><head></head><body></body></html>');
globalThis.window = dom.window;
globalThis.document = window.document;
function store(initial) {
  let value = initial; const listeners = new Set();
  return { getSnapshot: () => value, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    set(next) { value = next; for (const fn of listeners) fn(); }, update(fn) { const draft = { ...value }; fn(draft); this.set(draft); } };
}
const dependencies = { react: React, 'react-dom': require('react-dom'), 'react/jsx-runtime': require('react/jsx-runtime'),
  '@deepseek-ai/cordis': cordis, '@deepseek-ai/dsh-client-store': { createSnapshotStore: store },
  '@deepseek-ai/dsh-client-ui-primitives': {} };
function load(file) {
  let registration; window.__ModuleLoader__ = { load(value) { registration = value; } };
  vm.runInThisContext(fs.readFileSync(new URL(file, import.meta.url), 'utf8'));
  return registration.factory(name => { if (!(name in dependencies)) throw new Error(name); return dependencies[name]; });
}
const official = load('../.scratch/codex-reuse/dsh__node_modules__@deepseek-ai__dsh-client-ui-model-selection__lib__client.js');
const plugin = load('../packages/dsh-reasoning-slider/lib/client.js');
const ctx = new cordis.Context();
const entries = [];
const selected = { provider: 'provider', model: 'model', reasoningEffort: 'high' };
const projected = store({ next: selected });
const binding = { session: { projections: { faceOf: () => projected }, getSnapshot: () => ({ blank: true }) } };
const sessionScope = ctx.extend();
ctx.provide('slots', { inject(name, fn) { return fn(); }, register(spec, component) { entries.push({ spec, component }); return () => {}; } });
ctx.provide('sessions', { scope: () => sessionScope, binding: () => binding, subagentAddress: () => undefined });
const remoteSession = { modelCatalog: async () => ({ ok: true, value: { groups: [], failures: [], default: selected } }) };
ctx.provide('remote', { session: remoteSession, $on: () => () => {} });
ctx.provide('remote.session', remoteSession);
ctx.plugin(official.ModelDirectoryResolver);
const fiber = ctx.plugin(plugin);
await new Promise(resolve => setImmediate(resolve));
console.log('plugin status', fiber.status, 'entries', entries.map(entry => ({ name: entry.spec.name, priority: entry.spec.priority })));
try {
  const props = entries[0].spec.inject('probe-session');
  console.log('inject succeeded', Object.keys(props));
  console.log('snapshot', props.directory.getSnapshot());
} catch (error) { console.error('INJECT FAILED:', error.stack); process.exitCode = 1; }
await ctx.fiber.dispose();
dom.window.close();
