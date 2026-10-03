window.__ModuleLoader__.load({
	id: "dsh-copy-toast",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		var React = require("react");

		/**
		 * Copy Toast — the "已复制" / "已剪切" confirmation.
		 *
		 * Any copy or cut the user performs raises one toast over a bottom-centre
		 * stack: it springs up from below with a jelly entrance, wobbles the stack
		 * it lands on, and can be flicked away with the pointer. Four toasts are
		 * kept; the oldest retires first.
		 *
		 * Two independent sources count as a copy, because the Harness reaches
		 * the clipboard two ways and only one of them is a DOM event:
		 *
		 *   - the document `copy` / `cut` events — Ctrl/Cmd+C and Ctrl/Cmd+X, the
		 *     context-menu entries, and the host's own `execCommand("copy")`
		 *     fallback;
		 *   - `navigator.clipboard.writeText` / `.write` — what every copy button
		 *     in the app actually calls, and it fires no `copy` event at all.
		 *
		 * Both events fire before the write, so an empty Ctrl/Cmd+C — which the
		 * document reports like any other copy — is told apart by asking whether
		 * anything is actually selected. A cut has no async analogue: only a user
		 * can cut.
		 *
		 * The stack renders into the `shell.overlay` slot, so the layer belongs to
		 * the app frame rather than to `document.body` and the plugin's unload
		 * takes the whole thing with it. React owns the layer element and the
		 * stylesheet; the imperative engine owns the toasts inside it, which is
		 * what lets the spring maths run on real elements.
		 */

		// ── tunables ───────────────────────────────────────────────────────────
		var TOAST = {
			duration: 2000, // ms a toast stays before retiring itself
			maxVisible: 4, // toasts kept in the stack; the oldest retires first
			stackOffset: 12, // px each toast behind the front one sits up by
			stackScale: 0.05, // scale each toast behind the front one shrinks by
			stackGap: 12, // px between toasts while the stack is expanded
			entrance: { stiffness: 520, damping: 26 }, // jelly entrance from below
			snapBack: { stiffness: 420, damping: 17 }, // after a cancelled drag
			wobble: { stiffness: 520, damping: 15 }, // stack reshuffle nudge
			slot: { stiffness: 560, damping: 30 }, // stack position spring
			icon: { stiffness: 520, damping: 14 } // icon chip pop-in
		};

		/** Namespace the confirmation text is registered under. */
		var NS = "dsh-copy-toast";
		/** The two keys this namespace carries. */
		var KEY_COPY = "copied";
		var KEY_CUT = "cut";

		var REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

		/** Inline check glyph; `dct-check-path` carries the draw-on animation. */
		var CHECK_SVG =
			'<svg class="dct-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
			'stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
			'<path class="dct-check-path" d="M5.5 12.6l4.2 4.2 8.8-9.4"/></svg>';

		/**
		 * Component stylesheet. Every class is prefixed because the sheet is
		 * global once mounted, and the palette goes through the host's theme
		 * tokens with the design's own values as fallbacks — an unknown token
		 * degrades the look without breaking the toast.
		 *
		 * The tokens are the raised-surface ones: `bg-layer-1` is the design's
		 * white panel in the light theme, and `deepseek-450` is the brand blue of
		 * the icon chip, which stays blue in both themes.
		 */
		var CSS = `
.dct-layer{position:absolute;bottom:26px;left:50%;width:0;height:0;transform:translateX(-50%);z-index:60;pointer-events:none}
.dct-slot{position:absolute;bottom:0;left:50%;width:max-content;transform-origin:50% 100%;pointer-events:none;transition:opacity .18s}
.dct-toast{
	position:relative;display:flex;align-items:center;gap:10px;
	padding:9px 18px 9px 9px;white-space:nowrap;
	background:var(--dsw-alias-bg-layer-1,#fff);
	border:1px solid var(--dsw-alias-border-l1,#e4e7f0);
	border-radius:16px;
	box-shadow:var(--dsw-shadow-lv3,0 10px 28px rgba(30,40,90,.14));
	color:var(--dsw-alias-label-primary,#15161a);
	font-family:inherit;font-size:13.5px;line-height:1.35;letter-spacing:-.01em;
	cursor:grab;user-select:none;-webkit-user-select:none;touch-action:pan-y;
	will-change:transform,opacity;
}
.dct-toast:active{cursor:grabbing}
.dct-icon{
	position:relative;flex:none;width:24px;height:24px;border-radius:999px;
	display:grid;place-items:center;
	background:var(--dsw-static-deepseek-450,#4d6bfe);color:#fff;
}
.dct-title{font-weight:550}
.dct-check{width:14px;height:14px}
.dct-check-path{
	stroke-dasharray:19;stroke-dashoffset:19;
	animation:dct-draw .26s .26s cubic-bezier(.65,0,.35,1) forwards;
}
@keyframes dct-draw{to{stroke-dashoffset:0}}
@media(prefers-reduced-motion:reduce){
	.dct-slot,.dct-toast,.dct-icon,.dct-check-path{animation-duration:.01ms !important;transition-duration:.01ms !important}
}
`;

		// ── spring solver ──────────────────────────────────────────────────────
		/**
		 * Numerically solved spring, sampled into keyframes. The simulation runs
		 * once per call at a fixed 1/120 s step and stops as soon as the value is
		 * settled, so the animation costs nothing while it plays.
		 */
		function spring(from, to, stiffness, damping) {
			var dt = 1 / 120;
			var frames = [];
			var x = from;
			var v = 0;
			var t = 0;
			var range = Math.abs(from - to) || 1;
			while (t < 2.5) {
				var a = -stiffness * (x - to) - damping * v;
				v += a * dt;
				x += v * dt;
				t += dt;
				frames.push({ t: t, x: x, v: v });
				if (Math.abs(x - to) < range * 0.002 && Math.abs(v) < range * 0.02) break;
			}
			var sp = { frames: frames, dur: Math.max(t, 0.05), from: from, to: to };
			sp.at = function (tt) {
				var i = Math.min(frames.length - 1, Math.max(0, Math.round((tt / sp.dur) * (frames.length - 1))));
				return frames[i].x;
			};
			return sp;
		}

		/**
		 * Every other simulated frame becomes a keyframe, with the true start state
		 * written at offset 0 — without it the browser would synthesize that first
		 * keyframe from the element's resting style and the entrance would jump —
		 * and an exact, velocity-free terminal frame at offset 1.
		 */
		function toKeyframes(sp, map) {
			var head = map({ t: 0, x: sp.from, v: 0 });
			head.offset = 0;
			var kf = [head];
			for (var i = 0; i < sp.frames.length; i += 2) {
				var f = sp.frames[i];
				var offset = f.t / sp.dur;
				if (offset <= 0 || offset >= 1) continue;
				var frame = map(f);
				frame.offset = offset;
				kf.push(frame);
			}
			var tail = map({ t: sp.dur, x: sp.to, v: 0 });
			tail.offset = 1;
			kf.push(tail);
			return kf;
		}

		function clamp(v, a, b) {
			return Math.min(b, Math.max(a, v));
		}

		function prefersReduce() {
			return typeof window.matchMedia === "function" && window.matchMedia(REDUCE_QUERY).matches;
		}

		// ── toast stack engine ─────────────────────────────────────────────────
		/**
		 * Mounts the imperative toast stack inside `container` and returns its
		 * handle. The engine owns every child of that element; React owns only
		 * the element itself, so the two never reconcile the same node.
		 *
		 * @param container - the layer element the stack appends its toasts to.
		 */
		function createToastStack(container) {
			/** list[0] is the front (newest) toast. */
			var list = [];
			/** Every toast this engine created, including ones on their way out:
			   a dismissing toast leaves `list` at once but keeps its node until
			   its exit animation ends, and dispose has to reach those too. */
			var owned = [];
			var expanded = false;
			var hovering = false;
			var disposed = false;
			var reduce = prefersReduce();
			var mq = typeof window.matchMedia === "function" ? window.matchMedia(REDUCE_QUERY) : null;

			function onReduceChange(event) {
				reduce = event.matches;
			}
			if (mq !== null) {
				if (typeof mq.addEventListener === "function") mq.addEventListener("change", onReduceChange);
				else if (typeof mq.addListener === "function") mq.addListener(onReduceChange);
			}

			/* Jelly entrance: springs up from below, stretches while it moves and
			   is blurred by its own velocity. */
			function jellyIn(t) {
				var sp = spring(52, 0, TOAST.entrance.stiffness, TOAST.entrance.damping);
				var kf = toKeyframes(sp, function (f) {
					var st = clamp(-f.v * 0.0011, -0.16, 0.2);
					var blur = clamp(Math.abs(f.x) * 0.06 + Math.abs(f.v) * 0.007, 0, 9);
					return {
						transform:
							"translate3d(0," +
							f.x.toFixed(2) +
							"px,0) scale(" +
							(1 - st * 0.55).toFixed(4) +
							"," +
							(1 + st).toFixed(4) +
							")",
						opacity: clamp(f.t / 0.1, 0, 1),
						filter: "blur(" + blur.toFixed(2) + "px)"
					};
				});
				return t.animate(kf, { duration: reduce ? 1 : sp.dur * 1000, easing: "linear" });
			}

			/* Spring all frozen drag properties back to the underlying resting style. */
			function jellyBackX(t, from) {
				var sp = spring(1, 0, TOAST.snapBack.stiffness, TOAST.snapBack.damping);
				var kf = toKeyframes(sp, function (f) {
					var st = clamp(-f.v * from.x * 0.0012, -0.15, 0.18);
					return {
						transform:
							"translate3d(" + (from.x * f.x).toFixed(2) + "px," +
							(from.y * f.x).toFixed(2) + "px,0) scale(" +
							(1 + (from.sx - 1) * f.x + st).toFixed(4) + "," +
							(1 + (from.sy - 1) * f.x - st * 0.55).toFixed(4) + ")",
						opacity: 1 + (from.opacity - 1) * clamp(f.x, 0, 1),
						filter: "blur(" + Math.max(0, from.blur * f.x).toFixed(2) + "px)"
					};
				});
				/* Default fill:none must expose REST, never the previous drag offset. */
				t.style.transform = "";
				t.style.opacity = "";
				t.style.filter = "";
				return t.animate(kf, { duration: reduce ? 1 : sp.dur * 1000, easing: "linear" });
			}

			/* Small jelly wobble when the stack reshuffles under a landed toast. */
			function wobble(t, amp) {
				var sp = spring(amp, 0, TOAST.wobble.stiffness, TOAST.wobble.damping);
				var kf = toKeyframes(sp, function (f) {
					return {
						transform:
							"scale(" + (1 + f.x * 0.55).toFixed(4) + "," + (1 - f.x).toFixed(4) + ")"
					};
				});
				return t.animate(kf, { duration: reduce ? 1 : sp.dur * 1000, easing: "linear" });
			}

			/* One toast transform owner at a time: drag, entrance, wobble or exit. */
			function cancelMotion(item) {
				if (item.motionAnim) item.motionAnim.cancel();
				item.motionAnim = null;
			}

			function playMotion(item, animation, onDone) {
				cancelMotion(item);
				item.motionAnim = animation;
				if (animation.finished && typeof animation.finished.then === "function") {
					animation.finished.then(function () {
						if (disposed || item.motionAnim !== animation) return;
						item.motionAnim = null;
						if (onDone) onDone();
					}, function () {});
				}
				return animation;
			}

			function motionSnapshot(item) {
				var cs = getComputedStyle(item.t);
				var matrix = null;
				try { matrix = new DOMMatrixReadOnly(cs.transform); } catch (error) {}
				var opacity = parseFloat(cs.opacity);
				var blur = /blur\(([-\d.]+)px\)/.exec(cs.filter || "");
				return {
					x: matrix ? matrix.e : 0,
					y: matrix ? matrix.f : 0,
					sx: matrix ? matrix.a : 1,
					sy: matrix ? matrix.d : 1,
					opacity: Number.isFinite(opacity) ? opacity : 1,
					blur: blur ? Number(blur[1]) : 0,
					transform: cs.transform === "none" ? "" : cs.transform,
					filter: cs.filter === "none" ? "" : cs.filter || ""
				};
			}

			function cancelAnimations(item) {
				cancelMotion(item);
				if (item.slotAnim) item.slotAnim.cancel();
				if (item.iconAnim) item.iconAnim.cancel();
				item.slotAnim = item.iconAnim = null;
			}

			/* Stack-position spring: the slot slides and scales to its new rank. */
			function springSlot(item, toY, toS) {
				var s = item.slot;
				var target = "translateX(-50%) translateY(" + toY + "px) scale(" + toS + ")";
				var m = null;
				try {
					m = new DOMMatrixReadOnly(getComputedStyle(s).transform);
				} catch (error) {
					m = null;
				}
				var fromY = m !== null ? m.f : toY;
				var fromS = m !== null && m.a ? m.a : toS;
				s.style.transform = target;
				if (item.slotAnim) item.slotAnim.cancel();
				if (Math.abs(toY - fromY) < 0.5 && Math.abs(toS - fromS) < 0.005) {
					item.slotAnim = null;
					return;
				}
				var spY = spring(fromY, toY, TOAST.slot.stiffness, TOAST.slot.damping);
				var spS = spring(fromS, toS, TOAST.slot.stiffness, TOAST.slot.damping);
				var dur = Math.max(spY.dur, spS.dur);
				var kf = [];
				var n = Math.max(2, Math.ceil(dur * 60));
				for (var i = 0; i <= n; i++) {
					var t = (dur * i) / n;
					kf.push({
						offset: i / n,
						transform:
							"translateX(-50%) translateY(" +
							(i === 0 ? fromY : i === n ? toY : spY.at(t)).toFixed(2) +
							"px) scale(" +
							(i === 0 ? fromS : i === n ? toS : spS.at(t)).toFixed(4) +
							")"
					});
				}
				item.slotAnim = s.animate(kf, { duration: reduce ? 1 : dur * 1000, easing: "linear" });
				if (
					!reduce &&
					Math.abs(toY - fromY) > 4 &&
					item.entered &&
					!item.dragging &&
					!item.closing
				) {
					/* A reshuffle must not interrupt an in-progress snap-back. */
					if (!item.motionAnim || item.motionAnim.playState !== "running") {
						playMotion(item, wobble(item.t, clamp(Math.abs(toY - fromY) / 160, 0.05, 0.13)));
					}
				}
			}

			function layout() {
				if (list.length === 0) expanded = hovering = false;
				var width = 0;
				var height = 0;
				for (var k = 0; k < list.length; k++) {
					width = Math.max(width, list[k].t.offsetWidth || 0);
					height += list[k].t.offsetHeight + (k > 0 ? TOAST.stackGap : 0);
				}
				/* A real hit rectangle bridges the expanded 12px gaps; no invisible
				   catch-all covers the composer while the stack is collapsed. */
				container.style.width = expanded ? width + "px" : "0px";
				container.style.height = expanded ? height + "px" : "0px";
				container.style.pointerEvents = expanded ? "auto" : "none";
				for (var i = 0; i < list.length; i++) {
					var item = list[i];
					item.slot.style.zIndex = String(300 - i);
					var y = 0;
					var sc = 1;
					var op = 1;
					if (expanded) {
						for (var j = 0; j < i; j++) y -= list[j].t.offsetHeight + TOAST.stackGap;
					} else {
						y = -i * TOAST.stackOffset;
						sc = Math.max(1 - i * TOAST.stackScale, 0.82);
						op = i < 3 ? 1 : 0;
					}
					item.slot.style.opacity = String(op);
					item.slot.style.pointerEvents = op > 0 ? "auto" : "none";
					item.slot.setAttribute("aria-hidden", op === 0 ? "true" : "false");
					item.t.style.pointerEvents = op > 0 && (expanded || i === 0) ? "auto" : "none";
					springSlot(item, y, sc);
				}
			}

			function setExpanded(v) {
				if (disposed || expanded === v) return;
				expanded = v;
				layout();
			}

			function anyDragging() {
				return list.some(function (item) { return item.dragging; });
			}

			function onStackEnter() {
				hovering = true;
				setExpanded(true);
			}

			function onStackLeave(event) {
				if (container.contains(event.relatedTarget)) return;
				hovering = false;
				if (!anyDragging()) setExpanded(false);
			}
			container.addEventListener("mouseenter", onStackEnter);
			container.addEventListener("mouseleave", onStackLeave);

			/* Icon chip: spring pop-in with overshoot. */
			function iconPop(elm) {
				var sp = spring(0, 1, TOAST.icon.stiffness, TOAST.icon.damping);
				var kf = toKeyframes(sp, function (f) {
					return {
						transform: "scale(" + Math.max(f.x, 0).toFixed(4) + ")",
						opacity: clamp(f.x * 2.5, 0, 1)
					};
				});
				return elm.animate(kf, {
					duration: reduce ? 1 : sp.dur * 1000,
					easing: "linear",
					delay: reduce ? 0 : 90,
					fill: "backwards"
				});
			}

			function armTimer(item) {
				if (disposed || item.closing || item.hovered || item.dragging || item.timer !== null) return;
				if (item.remaining <= 0) { dismiss(item); return; }
				item.t0 = performance.now();
				item.timer = setTimeout(function () {
					item.timer = null;
					item.remaining = 0;
					dismiss(item);
				}, item.remaining);
			}

			/* Hover and drag are independent holds; the last hold resumes the timer. */
			function pauseTimer(item) {
				if (item.timer === null) return;
				clearTimeout(item.timer);
				item.timer = null;
				item.remaining = Math.max(0, item.remaining - (performance.now() - item.t0));
			}

			function bindDrag(item) {
				var t = item.t;
				var sx = 0;
				var dx = 0;
				var pid = null;
				var from = null;
				var fallback = false;

				function bindFallback() {
					if (fallback || typeof document.addEventListener !== "function") return;
					fallback = true;
					document.addEventListener("pointermove", move, true);
					document.addEventListener("pointerup", up, true);
					document.addEventListener("pointercancel", cancel, true);
				}

				function move(event) {
					if (disposed || item.closing || pid === null || event.pointerId !== pid) return;
					dx = event.clientX - sx;
					var d = clamp(from.x + dx, -160, 160);
					var st = Math.min(Math.abs(dx) / 160, 1) * 0.06;
					t.style.transform = "translate3d(" + d + "px," + from.y + "px,0) scale(" +
						(from.sx + st) + "," + (from.sy - st * 0.5) + ")";
					t.style.opacity = String(from.opacity * (1 - Math.min(Math.abs(dx) / 180, 0.8)));
				}

				function updateHover(event) {
					if (event.pointerType === "touch") { item.hovered = false; return; }
					if (typeof document.elementFromPoint !== "function" ||
						!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
					var hit = document.elementFromPoint(event.clientX, event.clientY);
					item.hovered = t.contains(hit);
					hovering = container.contains(hit);
				}

				function finish(event, cancelled) {
					if (pid === null || event.pointerId !== pid) return;
					/* Account for a final movement even if pointermove was coalesced. */
					if (!cancelled && Number.isFinite(event.clientX)) move(event);
					var pointer = pid;
					pid = null;
					item.dragging = false;
					if (fallback) {
						document.removeEventListener("pointermove", move, true);
						document.removeEventListener("pointerup", up, true);
						document.removeEventListener("pointercancel", cancel, true);
						fallback = false;
					}
					try {
						if (typeof t.releasePointerCapture === "function") t.releasePointerCapture(pointer);
					} catch (error) {}
					if (disposed || item.closing) return;
					updateHover(event);
					if (!cancelled && Math.abs(dx) > 64) {
						fling(item, Math.sign(dx));
					} else {
						var current = motionSnapshot(item);
						playMotion(item, jellyBackX(t, current));
						armTimer(item);
					}
					if (!hovering && !anyDragging()) setExpanded(false);
				}

				function up(event) { finish(event, false); }
				function cancel(event) { finish(event, true); }
				item.cancelDrag = function () {
					if (pid !== null) finish({ pointerId: pid }, true);
				};

				t.addEventListener("pointerdown", function (event) {
					if (disposed || item.closing || pid !== null || event.isPrimary === false ||
						(typeof event.button === "number" && event.button !== 0)) return;
					pid = event.pointerId;
					sx = event.clientX;
					dx = 0;
					from = motionSnapshot(item);
					/* Freeze EVERY previous transform animation before handing off to drag. */
					cancelMotion(item);
					t.style.transform = from.transform;
					t.style.opacity = String(from.opacity);
					t.style.filter = from.filter;
					item.entered = true;
					clearTimeout(item.enterBackstop);
					item.dragging = true;
					pauseTimer(item);
					try {
						t.setPointerCapture(pid);
						/* Some hosts silently ignore capture without throwing. */
						if (typeof t.hasPointerCapture === "function" && !t.hasPointerCapture(pid)) bindFallback();
					} catch (error) {
						/* If capture is unavailable, release outside the toast still finishes. */
						bindFallback();
					}
				});
				t.addEventListener("pointermove", move);
				t.addEventListener("pointerup", up);
				t.addEventListener("pointercancel", cancel);
				/* Losing capture cancels; it never turns an interrupted gesture into a fling. */
				t.addEventListener("lostpointercapture", cancel);
			}

			function fling(item, dir) {
				if (disposed || item.closing) return;
				item.closing = true;
				if (item.cancelDrag) item.cancelDrag();
				clearTimeout(item.timer);
				item.timer = null;
				item.slot.style.pointerEvents = item.t.style.pointerEvents = "none";
				var cs = motionSnapshot(item);
				playMotion(item, item.t.animate(
					[
						{ transform: cs.transform || "none", opacity: cs.opacity },
						{ transform: "translateX(" + dir * 130 + "%) scale(.92)", opacity: 0 }
					],
					{
						duration: reduce ? 1 : 220,
						easing: "cubic-bezier(.5,0,.9,.4)",
						fill: "forwards"
					}
				));
				remove(item, 230);
			}

			function dismiss(item) {
				if (disposed || item.closing) return;
				item.closing = true;
				if (item.cancelDrag) item.cancelDrag();
				clearTimeout(item.timer);
				item.timer = null;
				item.slot.style.pointerEvents = item.t.style.pointerEvents = "none";
				var current = motionSnapshot(item);
				playMotion(item, item.t.animate(
					[
						{ transform: current.transform || "none", opacity: current.opacity,
							filter: "blur(" + current.blur + "px)" },
						{
							transform: "translate3d(0,3px,0) scale(1.07,.88)",
							opacity: 1,
							filter: "blur(0px)",
							offset: 0.35
						},
						{ transform: "translate3d(0,16px,0) scale(.92,.94)", opacity: 0, filter: "blur(5px)" }
					],
					{ duration: reduce ? 1 : 210, easing: "cubic-bezier(.42,0,1,1)", fill: "forwards" }
				));
				remove(item, 220);
			}

			/** Detaches one toast's node for good. */
			function detach(item) {
				if (item.cancelDrag) item.cancelDrag();
				clearTimeout(item.timer);
				clearTimeout(item.exitTimer);
				clearTimeout(item.enterBackstop);
				cancelAnimations(item);
				var i = owned.indexOf(item);
				if (i > -1) owned.splice(i, 1);
				if (item.slot.parentNode !== null) item.slot.parentNode.removeChild(item.slot);
			}

			function remove(item, after) {
				var i = list.indexOf(item);
				if (i > -1) list.splice(i, 1);
				clearTimeout(item.enterBackstop);
				layout();
				/* The node outlives the rank it held: it leaves after its exit
				   animation, so the stack has already closed the gap. */
				item.exitTimer = setTimeout(
					function () {
						detach(item);
					},
					reduce ? 10 : after
				);
			}

			/** Raise one toast. Returns its handle, or null when disposed. */
			function show(title) {
				if (disposed) return null;

				var slot = document.createElement("div");
				slot.className = "dct-slot";

				var t = document.createElement("div");
				t.className = "dct-toast";
				t.setAttribute("role", "status");

				var icon = document.createElement("span");
				icon.className = "dct-icon";
				icon.setAttribute("aria-hidden", "true");
				/* A package-owned constant, never the toast text. */
				icon.innerHTML = CHECK_SVG;

				var titleEl = document.createElement("span");
				titleEl.className = "dct-title";
				titleEl.textContent = title;

				t.appendChild(icon);
				t.appendChild(titleEl);
				slot.appendChild(t);
				container.appendChild(slot);
				var iconAnim = iconPop(icon);

				var item = {
					slot: slot,
					t: t,
					remaining: TOAST.duration,
					timer: null,
					exitTimer: null,
					t0: 0,
					closing: false,
					dragging: false,
					hovered: false,
					entered: false,
					slotAnim: null,
					enterAnim: null,
					motionAnim: null,
					iconAnim: iconAnim,
					cancelDrag: null
				};
				owned.push(item);
				list.unshift(item);
				layout();
				while (list.length > TOAST.maxVisible) {
					var oldest = list[list.length - 1];
					if (oldest.closing) break;
					dismiss(oldest);
				}

				var settle = function () {
					if (disposed || item.closing) return;
					item.entered = true;
					clearTimeout(item.enterBackstop);
				};
				item.enterAnim = playMotion(item, jellyIn(t), settle);
				item.enterBackstop = setTimeout(settle, reduce ? 10 : 900);

				slot.addEventListener("mouseenter", function () {
					if (!item.closing) onStackEnter();
				});
				t.addEventListener("mouseenter", function () {
					if (disposed || item.closing) return;
					item.hovered = true;
					pauseTimer(item);
				});
				t.addEventListener("mouseleave", function () {
					item.hovered = false;
					armTimer(item);
				});
				bindDrag(item);
				armTimer(item);
				return item;
			}

			/** Drops every toast, timer and animation this stack owns, including
			   the ones already animating out. */
			function dispose() {
				if (disposed) return;
				disposed = true;
				if (mq !== null) {
					if (typeof mq.removeEventListener === "function") mq.removeEventListener("change", onReduceChange);
					else if (typeof mq.removeListener === "function") mq.removeListener(onReduceChange);
				}
				container.removeEventListener("mouseenter", onStackEnter);
				container.removeEventListener("mouseleave", onStackLeave);
				while (owned.length) {
					var item = owned[owned.length - 1];
					item.closing = true;
					detach(item);
				}
				list = [];
				expanded = hovering = false;
				container.style.width = container.style.height = "0px";
				container.style.pointerEvents = "none";
			}

			return { show: show, dispose: dispose };
		}

		// ── copy detection ─────────────────────────────────────────────────────
		var stringValueOf = String.prototype.valueOf;
		var stringToString = String.prototype.toString;
		var arrayIterator = Array.prototype[Symbol.iterator];
		var functionToString = Function.prototype.toString;
		var promiseThen = Promise.prototype.then;
		var clipboardItemTypes = platformMember("ClipboardItem", "types", "get");
		var clipboardItemGetType = platformMember("ClipboardItem", "getType", "value");
		var blobSize = platformMember("Blob", "size", "get");

		/** Capture platform accessors so instance overrides are never run by observation. */
		function platformMember(name, key, member) {
			try {
				var constructor = window[name];
				var descriptor = constructor && Object.getOwnPropertyDescriptor(constructor.prototype, key);
				return descriptor && typeof descriptor[member] === "function" ? descriptor[member] : null;
			} catch (error) { return null; }
		}

		/** A focused text control owns its selection, even when it is empty. */
		function isTextControl(node) {
			return !!node && node.nodeType === 1 && (node.tagName === "INPUT" || node.tagName === "TEXTAREA");
		}

		function hasSelectionIn(node) {
			try {
				return typeof node.selectionStart === "number" && typeof node.selectionEnd === "number" &&
					node.selectionEnd > node.selectionStart;
			} catch (error) {
				/* Input types with no selection API (number, date, …). */
				return false;
			}
		}

		function selectionForClipboard(event) {
			try {
				var control = isTextControl(event.target) ? event.target :
					(isTextControl(document.activeElement) ? document.activeElement : null);
				if (control !== null) {
					var selected = hasSelectionIn(control);
					return { selected: selected, canCut: selected && !control.readOnly && !control.disabled };
				}
				var sel = typeof window.getSelection === "function" ? window.getSelection() : null;
				if (!sel || !sel.rangeCount || !String(sel).length) return { selected: false, canCut: false };
				function editable(node) {
					var element = node && (node.nodeType === 1 ? node : node.parentElement || node.parentNode);
					return !!element && element.isContentEditable === true;
				}
				return { selected: true, canCut: editable(sel.anchorNode) && editable(sel.focusNode) };
			} catch (error) {
				return { selected: false, canCut: false };
			}
		}

		/**
		 * Structural breaks have no textContent. Keep their text offsets and the
		 * selected slice, so deleting a <br> or joining paragraphs can be verified
		 * even when all text survives. Equivalent DOM rebuilds do not count.
		 */
		function cutBreakSnapshot(root, range) {
			var breaks = [];
			var position = 0;
			var start = -1;
			var end = -1;
			function boundary(node, offset) {
				if (!range) return;
				if (node === range.startContainer && offset === range.startOffset) start = breaks.length;
				if (node === range.endContainer && offset === range.endOffset) end = breaks.length;
			}
			function visit(node) {
				if (node.nodeType === 3) {
					if (range && node === range.startContainer) start = breaks.length;
					if (range && node === range.endContainer) end = breaks.length;
					position += node.data.length;
					return;
				}
				if (node.nodeType !== 1) return;
				var block = node !== root && /^(DIV|P|LI|UL|OL|BLOCKQUOTE|PRE|H[1-6]|TABLE|TR|TD|TH)$/.test(node.tagName);
				if (block || node.tagName === "BR") breaks.push(position);
				var index = 0;
				for (var child = node.firstChild; child; child = child.nextSibling) {
					boundary(node, index++);
					visit(child);
				}
				boundary(node, index);
				if (block) breaks.push(position);
			}
			visit(root);
			return { breaks: breaks, start: start, end: end };
		}

		/**
		 * Both native and editor-managed cuts (including Lexical) must delete.
		 * Capture the exact expected deletion BEFORE dispatch finishes; clipboard
		 * data alone proves a copy, while a collapsed selection proves nothing.
		 */
		function captureCutRemoval(event, selection) {
			if (!selection.canCut) return null;
			try {
				var control = isTextControl(event.target) ? event.target :
					(isTextControl(document.activeElement) ? document.activeElement : null);
				if (control !== null) {
					var value = control.value;
					var start = control.selectionStart;
					var end = control.selectionEnd;
					if (typeof value !== "string" || !Number.isInteger(start) || !Number.isInteger(end) ||
						start < 0 || end <= start || end > value.length) return null;
					var expected = value.slice(0, start) + value.slice(end);
					return function () {
						try { return control.isConnected !== false && control.value === expected; }
						catch (error) { return false; }
					};
				}

				var sel = typeof window.getSelection === "function" ? window.getSelection() : null;
				if (!sel || sel.rangeCount !== 1 || typeof sel.getRangeAt !== "function") return null;
				var range = sel.getRangeAt(0);
				var root = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
				if (!root || !root.isContentEditable) return null;
				while (root.parentElement && root.parentElement.isContentEditable) root = root.parentElement;
				if (!root.contains(range.endContainer)) return null;
				var before = root.textContent;
				if (typeof before !== "string") return null;
				/* DOM Range offsets map to textContent, including multi-node selections,
				   without changing the live selection or the editor's DOM. */
				var prefix = range.cloneRange();
				prefix.selectNodeContents(root);
				prefix.setEnd(range.startContainer, range.startOffset);
				var from = String(prefix).length;
				prefix.setEnd(range.endContainer, range.endOffset);
				var to = String(prefix).length;
				if (to < from || to > before.length) return null;
				if (to === from) {
					var structure = cutBreakSnapshot(root, range);
					if (structure.start < 0 || structure.end <= structure.start) return null;
					var expectedBreaks = structure.breaks.slice(0, structure.start).concat(structure.breaks.slice(structure.end));
					return function () {
						try {
							if (root.isConnected === false || root.textContent !== before) return false;
							var afterBreaks = cutBreakSnapshot(root).breaks;
							return afterBreaks.length === expectedBreaks.length && afterBreaks.every(function (offset, index) {
								return offset === expectedBreaks[index];
							});
						} catch (error) { return false; }
					};
				}
				var remaining = before.slice(0, from) + before.slice(to);
				return function () {
					try { return root.isConnected !== false && root.textContent === remaining; }
					catch (error) { return false; }
				};
			} catch (error) {
				/* An inaccessible/custom selection is not evidence that anything was cut. */
				return null;
			}
		}

		/** Never invoke an application getter, toString, or iterator to inspect an API argument. */
		function dataProperty(object, key) {
			try {
				for (var owner = object; owner !== null; owner = Object.getPrototypeOf(owner)) {
					var descriptor = Object.getOwnPropertyDescriptor(owner, key);
					if (descriptor) return { owner: owner, descriptor: descriptor };
				}
			} catch (error) {
				/* Distinguish unknown from an absent property; neither is positive evidence. */
				return false;
			}
			return null;
		}

		/** Text is known synchronously; write() needs a stable snapshot of its items. */
		function captureApiPayload(isText, args) {
			if (!args.length) return false;
			var value = args[0];
			if (isText) {
				if (typeof value === "string") return value.length > 0;
				if (value === null || (typeof value !== "object" && typeof value !== "function")) {
					/* DOMString conversions of these primitives are nonempty; Symbol rejects. */
					return typeof value !== "symbol";
				}
				try {
					/* The intrinsic brand check cannot call an overridden user toString. */
					var text = Reflect.apply(stringValueOf, value, []);
					if (!text.length) return false;
					var primitive = dataProperty(value, Symbol.toPrimitive);
					var conversion = dataProperty(value, "toString");
					return (primitive === null || (primitive && "value" in primitive.descriptor && primitive.descriptor.value == null)) &&
						!!conversion && conversion.descriptor.value === stringToString;
				} catch (error) {
					return false;
				}
			}
			try {
				if (!Array.isArray(value)) return false;
				var length = Object.getOwnPropertyDescriptor(value, "length");
				if (!length || !(length.value > 0)) return false;
				var iterator = dataProperty(value, Symbol.iterator);
				if (!iterator || typeof iterator.descriptor.value !== "function") return false;
				/* Also accept the intrinsic Array iterator from another realm. */
				var standardIterator = iterator.descriptor.value === arrayIterator ||
					Reflect.apply(functionToString, iterator.descriptor.value, []) ===
					Reflect.apply(functionToString, arrayIterator, []);
				if (!standardIterator) return false;
				var items = [];
				for (var i = 0; i < length.value; i++) {
					var entry = dataProperty(value, String(i));
					/* An element getter must be evaluated only by the actual write. */
					if (!entry || !("value" in entry.descriptor)) return false;
					items.push(entry.descriptor.value);
				}
				return items;
			} catch (error) {
				return false;
			}
		}

		/** Inspect native item representations only AFTER the underlying write succeeds. */
		function confirmItemPayload(items, onPayload) {
			if (!clipboardItemTypes || !clipboardItemGetType || !blobSize) return;
			function inspect(blob) {
				try {
					if (Reflect.apply(blobSize, blob, []) > 0) onPayload();
				} catch (error) {
					/* Unknown payloads and observer failures cannot change the write result. */
				}
			}
			for (var i = 0; i < items.length; i++) {
				var types;
				try { types = Reflect.apply(clipboardItemTypes, items[i], []); }
				catch (error) { continue; }
				for (var t = 0; t < types.length; t++) {
					try {
						var result = Reflect.apply(clipboardItemGetType, items[i], [types[t]]);
						Reflect.apply(promiseThen, result, [inspect, function () {}]);
					} catch (error) {
						/* One unavailable format does not hide a nonempty representation. */
					}
				}
			}
		}

		/** Temporarily replace exactly one method, keeping its original own descriptor. */
		function patchClipboardMethod(target, key, replacement) {
			try {
				var original = Object.getOwnPropertyDescriptor(target, key);
				var descriptor = {
					value: replacement,
					configurable: original ? original.configurable : true,
					enumerable: original ? original.enumerable : false,
					writable: original && "writable" in original ? original.writable : true
				};
				Object.defineProperty(target, key, descriptor);
				function intact() {
					try {
						var current = Object.getOwnPropertyDescriptor(target, key);
						return !!current && current.value === replacement;
					} catch (error) {
						return false;
					}
				}
				return {
					intact: intact,
					dispose: function () {
						if (!intact()) return;
						try {
							if (original) Object.defineProperty(target, key, original);
							else delete target[key];
						} catch (error) {
							/* A later non-writable descriptor must not strand other cleanups. */
						}
					}
				};
			} catch (error) {
				return null;
			}
		}

		/** Snapshot while the event's native DataTransfer store is still readable. */
		function clipboardEventHasPayload(data) {
			try {
				var types = data.types;
				var read = data.getData;
				if (types && typeof read === "function") {
					for (var i = 0; i < types.length; i++) {
						try {
							var text = Reflect.apply(read, data, [types[i]]);
							if (typeof text === "string" && text.length > 0) return true;
						} catch (error) {
							/* One unavailable format does not hide a readable nonempty format. */
						}
					}
				}
				var files = data.files;
				if (files) {
					for (var f = 0; f < files.length; f++) if (files[f] && files[f].size > 0) return true;
				}
			} catch (error) {
				/* Protected/read-only stores are not evidence of a custom copy. */
			}
			return false;
		}

		/** Observe clipboard writes without changing arguments, receivers, results or failures. */
		function installCopyWatcher(onCopy, onCut) {
			var active = true;
			var disposers = [];
			var pending = [];
			var dataObservers = new WeakMap();
			var currentOperation = null;

			function confirm(operation, callback) {
				if (!active || operation.reported) return;
				operation.reported = true;
				var parent = currentOperation;
				currentOperation = null;
				try { callback(); } catch (error) {
					/* Feedback is optional: it must never turn a successful write into a rejection. */
				} finally { currentOperation = parent; }
			}

			function observeEventData(data) {
				if (!data || (typeof data !== "object" && typeof data !== "function")) return null;
				var record = dataObservers.get(data);
				if (!record) {
					record = { sessions: [], patches: [], reliable: true };
					dataObservers.set(data, record);
					function snapshot() {
						if (!active || !record.sessions.length) return;
						var payload = clipboardEventHasPayload(data);
						for (var s = 0; s < record.sessions.length; s++) record.sessions[s].payload = payload;
					}
					function wrap(target, key) {
						var method;
						try { method = target[key]; } catch (error) { record.reliable = false; return; }
						if (typeof method !== "function") return;
						var patch = patchClipboardMethod(target, key, function () {
							"use strict";
							try { return Reflect.apply(method, this, arguments); }
							finally { snapshot(); }
						});
						if (patch) record.patches.push(patch);
						else record.reliable = false;
					}
					wrap(data, "setData");
					wrap(data, "clearData");
					try {
						var items = data.items;
						if (items) {
							wrap(items, "add");
							wrap(items, "remove");
							wrap(items, "clear");
						}
					} catch (error) { record.reliable = false; }
				}
				var session = { payload: clipboardEventHasPayload(data) };
				record.sessions.push(session);
				var released = false;
				return {
					hasPayload: function () {
						if (!record.reliable || !session.payload) return false;
						for (var p = 0; p < record.patches.length; p++) if (!record.patches[p].intact()) return false;
						return true;
					},
					dispose: function () {
						if (released) return;
						released = true;
						var index = record.sessions.indexOf(session);
						if (index !== -1) record.sessions.splice(index, 1);
						if (record.sessions.length) return;
						for (var p = record.patches.length - 1; p >= 0; p--) record.patches[p].dispose();
						dataObservers.delete(data);
					}
				};
			}

			function bindClipboardEvent(type, onFire) {
				function handler(event) {
					if (!active || event.isTrusted !== true) return;
					var selection = selectionForClipboard(event);
					var removedSelection = type === "cut" ? captureCutRemoval(event, selection) : null;
					var data = null;
					try { data = observeEventData(event.clipboardData); } catch (error) {}
					var operation = currentOperation || { reported: false };
					var entry = { timer: null, data: data };
					pending.push(entry);
					try {
						entry.timer = window.setTimeout(function () {
							var index = pending.indexOf(entry);
							if (index !== -1) pending.splice(index, 1);
							var customPayload = data !== null && data.hasPayload();
							if (data !== null) data.dispose();
							if (!active) return;
							if (type === "cut") {
								/* beforeinput can block deletion without cancelling the cut event.
								   Editor-managed cuts must additionally prove a clipboard payload. */
								if (selection.canCut && removedSelection !== null && removedSelection() &&
									(!event.defaultPrevented || customPayload)) {
									confirm(operation, onFire);
								}
							} else if (event.defaultPrevented ? customPayload : selection.selected) {
								confirm(operation, onFire);
							}
						}, 0);
					} catch (error) {
						pending.splice(pending.indexOf(entry), 1);
						if (data !== null) data.dispose();
					}
				}
				document.addEventListener(type, handler, { capture: true });
				return function () { document.removeEventListener(type, handler, { capture: true }); };
			}
			disposers.push(bindClipboardEvent("copy", onCopy));
			disposers.push(bindClipboardEvent("cut", onCut));

			var clipboard = null;
			try { clipboard = navigator.clipboard; } catch (error) {}
			if (clipboard) {
				["writeText", "write"].forEach(function (name) {
					/* Select the actual owner per method, including instance-owned overrides. */
					var property = dataProperty(clipboard, name);
					if (!property || typeof property.descriptor.value !== "function") return;
					var method = property.descriptor.value;
					var patched = function () {
						"use strict";
						if (!active) return Reflect.apply(method, this, arguments);
						var payload = captureApiPayload(name === "writeText", arguments);
						var parent = currentOperation;
						var operation = parent || { reported: false };
						var result;
						currentOperation = operation;
						try { result = Reflect.apply(method, this, arguments); }
						finally { currentOperation = parent; }
						if (!active || !payload) return result;
						function onSuccess() {
							if (!active || operation.reported) return;
							if (payload === true) confirm(operation, onCopy);
							else confirmItemPayload(payload, function () { confirm(operation, onCopy); });
						}
						try {
							var then = result !== null && (typeof result === "object" || typeof result === "function") ? result.then : null;
							if (typeof then === "function") {
								Reflect.apply(then, result, [onSuccess, function () {}]);
							} else onSuccess();
						} catch (error) {
							/* Even a nonstandard thenable's observer failure must not alter the API result. */
						}
						return result;
					};
					var patch = patchClipboardMethod(property.owner, name, patched);
					if (patch) disposers.push(patch.dispose);
				});
			}

			/* Shared operations only correlate nested/synchronous API calls and their
			   execCommand events. An asynchronous third-party fallback after the call
			   stack unwinds has no reliable identity; do not debounce distinct copies.
			   Unknown custom coercions/iterables are deliberately not confirmed: observing
			   them would repeat user code or change arguments/exception timing. Likewise,
			   unpatchable DataTransfer mutations (or saved native methods bypassing these
			   temporary wrappers) cannot reliably prove a cancelled custom copy. */
			return function () {
				if (!active) return;
				active = false;
				for (var t = 0; t < pending.length; t++) {
					window.clearTimeout(pending[t].timer);
					if (pending[t].data !== null) pending[t].data.dispose();
				}
				pending = [];
				for (var d = disposers.length - 1; d >= 0; d--) {
					try { disposers[d](); } catch (error) {
						/* Keep unwinding: one failed restore must not strand the rest. */
					}
				}
				disposers = [];
			};
		}

		// ── plugin wiring ──────────────────────────────────────────────────────
		/** The live stack, or null while the overlay slot has no entry mounted. */
		var stack = null;
		/** Bound translate function; null until the dictionaries are registered. */
		var translate = null;

		/**
		 * One confirmation label, from the locale service when it is available and
		 * from the built-in pair otherwise.
		 */
		function label(key) {
			if (translate !== null) {
				try {
					var text = translate(key);
					/* A lookup that fell through to the key itself is a miss. */
					if (typeof text === "string" && text.length > 0 && text !== key) return text;
				} catch (error) {
					/* Fall through to the built-in pair. */
				}
			}
			/* The app stamps the active locale onto <html lang>. */
			var lang = (document.documentElement.getAttribute("lang") || navigator.language || "en").toLowerCase();
			var zh = lang.indexOf("zh") === 0;
			if (key === KEY_CUT) return zh ? "已剪切" : "Cut";
			return zh ? "已复制" : "Copied";
		}

		function announce(key) {
			if (stack === null) return;
			stack.show(label(key));
		}

		/**
		 * The layer element plus its stylesheet. Rendered once: it holds no state
		 * and no children, because the engine owns everything inside it.
		 */
		function CopyToastLayer() {
			var hostRef = React.useRef(null);
			React.useEffect(function () {
				var engine = createToastStack(hostRef.current);
				stack = engine;
				return function () {
					if (stack === engine) stack = null;
					engine.dispose();
				};
			}, []);
			return React.createElement(
				React.Fragment,
				null,
				React.createElement("style", { dangerouslySetInnerHTML: { __html: CSS } }),
				React.createElement("div", { className: "dct-layer", ref: hostRef })
			);
		}

		/** Registers the confirmation pair under this package's namespace. */
		function registerDictionaries(locale) {
			var disposers = [];
			try {
				disposers.push(locale.register(NS, "zh", { copied: "已复制", cut: "已剪切" }));
				disposers.push(locale.register(NS, "en", { copied: "Copied", cut: "Cut" }));
				translate = locale.bind(NS);
			} catch (error) {
				console.error("dsh-copy-toast: locale registration failed, using the built-in text", error);
			}
			return function () {
				translate = null;
				while (disposers.length) {
					try {
						disposers.pop()();
					} catch (error) {
						/* Disposers are idempotent; keep unwinding regardless. */
					}
				}
			};
		}

		function apply(ctx) {
			/* The watcher is its own effect: it stays installed even while the
			   overlay slot has no entry mounted, so a later expansion is live. */
			ctx.effect(function () {
				return installCopyWatcher(
					function () {
						announce(KEY_COPY);
					},
					function () {
						announce(KEY_CUT);
					}
				);
			}, "dsh-copy-toast: clipboard watcher");

			/* `locale` is optional: without it the built-in pair still applies. */
			var locale = typeof ctx.get === "function" ? ctx.get("locale") : undefined;
			if (locale !== undefined && locale !== null) {
				ctx.effect(function () {
					return registerDictionaries(locale);
				}, "dsh-copy-toast: dictionaries");
			}

			/* The frame-wide floating layer: additive seat, click-through, and it
			   sits above every column and outside their scroll containers. */
			ctx.slots.inject("shell.overlay", function () {
				return ctx.slots.register(
					{ name: "shell.overlay", id: "dsh-copy-toast", order: 100 },
					CopyToastLayer
				);
			});
		}

		exports.apply = apply;
		exports.inject = ["slots"];
		exports.CopyToastLayer = CopyToastLayer;
		exports.TOAST = TOAST;
		return module.exports;
	}
});
