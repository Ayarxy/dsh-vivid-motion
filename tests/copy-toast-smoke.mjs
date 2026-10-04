// Smoke test for packages/dsh-copy-toast/lib/client.js — runs the real module
// body against a minimal DOM/React stub. Read-only with respect to the plugin:
// the source is only rewritten in memory, to expose the internals it does not
// export.
import fs from 'node:fs';
import vm from 'node:vm';

const SRC = 'packages/dsh-copy-toast/lib/client.js';
let source = fs.readFileSync(SRC, 'utf8');
source = source.replace(
	'exports.TOAST = TOAST;',
	'exports.TOAST = TOAST;\nexports.__test = { spring: spring, toKeyframes: toKeyframes };'
);

// ── minimal DOM ─────────────────────────────────────────────────────────────
let idSeq = 0;
class El {
	constructor(tag) {
		this.tagName = String(tag).toUpperCase();
		this.nodeType = 1;
		this.id = ++idSeq;
		this.children = [];
		this.parentNode = null;
		this.style = {};
		this.dataset = {};
		this.attributes = {};
		this.listeners = {};
		this.innerHTML = '';
		this.textContent = '';
		this.className = '';
		this.offsetHeight = 28;
		this.animations = [];
	}
	appendChild(child) {
		child.parentNode = this;
		this.children.push(child);
		return child;
	}
	removeChild(child) {
		const i = this.children.indexOf(child);
		if (i > -1) this.children.splice(i, 1);
		child.parentNode = null;
		return child;
	}
	remove() {
		if (this.parentNode !== null) this.parentNode.removeChild(this);
	}
	contains(node) {
		for (let n = node; n; n = n.parentNode) if (n === this) return true;
		return false;
	}
	setAttribute(k, v) {
		this.attributes[k] = String(v);
	}
	getAttribute(k) {
		return this.attributes[k] ?? null;
	}
	addEventListener(type, fn) {
		(this.listeners[type] = this.listeners[type] || []).push(fn);
	}
	removeEventListener(type, fn) {
		const list = this.listeners[type] || [];
		const i = list.indexOf(fn);
		if (i > -1) list.splice(i, 1);
	}
	dispatch(type, event) {
		for (const fn of this.listeners[type] || []) fn(event);
	}
	animate(keyframes, options) {
		const anim = {
			keyframes,
			options,
			playState: 'running',
			cancel() {
				this.playState = 'idle';
			},
			finished: Promise.resolve()
		};
		this.animations.push(anim);
		return anim;
	}
	querySelector(sel) {
		const want = sel.replace('.', '');
		const walk = (node) => {
			for (const c of node.children) {
				if (String(c.className).split(/\s+/).includes(want)) return c;
				const hit = walk(c);
				if (hit) return hit;
			}
			return null;
		};
		return walk(this);
	}
}

const documentEl = new El('html');
documentEl.attributes.lang = 'zh-CN';
const documentStub = {
	documentElement: documentEl,
	head: new El('head'),
	body: new El('body'),
	createElement: (tag) => new El(tag),
	listeners: {},
	activeElement: null,
	addEventListener(type, fn) {
		(this.listeners[type] = this.listeners[type] || []).push(fn);
	},
	removeEventListener(type, fn) {
		const list = this.listeners[type] || [];
		const i = list.indexOf(fn);
		if (i > -1) list.splice(i, 1);
	},
	execCommand: () => true
};
documentStub.body.parentNode = documentEl;

// The DOM selection the clipboard events are gated on.
let selectionText = 'some selected text';
const selectionHost = new El('div');
selectionHost.isContentEditable = true;
const selectionStub = {
	anchorNode: selectionHost,
	focusNode: selectionHost,
	get rangeCount() {
		return selectionText.length > 0 ? 1 : 0;
	},
	toString: () => selectionText
};

