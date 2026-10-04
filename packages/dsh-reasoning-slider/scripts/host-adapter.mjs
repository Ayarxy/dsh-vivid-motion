import assert from 'node:assert/strict';

// Keep the reference slider, rendering and motion intact. These replacements
// affect host service dependencies, the picker controller and popup shell.
export function adaptHostSelection(source) {
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = text => text.replace(/\r?\n/g, newline);
  const replace = (from, to) => {
    from = lines(from);
    assert.equal(source.split(from).length, 2, 'Host adapter anchor must occur exactly once: ' + from.slice(0, 100));
    source = source.replace(from, () => lines(to));
  };
  // On a directory cache miss, directoryFor reads this.ctx.remote.session.
  // Cordis resolves that associated namespace through the calling context,
  // so the consumer must declare it too. Otherwise the first render of a new
  // session throws and the host abdicates this entry until plugin reload.
  replace('ctx.inject(["slots", "modelDirectories", "sessions"], (scope) => {',
    'ctx.inject(["slots", "modelDirectories", "sessions", "remote", "remote.session"], (scope) => {');
  replace('const [highlight, setHighlight] = React.useState(0);', `const [highlight, setHighlight] = React.useState(0);
			const [optimistic, setOptimistic] = React.useState(null);
			const ignoredPending = React.useRef(null), access = React.useRef(null);
			access.current = { directory, allowed: available && !locked };
			const sameModel = (a, b) => Boolean(a && b && a.provider === b.provider && a.model === b.model);`);
  replace('const current = state.pending ?? state.current;', `const pending = state.pending === ignoredPending.current ? null : state.pending;
			const current = optimistic ?? pending ?? state.current;`);
  replace('{ className: "dsh-reasoning-trigger-effort" }, effortLabel)',
    '{ className: "dsh-reasoning-trigger-effort", "data-maximum": isMaximumEffort(efforts, preview ?? efforts.findIndex((item) => item.id === effort)) || undefined }, effortLabel)');
  replace('open && pane === "effort" ? translate("chooseEffort") : modelLabel', 'modelLabel');
  replace('(!open || pane !== "effort") && effortLabel && h("span",', 'effortLabel && h("span",');
  replace('panel = React.useRef(null), search = React.useRef(null);',
    'panel = React.useRef(null), search = React.useRef(null), content = React.useRef(null);');
  replace('side: "top", align: "end", gap: 8, margin: 12',
    'side: "top", align: "center", gap: 8, margin: 12, contentRef: content, pane, reduced');
  // The independently sized content prevents animated shell height from
  // squeezing the list's scrollport, reflowing text or disturbing focus.
  replace('}, pane === "effort" ? h(React.Fragment, null,',
    '}, h("div", { ref: content, className: "dsh-reasoning-content" }, pane === "effort" ? h(React.Fragment, null,');
  replace('), document.body));', ')), document.body));');
  replace('const busy = saving || state.pending != null, blocked = locked || busy;', `const busy = saving || pending != null;
			const editingEffort = inFlight.current && !inFlight.current.modelChange && sameModel(current, state.current);
			const blocked = locked || busy && !editingEffort;`);
  // Opening/closing a menu is navigation, not a model write. Keep its chevron
  // and readable heading stable while an effort saves in the background.
  // aria-busy/live status still report the actual operation; model mutations
  // remain disabled until the pending selection has settled.
  replace('busy ? h(StateDot, { state: "ongoing" }) : h(IconChevronDownOutlineRegular)),',
    'h(IconChevronDownOutlineRegular)),');
  replace('className: "dsh-reasoning-model-link", onClick: openModels, disabled: busy,',
    'className: "dsh-reasoning-model-link", onClick: openModels, disabled: locked,');
  replace('className: "dsh-reasoning-option", disabled: blocked,',
    'className: "dsh-reasoning-option", disabled: locked || busy,');
  replace('const choose = (item) => { if (item) void submit(modelSelection(item, state.current), true); };',
    'const choose = (item) => { if (item && !locked && !busy) void submit(modelSelection(item, state.current), true); };');
  // A menu opened during a save can have no enabled items and no search box.
  // Keep keyboard focus in the popup so Escape/Tab can still dismiss it.
  replace('id, role: "dialog", "aria-label": translate("picker"), "aria-busy": busy,',
    'id, role: "dialog", "aria-label": translate("picker"), "aria-busy": busy, tabIndex: pane === "model" && busy && !showSearch ? -1 : undefined,');
  replace(`if (pane === "model") (showSearch ? search.current : panel.current?.querySelector('[aria-checked="true"]') ?? panel.current?.querySelector('[role="menuitemradio"]'))?.focus({ preventScroll: true });`,
    `if (pane === "model") (showSearch ? search.current : panel.current?.querySelector('[aria-checked="true"]:not(:disabled)') ?? panel.current?.querySelector('[role="menuitemradio"]:not(:disabled)') ?? panel.current)?.focus({ preventScroll: true });`);
  replace('React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);', `React.useEffect(() => { mounted.current = true; return () => {
				mounted.current = false;
				if (inFlight.current) inFlight.current.queued = null;
			}; }, []);
			React.useEffect(() => {
				if ((locked || !available) && inFlight.current) inFlight.current.queued = null;
			}, [locked, available]);
			React.useEffect(() => {
				inFlight.current = false; ignoredPending.current = null;
				setSaving(false); setOptimistic(null);
				return () => { inFlight.current = false; };
			}, [directory]);`);

  const start = source.indexOf('\t\t\tconst submit = async (selection, modelChange = false) => {');
  const end = source.indexOf('\t\t\tconst choose = ', start);
  assert.ok(start > 0 && end > start, 'Missing reference submission controller');
  replace(source.slice(start, end), `			const submit = async (selection, modelChange = false) => {
				if (!selection || locked || !available) return;
				const active = inFlight.current;
				if (active) {
					if (active.directory !== directory || modelChange || active.modelChange || !sameModel(selection, active.selection)) return;
					// Keep only the latest unsent effort. The current RPC is never raced.
					active.queued = selection;
					setOptimistic(selection); setError(null); setPreview(null);
					return;
				}
				if (pending != null) return;
				if (sameSelection(selection, state.current)) { if (modelChange) setPane("effort"); return; }
				const request = { selection, modelChange, queued: null, directory };
				inFlight.current = request; ignoredPending.current = null;
				setOptimistic(selection); setSaving(true); setError(null); setPreview(null);
				try {
					for (;;) {
						let result;
						try { result = await select(request.selection); }
						catch (reason) {
							// Some transports throw instead of returning a Remote Result. Do
							// not leave the input locked on that request's stale pending value.
							if (inFlight.current === request) ignoredPending.current = directory.getSnapshot().pending;
							result = { ok: false, error: { message: reason instanceof Error ? reason.message : translate("failed") } };
						}
						if (!mounted.current || inFlight.current !== request || access.current.directory !== directory) return;
						const next = request.queued;
						request.queued = null;
						if (next && access.current.allowed && sameModel(next, directory.getSnapshot().current) && !sameSelection(next, request.selection)) {
							request.selection = next;
							continue;
						}
						if (!result?.ok) setError(result?.error?.code === "session/writer-held" ? translate("writerHeld") : result?.error?.message ?? translate("failed"));
						else if (modelChange && openRef.current) { setQuery(""); setPane("effort"); }
						break;
					}
				} finally {
					if (inFlight.current === request && mounted.current) {
						inFlight.current = false;
						setSaving(false); setOptimistic(null);
						// An effort acknowledgement must not steal focus from a new drag.
						if (modelChange && openRef.current) queueMicrotask(() => {
							if (!mounted.current || !openRef.current) return;
							(panel.current?.querySelector('input[type="range"]:not(:disabled)') ?? search.current ?? panel.current?.querySelector("button:not(:disabled)"))?.focus({ preventScroll: true });
						});
					}
				}
			};
`);
  return source;
}

