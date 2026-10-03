window.__ModuleLoader__.load({
	id: "dsh-smooth-caret",
	factory: (require) => {
		const React = require("react");
		const { Switch, Menu, Button, Input, Modal, IconChevronDownOutlineRegular } = require("@deepseek-ai/dsh-client-ui-primitives");
		const NS = "dsh-smooth-caret";
		const STORAGE_KEY = "dsh-vivid-motion:smooth-caret:v1";
		const MARKER = "data-dsh-smooth-caret";
		const SELECTOR = "[data-composer-input], textarea[data-phase], [data-question-key] textarea, [data-question-scroll] textarea";
		const DEFAULTS = Object.freeze({ enabled: true, trail: true, blink: false, color: "theme", width: 2 });
		const MOTION = Object.freeze({ omega: 48, trailMs: 140, trailPoints: 20, settle: 0.08 });
		const AXES = [["x", "vx"], ["y", "vy"]];
		const COLORS = [["theme", "theme"], ["#4d7cff", "blue"], ["#fd3a4a", "salsa"]];
		const TEXT = {
			zh: {
				title: "dsh-smooth-caret", description: "聊天与询问作答框的光标动效，设置保存在此浏览器。",
				enabled: "启用平滑光标", trail: "彗星拖尾", blink: "光标闪烁", blinkDescription: "亮起和隐藏各持续 500 ms",
				color: "光标颜色", theme: "跟随主题", blue: "蓝色", salsa: "萨尔萨红",
				custom: "自定义", customColor: "自定义光标颜色", hex: "十六进制颜色", hexError: "请输入 6 位十六进制色值，如 #FD3A4A",
				hue: "色相", saturation: "饱和度", brightness: "明度", apply: "应用", cancel: "取消", close: "关闭",
				width: "光标粗细", thin: "细", medium: "中", thick: "粗"
			},
			en: {
				title: "dsh-smooth-caret", description: "Caret effects for chat and question inputs. Settings are saved in this browser.",
				enabled: "Enable smooth caret", trail: "Comet trail", blink: "Blink caret", blinkDescription: "Visible for 500 ms, then hidden for 500 ms",
				color: "Caret color", theme: "Follow theme", blue: "Blue", salsa: "Salsa red",
				custom: "Custom", customColor: "Custom caret color", hex: "Hex color", hexError: "Enter a 6-digit hex color, such as #FD3A4A",
				hue: "Hue", saturation: "Saturation", brightness: "Brightness", apply: "Apply", cancel: "Cancel", close: "Close",
				width: "Caret width", thin: "Thin", medium: "Medium", thick: "Thick"
			}
		};
		const CSS = `
/* Only the currently measured editor lends its caret to this component. */
[${MARKER}="active"], [${MARKER}="active"] * { caret-color: transparent !important; }
#${NS}-overlay {
 position:fixed; pointer-events:none; overflow:hidden; contain:strict;
 z-index:2147482000; color:var(--dsw-alias-state-business-primary, var(--dsw-alias-label-primary, currentColor));
}
#${NS}-overlay[hidden] { display:none; }
#${NS}-overlay svg { position:absolute; inset:0; width:100%; height:100%; overflow:hidden; }
#${NS}-overlay .caret {
 position:absolute; top:0; left:0; border-radius:1px; background:currentColor;
 box-shadow:0 0 5px color-mix(in srgb, currentColor 30%, transparent); will-change:transform;
}
#${NS}-overlay[data-blink] .caret { animation:dsh-smooth-caret-blink 1s steps(1, end) infinite; }
@keyframes dsh-smooth-caret-blink { 0%, 100% { opacity:1; } 50% { opacity:0; } }
.dsh-vivid-motion-settings { width:100%; max-width:760px; color:var(--dsw-alias-label-primary); }
.dsh-vivid-motion-settings h2 { margin:0 0 24px; font-size:18px; font-weight:600; line-height:26px; }
.dsh-vivid-motion-settings h3 { margin:0; font-size:14px; font-weight:500; line-height:22px; }
.dsh-vivid-motion-intro { margin:4px 0 12px; font-size:12px; line-height:18px; color:var(--dsw-alias-label-tertiary); }
.dsh-vivid-motion-row { display:flex; align-items:center; justify-content:space-between; gap:24px; padding:16px 0; border-bottom:.5px solid var(--dsw-alias-border-l2); }
.dsh-vivid-motion-row:last-child { border-bottom:none; }
.dsh-vivid-motion-row-text { flex:1; min-width:0; }
.dsh-vivid-motion-label { font-size:14px; font-weight:400; line-height:22px; }
.dsh-vivid-motion-description { margin-top:4px; font-size:12px; line-height:18px; color:var(--dsw-alias-label-tertiary); }
.dsh-vivid-motion-control { flex:none; display:flex; align-items:center; }
.dsh-vivid-motion-select { gap:12px; background:var(--dsw-alias-bg-module-platform); }
.dsh-vivid-motion-select:hover { background:var(--dsw-alias-interactive-bg-hover); }
.dsh-vivid-motion-color { gap:8px; font-variant-numeric:tabular-nums; }
.dsh-vivid-motion-swatch { display:inline-block; flex:none; width:20px; height:20px; border-radius:6px; border:1px solid var(--dsw-alias-border-l2); }
.dsh-vivid-motion-color-dialog[role="dialog"] { width:min(360px, calc(100vw - 40px)); border-radius:20px; overflow:hidden; }
.dsh-vivid-motion-picker { display:grid; gap:16px; }
.dsh-vivid-motion-spectrum { position:relative; height:160px; border-radius:12px; touch-action:none; cursor:crosshair; background:linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), var(--caret-hue); }
.dsh-vivid-motion-spectrum-point { position:absolute; width:12px; height:12px; box-sizing:border-box; border:2px solid #fff; border-radius:50%; box-shadow:0 0 2px 1px #0008; transform:translate(-50%, -50%); pointer-events:none; }
.dsh-vivid-motion-slider { display:grid; grid-template-columns:56px minmax(0, 1fr); gap:12px; align-items:center; font-size:12px; color:var(--dsw-alias-label-secondary); }
.dsh-vivid-motion-slider input { width:100%; min-width:0; margin:0; appearance:none; height:12px; border-radius:999px; background:var(--caret-track); cursor:pointer; }
.dsh-vivid-motion-slider input::-webkit-slider-thumb { appearance:none; width:18px; height:18px; border:2px solid #fff; border-radius:50%; background:var(--caret-thumb); box-shadow:0 0 2px 1px #0006; }
.dsh-vivid-motion-slider input::-moz-range-thumb { width:14px; height:14px; border:2px solid #fff; border-radius:50%; background:var(--caret-thumb); box-shadow:0 0 2px 1px #0006; }
.dsh-vivid-motion-hex { display:flex; align-items:center; gap:12px; }
.dsh-vivid-motion-hex > :last-child { flex:1; min-width:0; }
.dsh-vivid-motion-color-error { margin:0; font-size:12px; color:var(--dsw-alias-status-error, #c92738); }
@media (prefers-reduced-motion: reduce), (forced-colors: active) {
 #${NS}-overlay { display:none !important; }
 [${MARKER}="active"], [${MARKER}="active"] * { caret-color:auto !important; }
}
`;

		function normalize(value) {
			const data = value && typeof value === "object" ? value : {};
			const result = { ...DEFAULTS };
			for (const key of ["enabled", "trail", "blink"]) if (typeof data[key] === "boolean") result[key] = data[key];
			if (typeof data.color === "string" && (data.color === "theme" || /^#[\da-f]{6}$/i.test(data.color))) result.color = data.color.toLowerCase();
			if ([1, 2, 3].includes(data.width)) result.width = data.width;
			return result;
		}

		function parseSettings(text) {
			try { return normalize(JSON.parse(text)); } catch { return { ...DEFAULTS }; }
		}

		function createStore() {
			let current;
			try { current = parseSettings(window.localStorage.getItem(STORAGE_KEY)); } catch { current = { ...DEFAULTS }; }
			const listeners = new Set();
			let disposed = false;
			function replace(next) {
				if (disposed) return;
				if (Object.keys(DEFAULTS).every((key) => current[key] === next[key])) return;
				current = next;
				for (const listener of listeners) listener();
			}
			function onStorage(event) {
				if (event.key === STORAGE_KEY || event.key === null) replace(parseSettings(event.newValue));
			}
			window.addEventListener("storage", onStorage);
			return {
				getSnapshot: () => current,
				subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
				set(patch) {
					if (disposed) return;
					const next = normalize({ ...current, ...patch });
					try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* Session-only settings still work. */ }
					replace(next);
				},
				dispose() { disposed = true; listeners.clear(); window.removeEventListener("storage", onStorage); }
			};
		}

		// The exact critically damped solution preserves elapsed-time behavior at
		// different refresh rates. A retarget cannot throw the caret past its goal.
		function advance(state, target, seconds) {
			const decay = Math.exp(-MOTION.omega * seconds);
			for (const [axis, velocity] of AXES) {
				const distance = state[axis] - target[axis];
				let speed = state[velocity];
				if (speed * distance > 0) speed = 0;
				const coefficient = speed + MOTION.omega * distance;
				const offset = (distance + coefficient * seconds) * decay;
				state[axis] = target[axis] + offset;
				state[velocity] = (speed - MOTION.omega * coefficient * seconds) * decay;
				if (offset * distance < 0) { state[axis] = target[axis]; state[velocity] = 0; }
			}
		}

		const px = (value) => Number.parseFloat(value) || 0;
		const elementOf = (node) => node?.nodeType === 1 ? node : node?.parentElement;
		const validRect = (rect) => rect && rect.height > 0 && Number.isFinite(rect.left + rect.top + rect.height);
		function rangeRect(range) {
			// Never trust getBoundingClientRect's previous-line fallback at a BR.
			const rects = range.getClientRects();
			for (let i = rects.length - 1; i >= 0; i--) if (validRect(rects[i])) return rects[i];
			return null;
		}
		function caretRect(rect) { return { x: rect.left, y: rect.top, height: rect.height }; }
		function blockOf(node, root) {
			let element = elementOf(node);
			while (element && element !== root) {
				if (!/^(inline|contents)/.test(getComputedStyle(element).display)) return element;
				element = element.parentElement;
			}
			return root;
		}
		function lineHeight(style) { return px(style.lineHeight) || px(style.fontSize) * 1.2; }
		function lineStart(block, style) {
			const rect = block.getBoundingClientRect();
			const sx = block.offsetWidth ? rect.width / block.offsetWidth : 1;
			const left = rect.left + (px(style.borderLeftWidth) + px(style.paddingLeft)) * sx;
			const right = rect.right - (px(style.borderRightWidth) + px(style.paddingRight)) * sx;
			if (style.textAlign === "center") return (left + right) / 2;
			const rtl = style.direction === "rtl";
			const alignRight = style.textAlign === "right" || (style.textAlign === "start" && rtl) || (style.textAlign === "end" && !rtl);
			return alignRight ? right : left;
		}

		function measureRichPoint(root, node, offset, range) {
			if (!node || !root.contains(node) || !Number.isInteger(offset) || offset < 0 || offset > (node.nodeType === 3 ? node.length : node.childNodes.length)) return null;
			const island = elementOf(node)?.closest('[contenteditable="false"]');
			if (island && root.contains(island)) return null;
			range.setStart(node, offset);
			range.collapse(true); // focus, not the document-ordered start of a selection
			const block = blockOf(node, root);
			const style = getComputedStyle(block);
			if (style.writingMode !== "horizontal-tb") return null;
			const boundary = node.nodeType === 1 || (node.nodeType === 3 && node.length === 0);
			if (boundary) {
				const next = node.nodeType === 1 ? node.childNodes[offset] : node.nextSibling;
				const previous = node.nodeType === 1 ? node.childNodes[offset - 1] : node.previousSibling;
				// A following BR is the empty line's own box, including Lexical's
				// trailing sentinel. A trailing real break advances by one line.
				if (next?.nodeName === "BR") {
					const rect = next.getBoundingClientRect();
					if (validRect(rect)) return caretRect(rect);
				}
				if (previous?.nodeName === "BR") {
					const rect = previous.getBoundingClientRect();
					if (validRect(rect)) {
						const placeholder = block.childNodes.length === 1 && block.firstChild === previous;
						const box = block.getBoundingClientRect();
						const sy = block.offsetHeight ? box.height / block.offsetHeight : 1;
						return { x: lineStart(block, style), y: rect.top + (placeholder ? 0 : lineHeight(style) * sy), height: rect.height };
					}
				}
			}
			const rect = rangeRect(range);
			if (rect) return caretRect(rect);
			// An element-boundary focus may sit just outside its empty paragraph.
			// Descend only along that boundary, never scan the editor's full text.
			if (node.nodeType === 1) {
				const next = node.childNodes[offset], previous = node.childNodes[offset - 1];
				const child = next || previous;
				if (child && child.nodeName !== "BR" && (child.nodeType === 1 || child.nodeType === 3)) {
					return measureRichPoint(root, child, next ? 0 : (child.nodeType === 3 ? child.length : child.childNodes.length), range);
				}
			}
			// Empty paragraphs have no Range box. Derive their first line without
			// inserting probes into the live editor (which would disturb Lexical/IME).
			if (block.textContent === "" && !block.querySelector('img, [contenteditable="false"]')) {
				const box = block.getBoundingClientRect();
				if (!box.height) return null;
				const sx = block.offsetWidth ? box.width / block.offsetWidth : 1;
				const sy = block.offsetHeight ? box.height / block.offsetHeight : 1;
				const height = Math.min(lineHeight(style), px(style.fontSize) * 1.2) * sy;
				return {
					x: lineStart(block, style) + (style.direction === "rtl" ? -1 : 1) * px(style.textIndent) * sx,
					y: box.top + (px(style.borderTopWidth) + px(style.paddingTop)) * sy + (lineHeight(style) * sy - height) / 2,
					height
				};
			}
			return null; // Leave the native caret in charge of an unmeasurable boundary.
		}
		function measureRich(root, range, selection = document.getSelection()) {
			const node = selection?.focusNode;
			if (!node || !root.contains(node) || !root.contains(selection.anchorNode)) return null;
			return measureRichPoint(root, node, selection.focusOffset, range);
		}

		// beforeinput describes text that has NOT been inserted yet. Retain only
		// its local replacement range; never search the editor for event.data.
		// The hint is usable only after that exact replacement appears in the DOM,
		// and only while the browser's real selection is temporarily unavailable.
		function compositionEdit(root, event) {
			if (root.tagName === "TEXTAREA" || typeof event.data !== "string") return null;
			const edit = event.getTargetRanges?.()[0];
			const node = edit?.startContainer;
			if (!node || node.nodeType !== 3 || edit.endContainer !== node || !root.contains(node)) return null;
			const start = edit.startOffset, end = edit.endOffset;
			if (start < 0 || end < start || end > node.length) return null;
			return { node, offset: start + event.data.length, start, end, before: node.data, data: event.data };
		}

		const MIRROR_PROPERTIES = [
			"fontFamily", "fontSize", "fontWeight", "fontStyle", "fontStretch", "fontVariant", "fontKerning",
			"fontFeatureSettings", "fontVariationSettings", "fontOpticalSizing", "lineHeight", "letterSpacing",
			"wordSpacing", "textAlign", "textIndent", "textTransform", "textRendering", "tabSize", "direction",
			"unicodeBidi", "wordBreak", "overflowWrap", "hyphens", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"
		];
		function createMirror() {
			const element = document.createElement("div");
			element.setAttribute("aria-hidden", "true");
			element.style.cssText = "all:initial;position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;z-index:-1;box-sizing:border-box;overflow:hidden;contain:layout style;";
			const text = document.createTextNode("");
			element.append(text);
			document.body.append(element);
			return { element, text };
		}
		function measureTextarea(root, range, mirror) {
			const style = getComputedStyle(root);
			if (style.writingMode !== "horizontal-tb" || root.selectionStart === null || root.selectionEnd === null) return null;
			for (const key of MIRROR_PROPERTIES) if (mirror.element.style[key] !== style[key]) mirror.element.style[key] = style[key];
			// Author CSS can override the wrap attribute; mirror the used style.
			const width = root.clientWidth + "px", whiteSpace = style.whiteSpace;
			if (mirror.element.style.width !== width) mirror.element.style.width = width;
			if (mirror.element.style.whiteSpace !== whiteSpace) mirror.element.style.whiteSpace = whiteSpace;
			// One full text node retains wrapping, ligatures, bidi runs and the text
			// AFTER the focus. A zero-width terminator gives empty/trailing lines a box.
			const value = root.value + "\u200b";
			if (mirror.text.data !== value) mirror.text.data = value;
			const offset = root.selectionDirection === "backward" ? root.selectionStart : root.selectionEnd;
			range.setStart(mirror.text, offset);
			range.collapse(true);
			const rect = rangeRect(range);
			if (!rect) return null;
			const box = root.getBoundingClientRect();
			const origin = mirror.element.getBoundingClientRect();
			const sx = root.offsetWidth ? box.width / root.offsetWidth : 1;
			const sy = root.offsetHeight ? box.height / root.offsetHeight : 1;
			return {
				x: box.left + (root.clientLeft + rect.left - origin.left - root.scrollLeft) * sx,
				y: box.top + (root.clientTop + rect.top - origin.top - root.scrollTop) * sy,
				height: rect.height * sy
			};
		}

		function clipRect(root) {
			const viewport = window.visualViewport;
			const clip = {
				left: viewport?.offsetLeft || 0, top: viewport?.offsetTop || 0,
				right: (viewport?.offsetLeft || 0) + (viewport?.width || window.innerWidth),
				bottom: (viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight)
			};
			for (let element = root; element; element = element.parentElement) {
				const style = getComputedStyle(element);
				if (style.visibility !== "visible" || style.display === "none" || Number(style.opacity) === 0) return null;
				const paint = /paint|strict|content/.test(style.contain);
				const x = element === root || paint || /auto|scroll|hidden|clip/.test(style.overflowX);
				const y = element === root || paint || /auto|scroll|hidden|clip/.test(style.overflowY);
				if (!x && !y) continue;
				const box = element.getBoundingClientRect();
				const sx = element.offsetWidth ? box.width / element.offsetWidth : 1;
				const sy = element.offsetHeight ? box.height / element.offsetHeight : 1;
				const left = box.left + element.clientLeft * sx;
				const top = box.top + element.clientTop * sy;
				if (x) { clip.left = Math.max(clip.left, left); clip.right = Math.min(clip.right, left + element.clientWidth * sx); }
				if (y) { clip.top = Math.max(clip.top, top); clip.bottom = Math.min(clip.bottom, top + element.clientHeight * sy); }
			}
			return clip.right > clip.left && clip.bottom > clip.top ? clip : null;
		}

		function findEditor() {
			const focused = document.activeElement;
			const root = focused?.closest?.(SELECTOR);
			if (!root || root.disabled || root.readOnly || root.getAttribute("aria-disabled") === "true") return null;
			if (focused !== root && /^(INPUT|TEXTAREA)$/.test(focused.tagName)) return null;
			if (root.closest('[inert], [aria-hidden="true"], dialog[open]')) return null;
			return root.tagName === "TEXTAREA" || root.isContentEditable ? root : null;
		}

		function mountEngine(store) {
			if (document.getElementById(NS + "-overlay")) return () => {};
			const cleanups = [];
			let disposed = false, frame = 0, lastTime = 0, dirty = true, snap = true;
			let composition = "idle", compositionFrames = 0, editHint = null;
			let measuredFocus = null, missedMeasurements = 0;
			let root = null, originalMarker = null, target = null, clip = null, mirror = null, reported = false;
			let ancestors = [], pointStart = 0, pointCount = 0;
			const state = { x: 0, y: 0, vx: 0, vy: 0 };
			const points = Array.from({ length: MOTION.trailPoints }, () => ({ x: 0, y: 0, time: 0 }));
			const range = document.createRange();
			const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
			const forced = window.matchMedia("(forced-colors: active)");
			const overlay = document.createElement("div");
			overlay.id = NS + "-overlay";
			overlay.setAttribute("aria-hidden", "true");
			overlay.hidden = true;
			const caret = document.createElement("div");
			caret.className = "caret";
			const svgNode = (name) => document.createElementNS("http://www.w3.org/2000/svg", name);
			const svg = svgNode("svg"), defs = svgNode("defs"), gradient = svgNode("linearGradient"), path = svgNode("path");
			gradient.id = NS + "-gradient";
			gradient.setAttribute("gradientUnits", "userSpaceOnUse");
			for (const [offset, opacity] of [["0%", "0"], ["100%", ".45"]]) {
				const stop = svgNode("stop");
				stop.setAttribute("offset", offset); stop.setAttribute("stop-color", "currentColor"); stop.setAttribute("stop-opacity", opacity);
				gradient.append(stop);
			}
			defs.append(gradient); path.setAttribute("fill", `url(#${gradient.id})`); svg.append(defs, path); overlay.append(svg, caret);
			document.body.append(overlay);

			function listen(element, type, listener, options) {
				element.addEventListener(type, listener, options);
				cleanups.push(() => element.removeEventListener(type, listener, options));
			}
			function restoreCaret() {
				if (root?.getAttribute(MARKER) !== "active") return;
				if (originalMarker === null) root.removeAttribute(MARKER); else root.setAttribute(MARKER, originalMarker);
			}
			function hide() {
				restoreCaret(); overlay.hidden = true; overlay.removeAttribute("data-blink");
				target = null; pointCount = 0; path.setAttribute("d", "");
			}
			function invalidate(immediate = false) {
				if (disposed) return;
				dirty = true; snap ||= immediate;
				if (!frame) { lastTime = performance.now(); frame = requestAnimationFrame(tick); }
			}
			const resized = () => invalidate(true);
			const observer = new MutationObserver((records) => {
				if (composition !== "idle") compositionFrames = Math.max(compositionFrames, 2);
				invalidate(records.some((record) => record.type === "attributes" && record.attributeName !== "data-composer-composing"));
			});
			const resizeObserver = new ResizeObserver(resized);
			function observeAncestors() {
				const next = [];
				for (let element = root; element; element = element.parentElement) next.push(element);
				if (next.length === ancestors.length && next.every((element, i) => element === ancestors[i])) return;
				observer.disconnect(); resizeObserver.disconnect(); ancestors = next;
				for (const element of ancestors) {
					observer.observe(element, {
						attributes: true, childList: true, subtree: element === root, characterData: element === root,
						attributeFilter: ["style", "class", "dir", "lang", "data-ds-dark-theme", "data-composer-composing", "contenteditable", "disabled", "readonly", "aria-disabled", "aria-hidden", "inert", "wrap"]
					});
					resizeObserver.observe(element);
				}
			}
			function activate(next) {
				if (next === root) return;
				hide(); observer.disconnect(); resizeObserver.disconnect(); ancestors = [];
				if (mirror) mirror.text.data = "";
				root = next; originalMarker = root?.getAttribute(MARKER) ?? null;
				composition = root?.getAttribute("data-composer-composing") != null ? "active" : "idle";
				compositionFrames = 0; editHint = null; reported = false; snap = true;
				measuredFocus = null; missedMeasurements = 0;
				if (root) observeAncestors();
			}
			function measure() {
				const options = store.getSnapshot();
				activate(options.enabled && !reduced.matches && !forced.matches && !document.hidden && document.hasFocus() ? findEditor() : null);
				if (!root || !root.isConnected) {
					hide(); return;
				}
				observeAncestors();
				let next;
				if (root.tagName === "TEXTAREA") {
					mirror ||= createMirror();
					next = measureTextarea(root, range, mirror);
				} else {
					const selection = document.getSelection();
					// Removing a selected text node can reset Selection to an ancestor
					// boundary before the editor selects its replacement. Do not animate
					// toward that temporary paragraph start for one paint.
					const rebuilding = compositionFrames > 1 && measuredFocus && !root.contains(measuredFocus) && selection?.focusNode?.nodeType === 1;
					next = rebuilding ? null : measureRich(root, range, selection);
					if (next) measuredFocus = selection.focusNode;
					// Build the expected replacement only on this uncommon fallback path.
					if (!next && compositionFrames && editHint && editHint.node.data === editHint.before.slice(0, editHint.start) + editHint.data + editHint.before.slice(editHint.end)) {
						next = measureRichPoint(root, editHint.node, editHint.offset, range);
					}
				}
				missedMeasurements = next ? 0 : missedMeasurements + 1;
				const nextClip = clipRect(root);
				// Lexical may detach the selected node before restoring Selection.
				// Bridge at most two paint frames, and never bridge a scroll/clip change.
				if (!next && compositionFrames > 1 && missedMeasurements <= 2 && target && clip && nextClip && !snap &&
					["left", "top", "right", "bottom"].every((edge) => nextClip[edge] === clip[edge])) return;
				if (!next || !nextClip || next.x + options.width <= nextClip.left || next.x >= nextClip.right || next.y >= nextClip.bottom || next.y + next.height <= nextClip.top) {
					hide(); return;
				}
				if (!target || Math.abs(next.y - target.y) > next.height * 0.6 || Math.abs(next.x - state.x) > Math.max(180, (nextClip.right - nextClip.left) * 0.65)) snap = true;
				if (target && (next.x - state.x) * (target.x - state.x) < 0) pointCount = 0;
				if (!target || next.x !== target.x || next.y !== target.y) overlay.removeAttribute("data-blink");
				target = next; clip = nextClip;
				if (snap) { state.x = target.x; state.y = target.y; state.vx = state.vy = 0; pointCount = 0; }
				snap = false;
				overlay.style.left = clip.left + "px"; overlay.style.top = clip.top + "px";
				overlay.style.width = clip.right - clip.left + "px"; overlay.style.height = clip.bottom - clip.top + "px";
				overlay.style.color = options.color === "theme" ? "" : options.color;
				caret.style.width = options.width + "px"; caret.style.height = target.height + "px";
				overlay.hidden = false;
				root.setAttribute(MARKER, "active");
			}
			function drawTrail(now, moving) {
				const options = store.getSnapshot();
				while (pointCount && now - points[pointStart].time >= MOTION.trailMs) { pointStart = (pointStart + 1) % points.length; pointCount--; }
				if (!options.trail) pointCount = 0;
				// Time-based sampling keeps a 240 Hz display from exhausting the
				// bounded history sooner than a 60 Hz display.
				else if (moving && (!pointCount || now - points[(pointStart + pointCount - 1) % points.length].time >= MOTION.trailMs / (points.length - 1))) {
					if (pointCount === points.length) { pointStart = (pointStart + 1) % points.length; pointCount--; }
					const point = points[(pointStart + pointCount++) % points.length];
					point.x = state.x; point.y = state.y; point.time = now;
				}
				if (!pointCount) { path.setAttribute("d", ""); return; }
				let top = "", bottom = "";
				for (let i = 0; i < pointCount; i++) {
					const point = points[(pointStart + i) % points.length];
					const taper = Math.max(0, 1 - (now - point.time) / MOTION.trailMs) * (i + 1) / (pointCount + 1);
					const x = point.x - clip.left + options.width / 2;
					const y = point.y - clip.top + target.height / 2;
					const half = target.height * 0.42 * taper;
					top += `${i ? "L" : "M"}${x.toFixed(2)},${(y - half).toFixed(2)}`;
					bottom = `L${x.toFixed(2)},${(y + half).toFixed(2)}` + bottom;
				}
				const headX = state.x - clip.left + options.width / 2;
				const headY = state.y - clip.top;
				path.setAttribute("d", `${top}L${headX},${headY}L${headX},${headY + target.height}${bottom}Z`);
				gradient.setAttribute("x1", String(points[pointStart].x - clip.left)); gradient.setAttribute("y1", String(points[pointStart].y - clip.top));
				gradient.setAttribute("x2", String(headX)); gradient.setAttribute("y2", String(headY));
			}
			function tick(now) {
				frame = 0;
				if (disposed) return;
				try {
					if (dirty) { dirty = false; measure(); }
					// One event batch gets a bounded post-default-action check, plus a
					// second chance for the editor's deferred selection reconciliation.
					if (compositionFrames) {
						dirty = --compositionFrames > 0;
						if (!compositionFrames) {
							editHint = null;
							if (composition === "ending") composition = "idle";
						}
					}
					if (!target) { if (dirty) frame = requestAnimationFrame(tick); return; }
					const seconds = Math.max(0, (now - lastTime) / 1000); lastTime = now;
					advance(state, target, seconds);
					const moving = Math.abs(state.x - target.x) + Math.abs(state.y - target.y) > MOTION.settle || Math.abs(state.vx) + Math.abs(state.vy) > 1;
					if (!moving) { state.x = target.x; state.y = target.y; state.vx = state.vy = 0; }
					const dpr = window.devicePixelRatio || 1;
					const x = Math.round(state.x * dpr) / dpr - clip.left;
					const y = Math.round(state.y * dpr) / dpr - clip.top;
					caret.style.transform = `translate3d(${x}px,${y}px,0)`;
					drawTrail(now, moving);
					if (dirty || moving || pointCount) frame = requestAnimationFrame(tick);
					else overlay.toggleAttribute("data-blink", store.getSnapshot().blink && composition === "idle");
				} catch (error) {
					hide();
					if (!reported) { reported = true; console.warn(NS + ": native caret restored after measurement failure", error); }
				}
			}
			function dispose() {
				if (disposed) return;
				disposed = true; cancelAnimationFrame(frame); hide();
				observer.disconnect(); resizeObserver.disconnect();
				for (const cleanup of cleanups.reverse()) cleanup();
				mirror?.element.remove(); overlay.remove(); root = null; ancestors = [];
				composition = "idle"; compositionFrames = 0; editHint = measuredFocus = null;
			}
			try {
				const change = () => { if (store.getSnapshot().enabled && !reduced.matches && !forced.matches && (root || findEditor())) invalidate(); };
				const compositionTarget = (event) => {
					if (!store.getSnapshot().enabled || reduced.matches || forced.matches || document.hidden || !document.hasFocus()) return false;
					const next = findEditor();
					if (!next?.contains(event.target)) return false;
					activate(next); return true;
				};
				const compositionChanged = () => {
					compositionFrames = 3;
					overlay.removeAttribute("data-blink");
					invalidate();
				};
				listen(document, "focusin", () => invalidate(true), true);
				listen(document, "focusout", () => { activate(null); invalidate(true); }, true);
				for (const event of ["selectionchange", "select", "keyup", "pointerup"]) listen(document, event, change, true);
				listen(document, "beforeinput", (event) => {
					if (!compositionTarget(event)) return;
					if (event.isComposing || event.inputType === "insertCompositionText") {
						if (composition === "idle") composition = "active";
					}
					if (composition !== "idle" || event.inputType === "insertFromComposition") {
						editHint = compositionEdit(root, event); compositionChanged();
					}
				}, true);
				listen(document, "compositionstart", (event) => {
					if (!compositionTarget(event)) return;
					composition = "active"; editHint = null; compositionChanged();
				}, true);
				listen(document, "compositionupdate", (event) => {
					if (!compositionTarget(event)) return;
					if (composition === "idle") composition = "active";
					compositionChanged();
				}, true);
				listen(document, "compositionend", (event) => {
					if (!compositionTarget(event)) return;
					// Final input can arrive on either side of compositionend. Do not
					// resurrect an ended session from a late input.isComposing flag.
					composition = "ending"; editHint = null; compositionChanged();
				}, true);
				listen(document, "input", (event) => {
					if (!compositionTarget(event)) return;
					const composingInput = event.isComposing || event.inputType === "insertCompositionText";
					if (composingInput && composition === "idle") composition = "active";
					else if (!composingInput && composition === "active") composition = "ending";
					if (composition !== "idle") compositionChanged(); else change();
				}, true);
				listen(document, "scroll", () => { if (root) { hide(); invalidate(true); } }, { capture: true, passive: true });
				listen(document, "visibilitychange", () => { hide(); invalidate(true); });
				listen(window, "blur", () => { activate(null); cancelAnimationFrame(frame); frame = 0; });
				listen(window, "focus", () => invalidate(true));
				listen(window, "resize", resized, { passive: true });
				listen(reduced, "change", () => { hide(); invalidate(true); });
				listen(forced, "change", () => { hide(); invalidate(true); });
				if (window.visualViewport) {
					listen(window.visualViewport, "resize", resized, { passive: true });
					listen(window.visualViewport, "scroll", () => { hide(); invalidate(true); }, { passive: true });
				}
				if (document.fonts) listen(document.fonts, "loadingdone", resized);
				cleanups.push(store.subscribe(() => { hide(); invalidate(true); }));
				invalidate(true);
				return dispose;
			} catch (error) { dispose(); throw error; }
		}

		/** Use the shell's controls so focus, keyboard navigation and themes agree. */
		function Choice({ label, value, options, onSelect }) {
			const [open, setOpen] = React.useState(false);
			const h = React.createElement;
			const selectedLabel = options.find((option) => option.id === value)?.label ?? label;
			return h(Menu, {
				open, onClose: () => setOpen(false), items: options, selectedId: value,
				onSelect: (id) => { setOpen(false); onSelect(id); }, align: "end", portal: true,
				anchor: h(Button, {
					variant: "ghost", className: "dsh-vivid-motion-select",
					"aria-label": `${label}: ${selectedLabel}`, "aria-haspopup": "menu", "aria-expanded": open,
					onClick: () => setOpen((previous) => !previous),
					onKeyDown: (event) => {
						if (!open && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.isComposing && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
							event.preventDefault(); setOpen(true);
						}
					}
				}, selectedLabel, h(IconChevronDownOutlineRegular, { size: 16, "aria-hidden": true }))
			});
		}

		const parseHex = (value) => /^#?[\da-f]{6}$/i.test(value.trim()) ? "#" + value.trim().replace(/^#/, "").toLowerCase() : null;
		function hexToHsv(hex, previousHue = 0) {
			const [r, g, b] = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
			const v = Math.max(r, g, b), delta = v - Math.min(r, g, b);
			const sector = delta === 0 ? 0 : v === r ? (g - b) / delta : v === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
			return { h: delta ? (sector * 60 + 360) % 360 : previousHue, s: v ? delta / v : 0, v };
		}
		function hsvToHex({ h, s, v }) {
			return "#" + [5, 3, 1].map((n) => {
				const k = (n + h / 60) % 6;
				return Math.round(255 * v * (1 - s * Math.max(0, Math.min(k, 4 - k, 1)))).toString(16).padStart(2, "0");
			}).join("");
		}

		function ColorEditor({ initialColor, translate, onApply, onClose }) {
			const [draft, setDraft] = React.useState(() => ({ hsv: hexToHsv(initialColor), hex: initialColor.toUpperCase() }));
			const h = React.createElement, color = hsvToHex(draft.hsv), parsed = parseHex(draft.hex);
			const update = (patch) => setDraft((previous) => {
				const hsv = { ...previous.hsv, ...patch };
				return { hsv, hex: hsvToHex(hsv).toUpperCase() };
			});
			const pick = (event) => {
				const rect = event.currentTarget.getBoundingClientRect();
				if (rect.width && rect.height) update({
					s: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
					v: 1 - Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
				});
			};
			const slider = (key, label, max, track) => h("label", { className: "dsh-vivid-motion-slider" }, translate(label), h("input", {
				type: "range", min: 0, max, step: key === "h" ? 1 : 0.001, value: draft.hsv[key],
				"aria-label": translate(label), style: { "--caret-track": track, "--caret-thumb": color },
				onChange: (event) => update({ [key]: Number(event.target.value) })
			}));
			return h(Modal, {
				open: true, title: translate("customColor"), closeLabel: translate("close"), onClose,
				className: "dsh-vivid-motion-color-dialog",
				footer: h(React.Fragment, null,
					h(Button, { variant: "outline", onClick: onClose }, translate("cancel")),
					h(Button, { variant: "primary", disabled: !parsed, onClick: () => { if (parsed) onApply(parsed); } }, translate("apply")))
			}, h("div", { className: "dsh-vivid-motion-picker" },
				h("div", {
					className: "dsh-vivid-motion-spectrum", "aria-hidden": true,
					style: { "--caret-hue": hsvToHex({ h: draft.hsv.h, s: 1, v: 1 }) },
					onPointerDown: (event) => {
						if (event.button !== 0 || !event.isPrimary) return;
						event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); pick(event);
					},
					onPointerMove: (event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) pick(event); },
					onPointerUp: (event) => {
						if (event.currentTarget.hasPointerCapture(event.pointerId)) { pick(event); event.currentTarget.releasePointerCapture(event.pointerId); }
					}
				}, h("span", { className: "dsh-vivid-motion-spectrum-point", style: { left: draft.hsv.s * 100 + "%", top: (1 - draft.hsv.v) * 100 + "%", background: color } })),
				slider("h", "hue", 360, "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)"),
				slider("s", "saturation", 1, `linear-gradient(to right, ${hsvToHex({ ...draft.hsv, s: 0 })}, ${hsvToHex({ ...draft.hsv, s: 1 })})`),
				slider("v", "brightness", 1, `linear-gradient(to right, #000, ${hsvToHex({ ...draft.hsv, v: 1 })})`),
				h("div", { className: "dsh-vivid-motion-hex" },
					h("span", { className: "dsh-vivid-motion-swatch", "aria-hidden": true, style: { background: color } }),
					h(Input, {
						type: "text", value: draft.hex, "aria-label": translate("hex"), "aria-invalid": !parsed,
						"aria-describedby": !parsed ? NS + "-hex-error" : undefined, "data-modal-autofocus": true,
						spellCheck: false, autoComplete: "off", placeholder: "#FD3A4A", maxLength: 7,
						onChange: (event) => {
							const hex = event.target.value.toUpperCase(), next = parseHex(hex);
							setDraft((previous) => ({ hex, hsv: next ? hexToHsv(next, previous.hsv.h) : previous.hsv }));
						},
						onKeyDown: (event) => {
						if (event.key === "Enter" && !event.nativeEvent?.isComposing && !event.isComposing && event.keyCode !== 229 && parsed) {
								event.preventDefault(); onApply(parsed);
							}
						}
					})),
				!parsed && h("p", { id: NS + "-hex-error", className: "dsh-vivid-motion-color-error", role: "alert" }, translate("hexError"))
			));
		}

		function Settings({ store, t }) {
			const options = React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
			const [editingColor, setEditingColor] = React.useState(null);
			const translate = t || ((key) => TEXT[/^zh/i.test(document.documentElement.lang) ? "zh" : "en"][key]);
			const h = React.createElement;
			const row = (key, control, description) => h("div", { key, className: "dsh-vivid-motion-row" },
				h("div", { className: "dsh-vivid-motion-row-text" },
					h("div", { className: "dsh-vivid-motion-label" }, translate(key)),
					description && h("div", { className: "dsh-vivid-motion-description" }, description)),
				h("div", { className: "dsh-vivid-motion-control" }, control));
			const toggle = (key, description) => row(key, h(Switch, {
				checked: options[key], label: translate(key), onChange: (checked) => store.set({ [key]: checked })
			}), description);
			const preset = COLORS.some(([value]) => value === options.color);
			const editColor = () => setEditingColor(options.color === "theme" ? "#6090e0" : options.color);
			return h("section", { className: "dsh-vivid-motion-settings", "aria-label": "Vivid Motion" },
				h("h2", null, "Vivid Motion"),
				h("h3", null, translate("title")), h("p", { className: "dsh-vivid-motion-intro" }, translate("description")),
				toggle("enabled"), toggle("trail"), toggle("blink", translate("blinkDescription")),
				row("color", h(Choice, {
					label: translate("color"), value: preset ? options.color : "custom",
					options: [...COLORS.map(([id, label]) => ({ id, label: translate(label) })), { id: "custom", label: translate("custom") }],
					onSelect: (value) => { if (value === "custom") editColor(); else store.set({ color: value }); }
				})),
				!preset && row("customColor", h(Button, {
					variant: "ghost", className: "dsh-vivid-motion-color", "aria-label": translate("customColor"), onClick: editColor
				}, h("span", { className: "dsh-vivid-motion-swatch", "aria-hidden": true, style: { background: options.color } }), options.color.toUpperCase())),
				row("width", h(Choice, {
					label: translate("width"), value: String(options.width),
					options: ["thin", "medium", "thick"].map((label, index) => ({ id: String(index + 1), label: translate(label) })),
					onSelect: (value) => store.set({ width: Number(value) })
				})),
				editingColor !== null && h(ColorEditor, {
					initialColor: editingColor, translate, onClose: () => setEditingColor(null),
					onApply: (color) => { store.set({ color }); setEditingColor(null); }
				})
			);
		}

		function apply(ctx) {
			const store = createStore();
			ctx.effect(() => () => store.dispose(), NS + ": settings");
			const locale = typeof ctx.get === "function" ? ctx.get("locale") : null;
			if (locale) ctx.effect(() => locale.register(NS, TEXT), NS + ": dictionaries");
			ctx.effect(() => {
				const style = document.createElement("style"); style.textContent = CSS; document.head.append(style);
				let unmount;
				try { unmount = mountEngine(store); }
				catch (error) { style.remove(); throw error; }
				return () => { unmount(); style.remove(); };
			}, NS + ": caret overlay");
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section", id: "dsh-vivid-motion", label: "Vivid Motion", order: 35,
				...(locale ? { locale: NS } : {}), inject: () => ({ store })
			}, Settings));
		}

		return { apply, inject: ["slots"] };
	}
});