class Clipboard {
	writeText(text) {
		return text === 'nope' ? Promise.reject(new Error('denied')) : Promise.resolve();
	}
	write() {
		return Promise.resolve();
	}
}
const clipboard = new Clipboard();
const nativeWriteText = Clipboard.prototype.writeText;

// ── React stub ──────────────────────────────────────────────────────────────
const effects = [];
const React = {
	Fragment: Symbol('Fragment'),
	createElement(type, props, ...children) {
		return { type, props: props || {}, children };
	},
	useRef(initial) {
		return { current: initial === undefined ? null : initial };
	},
	useEffect(fn) {
		effects.push(fn);
	}
};

// ── module host ─────────────────────────────────────────────────────────────
let registration = null;
const sandbox = {
	window: {
		__ModuleLoader__: {
			load(reg) {
				registration = reg;
			}
		},
		Clipboard,
		matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
		getSelection: () => selectionStub,
		setTimeout,
		clearTimeout
	},
	document: documentStub,
	navigator: { clipboard, language: 'zh-CN' },
	React,
	Symbol,
	Object,
	Math,
	JSON,
	String,
	Number,
	Boolean,
	Array,
	Promise,
	Error,
	TypeError,
	performance: { now: () => Date.now() },
	setTimeout,
	clearTimeout,
	getComputedStyle: (el) => ({
		transform: el.style.transform || 'none',
		opacity: el.style.opacity === undefined ? '1' : el.style.opacity
	}),
	console
};
sandbox.window.window = sandbox.window;
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: SRC });

const results = [];
const check = (label, ok, extra = '') => {
	results.push({ label, ok: !!ok, extra });
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
};

check('module registers under the package name', registration !== null && registration.id === 'dsh-copy-toast');

const requireStub = (spec) => {
	if (spec === 'react') return React;
	throw new Error('unexpected require(' + spec + ')');
};
const mod = registration.factory(requireStub);
check('factory returns apply + inject', typeof mod.apply === 'function' && Array.isArray(mod.inject));
check('inject declares slots', JSON.stringify(mod.inject) === '["slots"]');

// ── spring maths ────────────────────────────────────────────────────────────
const { spring, toKeyframes } = mod.__test;
const sp = spring(52, 0, 520, 26);
check('spring settles', Math.abs(sp.frames[sp.frames.length - 1].x) < 0.2 && sp.dur > 0.1 && sp.dur < 1.5, `dur=${sp.dur.toFixed(3)}s frames=${sp.frames.length}`);
check('spring starts near the from value', sp.frames[0].x > 40 && sp.frames[0].x < 52, `x0=${sp.frames[0].x.toFixed(2)}`);
let mono = true;
for (let i = 1; i < sp.frames.length; i++) if (sp.frames[i].t <= sp.frames[i - 1].t) mono = false;
check('spring time is monotonic', mono);
const kf = toKeyframes(sp, (f) => ({ transform: `translate3d(0,${f.x}px,0)` }));
let offsetsOk = kf[0].offset === 0 && kf[kf.length - 1].offset === 1;
for (let i = 1; i < kf.length; i++) if (kf[i].offset <= kf[i - 1].offset) offsetsOk = false;
check('keyframe offsets are strictly increasing and span 0..1', offsetsOk, `n=${kf.length}`);
check('spring.at clamps outside the range', Math.abs(sp.at(-5) - sp.frames[0].x) < 1e-9 && Math.abs(sp.at(99) - sp.frames[sp.frames.length - 1].x) < 1e-9);

// ── locale stub + apply ─────────────────────────────────────────────────────
const registered = [];
const localeStub = {
	register(ns, locale, dict) {
		registered.push({ ns, locale, dict });
		return () => {};
	},
	bind(ns) {
		return (key) => {
			for (const r of registered) if (r.locale === 'zh' && r.ns === ns && key in r.dict) return r.dict[key];
			return key;
		};
	}
};