// Keep natural content size independent of the animated shell. Only the shell
// changes height: text is translated, never scaled. This factory is embedded
// into the generated client, so all of its helpers must remain self-contained.
export function createCenteredPosition(React) {
  const duration = 520, steps = 65;
  // Underdamped spring, mass 1 / stiffness 420 / damping 32. Sampled keyframes
  // let the browser run it without React renders or layout reads each frame.
  const spring = (from, to, velocity, ms) => {
    const time = ms / 1000, decay = 16, frequency = Math.sqrt(420 - decay * decay);
    const a = from - to, b = (velocity + decay * a) / frequency;
    return to + Math.exp(-decay * time) * (a * Math.cos(frequency * time) + b * Math.sin(frequency * time));
  };
  const sample = motion => {
    const position = Math.max(0, Math.min(steps, (Number(motion.animation.currentTime) || 0) / duration * steps));
    const index = Math.min(steps - 1, Math.floor(position)), fraction = position - index;
    const first = motion.values[index], last = motion.values[index + 1];
    const result = { velocity: {} };
    for (const key of ["top", "height"]) {
      result[key] = first[key] + (last[key] - first[key]) * fraction;
      result.velocity[key] = position === steps ? 0 : (last[key] - first[key]) * steps / duration * 1000;
    }
    return result;
  };
  return function useCenteredPosition({ open, anchorRef, panelRef, contentRef, pane, reduced, gap = 8, margin = 12 }) {
    const [placement, setPlacement] = React.useState(null);
    const controller = React.useRef(null), options = React.useRef(null);
    options.current = { pane, reduced };
    React.useLayoutEffect(() => {
      if (!open) { setPlacement(null); return; }
      const anchor = anchorRef.current, panel = panelRef.current, content = contentRef.current;
      if (!anchor || !panel || !content) return;
      // Capture the anchor once per opening. Effort/model label changes and
      // composer movement must not move a popup the user is already operating.
      const rect = anchor.getBoundingClientRect();
      let target = null, lastPane = null, motion = null, entrance = null, contentLimit = null;
      const stop = (keepEntrance = false) => {
        if (motion) { motion.animation.onfinish = null; motion.animation.cancel(); }
        motion = null;
        if (!keepEntrance) { entrance?.cancel(); entrance = null; }
      };
      const update = () => {
        const { pane, reduced } = options.current;
        const style = window.getComputedStyle(panel);
        const chrome = [style.paddingTop, style.paddingBottom, style.borderTopWidth, style.borderBottomWidth]
          .reduce((sum, value) => sum + (parseFloat(value) || 0), 0);
        const limit = style.maxHeight && style.maxHeight !== "none" ? `calc(${style.maxHeight} - ${chrome}px)` : "";
        if (contentLimit !== limit) { content.style.maxHeight = limit; contentLimit = limit; }
        const width = panel.offsetWidth;
        // Height animation never constrains this flex item. Its natural height
        // remains measurable even when a pane switch interrupts an animation.
        const inset = motion ? target.inset : panel.offsetHeight - content.offsetHeight;
        const height = content.offsetHeight + inset;
        const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
        const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
        const clamp = (value, end) => Math.max(margin, Math.min(value, end - margin));
        const left = clamp(rect.left + (rect.width - width) / 2, viewportWidth - width);
        const above = rect.top - gap - height, below = rect.bottom + gap;
        const useBelow = above < margin && below + height <= viewportHeight - margin;
        const top = clamp(useBelow ? below : above, viewportHeight - height);
        const changedPane = target && lastPane !== pane;
        const changedSize = target && (target.top !== top || target.left !== left || target.height !== height || target.width !== width);
        if (target && !changedPane && !changedSize && !reduced) return;
        const animate = target && !reduced && typeof panel.animate === "function" &&
          (changedPane || motion && changedSize);
        const from = motion ? sample(motion) : target && { ...target, velocity: { top: 0, height: 0 } };
        stop(animate && !changedPane);
        target = { top, left, width, height, inset }; lastPane = pane;
        setPlacement(previous => previous?.left === left && previous.top === top ? previous : { left, top });
        if (!animate) return;
        // Limit the small rebound at viewport edges, preserving the 8px gap
        // wherever there is room above/below the trigger.
        const room = useBelow ? viewportHeight - margin - below : rect.top - gap - margin;
        const maxHeight = Math.max(from.height, height, Math.min(viewportHeight - 32, room));
        const values = Array.from({ length: steps + 1 }, (_, index) => {
          if (index === steps) return { top, height };
          const time = index / steps * duration;
          const rawHeight = spring(from.height, height, from.velocity.height, time);
          const nextHeight = Math.max(inset, Math.min(rawHeight, maxHeight));
          const rawTop = spring(from.top, top, from.velocity.top, time);
          return { height: nextHeight, top: clamp(rawTop + (useBelow ? 0 : rawHeight - nextHeight), viewportHeight - nextHeight) };
        });
        const animation = panel.animate(values.map(value => ({ top: `${value.top}px`, height: `${value.height}px` })),
          { duration, easing: "linear", fill: "both" });
        motion = { animation, values };
        if (changedPane) {
          const distance = pane === "model" ? 12 : -6;
          entrance = content.animate(Array.from({ length: steps + 1 }, (_, index) => {
            const time = index / steps * duration;
            return { transform: `translateY(${index === steps ? 0 : spring(distance, 0, 0, time)}px)`,
              opacity: 1 - Math.pow(1 - Math.min(1, time / 140), 3) };
          }), { duration, easing: "linear", fill: "both" });
        }
        animation.onfinish = () => { if (motion?.animation === animation) stop(); };
      };
      // Reapply viewport bounds around the opening anchor when the window
      // resizes. Scrolling does not move this fixed popup or cancel its motion.
      const reposition = () => {
        stop(); update();
      };
      controller.current = update;
      update();
      const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
      observer?.observe(content);
      window.addEventListener("resize", reposition);
      return () => {
        controller.current = null;
        stop();
        observer?.disconnect();
        window.removeEventListener("resize", reposition);
      };
    }, [open, anchorRef, panelRef, contentRef, gap, margin]);
    React.useLayoutEffect(() => { controller.current?.(); }, [pane, reduced]);
    return placement;
  };
}

