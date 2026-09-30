window.__ModuleLoader__.load({
	id: "dsh-vivid-motion",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		/**
		 * Vivid Motion — the "干脆" (crisp) click spark.
		 *
		 * A pointer press fires `sparkCount` line segments evenly spread around
		 * the pointer and pushes them outward. The only thing that moves is the
		 * distance curve: an analytically solved spring at critical damping, so
		 * the sparks reach their radius fast and stop dead — no bounce, no
		 * rotation, no trailing fade. The render loop runs only while at least
		 * one burst is alive, so an idle page costs nothing.
		 *
		 * Palette follows the app theme: the stroke uses `--dsw-alias-label-primary`
		 * unless `sparkColor` pins one.
		 */

		// ── the 干脆 preset, verbatim from the ClickSpark tuning bench ──────────
		var PRESET = {
			stiffness: 620,
			damping: 50,
			mass: 1,
			duration: 300, // ms
			sparkCount: 8,
			sparkRadius: 15, // px
			sparkSize: 10, // px
			extraScale: 1,
			sparkColor: null // null → follow the theme
		};

		// ── spring ─────────────────────────────────────────────────────────────
		/**
		 * Closed-form damped-spring response, evaluated straight from `t` (in
		 * seconds) instead of integrated per frame — that is what keeps this
		 * cheap and drift-free.
		 */
		function createSpring(o) {
			var m = Math.max(1e-6, o.mass || 1);
			var k = Math.max(1e-6, o.stiffness || 1);
			var c = Math.max(0, o.damping || 0);

			var w0 = Math.sqrt(k / m);
			var zeta = c / (2 * Math.sqrt(k * m));
			var wd = w0 * Math.sqrt(Math.abs(1 - zeta * zeta));
			var decay = zeta * w0;

			return {
				w0: w0,
				zeta: zeta,
				wd: wd,
				decay: decay,
				value: function (t) {
					if (t <= 0) return 0;
					// ζ ≈ 1: the critically damped form, which is what 干脆 uses.
					if (Math.abs(zeta - 1) < 1e-4) {
						var ec = Math.exp(-w0 * t);
						return 1 - ec * (1 + w0 * t);
					}
					if (zeta < 1) {
						var e = Math.exp(-decay * t);
						return 1 - e * (Math.cos(wd * t) + (decay / wd) * Math.sin(wd * t));
					}
					var s = Math.sqrt(zeta * zeta - 1);
					var q1 = w0 * (-zeta + s);
					var q2 = w0 * (-zeta - s);
					return 1 + (q2 / (q1 - q2)) * Math.exp(q1 * t) - (q1 / (q1 - q2)) * Math.exp(q2 * t);
				}
			};
		}

		/** Plain ease-out: shrinks the line tail monotonically, so no negative length. */
		function easeOut(t) {
			return t * (2 - t);
		}

		// ── runtime state ──────────────────────────────────────────────────────
		var canvas = null;
		var ctx2d = null;
		var cssW = 0;
		var cssH = 0;
		var bursts = [];
		var pumping = false;
		var disposed = false;
		var colorCache = null;
		var spring = createSpring(PRESET);

		/**
		 * The stroke colour, read once and cached until the app switches theme.
		 * `getComputedStyle` is not free, and this runs on every press.
		 */
		function readColor() {
			if (PRESET.sparkColor) return PRESET.sparkColor;
			if (colorCache !== null) return colorCache;
			if (typeof getComputedStyle === "function") {
				var token = getComputedStyle(document.body).getPropertyValue("--dsw-alias-label-primary");
				if (token && token.trim()) return (colorCache = token.trim());
			}
			// The theme flips `body[data-ds-dark-theme]`; the token above normally wins.
			return (colorCache =
				document.body.dataset.dsDarkTheme !== undefined ? "#ffffff" : "#000000");
		}

		function resize() {
			cssW = window.innerWidth;
			cssH = window.innerHeight;
			var dpr = window.devicePixelRatio || 1;
			canvas.width = Math.max(1, Math.round(cssW * dpr));
			canvas.height = Math.max(1, Math.round(cssH * dpr));
			// Reset then scale: a second resize must not compound the transform.
			ctx2d.setTransform(1, 0, 0, 1, 0, 0);
			ctx2d.scale(dpr, dpr);
		}

		function makeSparks(x, y, now) {
			var n = Math.max(1, Math.round(PRESET.sparkCount));
			var out = [];
			for (var i = 0; i < n; i++) {
				out.push({
					x: x,
					y: y,
					angle: (2 * Math.PI * i) / n, // strictly even, so the burst is symmetric
					radius: PRESET.sparkRadius,
					size: PRESET.sparkSize,
					startTime: now
				});
			}
			return out;
		}

		function fire(x, y) {
			if (canvas === null || disposed) return;
			if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
			bursts.push({
				sparks: makeSparks(x, y, performance.now()),
				color: readColor()
			});
			pump();
		}

		function draw(now) {
			if (disposed) return;
			ctx2d.clearRect(0, 0, cssW, cssH);
			ctx2d.lineWidth = 2;

			var alive = [];
			for (var b = 0; b < bursts.length; b++) {
				var burst = bursts[b];
				var sparks = burst.sparks;
				var keep = [];
				ctx2d.strokeStyle = burst.color;
				ctx2d.beginPath();
				for (var i = 0; i < sparks.length; i++) {
					var sp = sparks[i];
					var elapsed = now - sp.startTime;
					if (elapsed >= PRESET.duration) continue;

					var p = elapsed > 0 ? elapsed / PRESET.duration : 0;
					var distance = spring.value(elapsed / 1000) * sp.radius * (PRESET.extraScale || 1);
					var lineLength = sp.size * (1 - easeOut(p));
					var cos = Math.cos(sp.angle);
					var sin = Math.sin(sp.angle);

					ctx2d.moveTo(sp.x + distance * cos, sp.y + distance * sin);
					ctx2d.lineTo(sp.x + (distance + lineLength) * cos, sp.y + (distance + lineLength) * sin);
					keep.push(sp);
				}
				// One stroke per burst: same pixels, one pass over the path.
				ctx2d.stroke();
				if (keep.length) {
					burst.sparks = keep;
					alive.push(burst);
				}
			}
			bursts = alive;

			// Stop the loop with the last burst: an idle page schedules no frames.
			if (bursts.length) {
				requestAnimationFrame(draw);
			} else {
				pumping = false;
				ctx2d.clearRect(0, 0, cssW, cssH);
			}
		}

		function pump() {
			if (pumping || disposed) return;
			pumping = true;
			requestAnimationFrame(draw);
		}

		function onPointerDown(event) {
			if (event.button !== undefined && event.button !== 0) return;
			fire(event.clientX, event.clientY);
		}

		function onTouchStart(event) {
			var touches = event.changedTouches;
			if (!touches) return;
			for (var i = 0; i < touches.length; i++) {
				fire(touches[i].clientX, touches[i].clientY);
			}
		}

		/** Mounts the overlay canvas and the pointer listeners. */
		function mount() {
			canvas = document.getElementById("dsh-vivid-motion-canvas");
			if (canvas !== null) return function () {}; // a live sibling half already owns it

			canvas = document.createElement("canvas");
			canvas.id = "dsh-vivid-motion-canvas";
			canvas.setAttribute("aria-hidden", "true");
			// document.body, outside the app frame: above the shell overlay layer
			// (`[data-shell-overlay]`, z-index 20) and outside its overflow clip.
			// `pointer-events:none` is inline so the overlay needs no stylesheet.
			canvas.style.cssText =
				"position:fixed;inset:0;width:100%;height:100%;z-index:2147483000;pointer-events:none";
			document.body.append(canvas);

			ctx2d = canvas.getContext("2d");
			if (ctx2d === null) throw new Error("dsh-vivid-motion: 2d canvas context unavailable");
			resize();

			// The theme flips `data-ds-dark-theme` on the body; the cached stroke
			// colour has to go with it.
			var observer =
				typeof MutationObserver === "function"
					? new MutationObserver(function () {
							colorCache = null;
						})
					: null;
			if (observer !== null) {
				observer.observe(document.body, { attributes: true, attributeFilter: ["data-ds-dark-theme"] });
			}

			window.addEventListener("resize", resize);
			document.addEventListener("pointerdown", onPointerDown, { passive: true, capture: true });
			document.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });

			return function () {
				disposed = true;
				window.removeEventListener("resize", resize);
				document.removeEventListener("pointerdown", onPointerDown, { capture: true });
				document.removeEventListener("touchstart", onTouchStart, { capture: true });
				if (observer !== null) observer.disconnect();
				bursts = [];
				pumping = false;
				colorCache = null;
				ctx2d = null;
				if (canvas !== null && canvas.parentNode !== null) canvas.parentNode.removeChild(canvas);
				canvas = null;
			};
		}

		/**
		 * Everything this plugin does is a DOM side effect, so the whole mount is
		 * one `ctx.effect`: unloading the row retracts the canvas, the listeners
		 * and the observer together.
		 */
		function apply(ctx) {
			ctx.effect(function () {
				disposed = false;
				try {
					return mount();
				} catch (error) {
					// A non-essential ornament must never take the page down with it.
					if (typeof console !== "undefined") console.error("dsh-vivid-motion: mount failed", error);
					return function () {};
				}
			}, "dsh-vivid-motion: click spark overlay");
		}

		exports.apply = apply;
		exports.inject = [];
		exports.PRESET = PRESET;
		return module.exports;
	}
});