const effectsRun = [];
const slotRegistrations = [];
let injectedKey = null;
const ctx = {
	get: (name) => (name === 'locale' ? localeStub : undefined),
	effect(fn, label) {
		effectsRun.push({ label, dispose: fn() });
	},
	slots: {
		inject(key, cb) {
			injectedKey = key;
			slotRegistrations.push(cb());
		},
		register(options, component) {
			return { options, component };
		}
	}
};

mod.apply(ctx);
check('apply installs two effects (watcher + dictionaries)', effectsRun.length === 2, effectsRun.map((e) => e.label).join(' | '));
check('locale dictionaries registered for zh and en', registered.length === 2 && registered[0].dict.copied === '已复制' && registered[1].dict.copied === 'Copied');
check('injects into shell.overlay', injectedKey === 'shell.overlay');
const entry = slotRegistrations[0];
check('registered with a fresh id and an order', entry.options.id === 'dsh-copy-toast' && entry.options.name === 'shell.overlay' && typeof entry.options.order === 'number', JSON.stringify(entry.options));

// ── mount the layer the way React would ─────────────────────────────────────
const tree = entry.component({});
check('layer renders a stylesheet and a container', tree.children.length === 2 && tree.children[0].type === 'style' && tree.children[1].props.className === 'dct-layer');
check('stylesheet carries the prefixed rules', /\.dct-toast\{/.test(tree.children[0].props.dangerouslySetInnerHTML.__html) && !/(^|[^t])\.toast\{/.test(tree.children[0].props.dangerouslySetInnerHTML.__html));

const container = new El('div');
container.className = 'dct-layer';
tree.children[1].props.ref.current = container;
check('one mount effect', effects.length === 1);
const unmount = effects[0]();
effects.length = 0;

// ── copy path 1: the document copy event ────────────────────────────────────
const copyListeners = documentStub.listeners.copy || [];
check('copy listener installed on document', copyListeners.length === 1);

const tick = () => new Promise((r) => setTimeout(r, 5));

// Slots are appended, so DOM order is creation order — rank comes from the inline
// transform and z-index instead. The front toast is therefore the LAST child.
const front = () => container.children[container.children.length - 1];
const frontTitle = () => front().children[0].children[1].textContent;

copyListeners[0]({ isTrusted: true, defaultPrevented: false });
await tick();
check('document copy raises one toast', container.children.length === 1, `children=${container.children.length}`);
const firstToast = front().children[0];
check('toast carries role=status', firstToast.attributes.role === 'status');
check('toast text is the localized confirmation', firstToast.children[1].textContent === '已复制', JSON.stringify(firstToast.children[1].textContent));
check('toast ran an entrance animation', firstToast.animations.length >= 1);
check('icon chip animation ran too', firstToast.children[0].animations.length >= 1);
check('slot stacked at rank 0', /translateY\(0px\)/.test(front().style.transform), front().style.transform);

copyListeners[0]({ isTrusted: true, defaultPrevented: true });
await tick();
check('a prevented copy raises nothing', container.children.length === 1, `children=${container.children.length}`);

// ── copy path 2: the async Clipboard API ────────────────────────────────────
check('Clipboard.prototype.writeText is patched', Clipboard.prototype.writeText !== nativeWriteText);
const before = container.children.length;
await clipboard.writeText('hello');
await tick();
check('writeText success raises one toast', container.children.length === before + 1, `children=${container.children.length}`);
check('the new toast takes rank 0', /translateY\(0px\)/.test(front().style.transform), front().style.transform);
check('the older toast is pushed up and shrunk', /translateY\(-12px\) scale\(0\.95\)/.test(container.children[0].style.transform), container.children[0].style.transform);

// a rejected write must not confirm
await clipboard.writeText('nope').catch(() => {});
await tick();
check('a rejected write raises nothing', container.children.length === before + 1, `children=${container.children.length}`);

// ── stack cap ───────────────────────────────────────────────────────────────
for (let i = 0; i < 6; i++) {
	copyListeners[0]({ isTrusted: true, defaultPrevented: false });
	await tick();
}
check('a burst never exceeds the cap plus the exits in flight', container.children.length <= mod.TOAST.maxVisible + 6, `children=${container.children.length}`);
await new Promise((r) => setTimeout(r, 300)); // longer than the 220 ms exit
check('after the exit animations only maxVisible nodes remain', container.children.length === mod.TOAST.maxVisible, `children=${container.children.length}`);

// ── cut ─────────────────────────────────────────────────────────────────────
const cutListeners = documentStub.listeners.cut || [];
check('cut listener installed on document', cutListeners.length === 1);

const beforeCut = container.children.length;
const cutEditor = new El('textarea');
cutEditor.value = 'selected text';
cutEditor.selectionStart = 0;
cutEditor.selectionEnd = cutEditor.value.length;
cutListeners[0]({ isTrusted: true, defaultPrevented: false, target: cutEditor });
cutEditor.value = ''; // The native action deletes after dispatch, before the check.
await tick();
check('a cut raises one toast', container.children.length === beforeCut + 1, `children=${container.children.length}`);
check('the cut toast says 已剪切', frontTitle() === '已剪切', JSON.stringify(frontTitle()));

const beforePreventedCut = container.children.length;
cutListeners[0]({ isTrusted: true, defaultPrevented: true, target: documentStub.body });
await tick();
check('a prevented cut raises nothing', container.children.length === beforePreventedCut, `children=${container.children.length}`);

// ── empty actions must not confirm ──────────────────────────────────────────
selectionText = '';
documentStub.activeElement = null;
const beforeEmpty = container.children.length;
copyListeners[0]({ isTrusted: true, defaultPrevented: false, target: documentStub.body });
await tick();
check('an empty Ctrl+C raises nothing', container.children.length === beforeEmpty, `children=${container.children.length}`);
cutListeners[0]({ isTrusted: true, defaultPrevented: false, target: documentStub.body });
await tick();
check('an empty Ctrl+X raises nothing', container.children.length === beforeEmpty, `children=${container.children.length}`);

// A text control keeps its own selection, which the DOM selection may not mirror.
const editor = new El('textarea');
editor.selectionStart = 2;
editor.selectionEnd = 9;
documentStub.activeElement = editor;
copyListeners[0]({ isTrusted: true, defaultPrevented: false, target: editor });
await tick();
check('a selection inside a text control confirms', container.children.length === beforeEmpty + 1, `children=${container.children.length}`);
check('that confirmation still says 已复制', frontTitle() === '已复制', JSON.stringify(frontTitle()));

editor.selectionStart = 9;
editor.selectionEnd = 9;
const beforeCaret = container.children.length;
copyListeners[0]({ isTrusted: true, defaultPrevented: false, target: editor });
await tick();
check('a collapsed caret raises nothing', container.children.length === beforeCaret, `children=${container.children.length}`);
documentStub.activeElement = null;

const beforeEmptyWrite = container.children.length;
await clipboard.writeText('');
await tick();
check('writing an empty string raises nothing', container.children.length === beforeEmptyWrite, `children=${container.children.length}`);

// restore a real selection for the teardown checks
selectionText = 'some selected text';

// ── unmount restores everything ─────────────────────────────────────────────
const patchedWriteText = Clipboard.prototype.writeText;
unmount();
await tick();
check('unmount empties the layer', container.children.length === 0, `children=${container.children.length}`);
check('unmount keeps the independent watcher patch installed', Clipboard.prototype.writeText === patchedWriteText);
check('the watcher outlives the layer by design', (documentStub.listeners.copy || []).length === 1);

for (const e of effectsRun) if (typeof e.dispose === 'function') e.dispose();
check('the watcher disposer removes the copy listener', (documentStub.listeners.copy || []).length === 0);
check('the watcher disposer removes the cut listener', (documentStub.listeners.cut || []).length === 0);
check('the watcher disposer restores the exact original writeText', Clipboard.prototype.writeText === nativeWriteText);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