// Host theme applies superellipse to every element and pseudo-element. Restore
// the HTML's ordinary round corners only inside this component, including its
// body portal. The slider itself still uses the reference border-radius: 50%.
export const hostCSS = `
.dsh-reasoning-trigger-effort[data-maximum=true] { color:var(--rs-purple); }
:is(.dsh-reasoning-root, .dsh-reasoning-panel) { --dsw-corner-shape:round; }
:is(.dsh-reasoning-root, .dsh-reasoning-panel),
:is(.dsh-reasoning-root, .dsh-reasoning-panel) *,
:is(.dsh-reasoning-root, .dsh-reasoning-panel)::before,
:is(.dsh-reasoning-root, .dsh-reasoning-panel)::after,
:is(.dsh-reasoning-root, .dsh-reasoning-panel) *::before,
:is(.dsh-reasoning-root, .dsh-reasoning-panel) *::after { corner-shape:round; }
.dsh-reasoning-input::-webkit-slider-thumb { corner-shape:round; }
.dsh-reasoning-input::-moz-range-thumb { corner-shape:round; }
/* Decorative bursts must not create a scrollport or change the rail width. */
.dsh-reasoning-panel[role=dialog] { display:flex; flex-direction:column; overflow:clip; }
/* The hook derives max-height from the shell's actual padding and borders. */
.dsh-reasoning-content { display:flex; flex-direction:column; flex-shrink:0; min-height:0; }
.dsh-reasoning-header, .dsh-reasoning-slider-wrap, .dsh-reasoning-search, .dsh-reasoning-retry { flex-shrink:0; }
.dsh-reasoning-model-list { min-height:0; }
.dsh-reasoning-content > .dsh-reasoning-notice { min-height:0; overflow:auto; overflow-wrap:anywhere; overscroll-behavior:contain; }
`;
