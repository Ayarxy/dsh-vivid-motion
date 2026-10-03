import assert from 'node:assert/strict';

// Keep the reference slider, rendering and motion intact. These replacements
// affect the picker's async submission controller and pending affordances.
export function adaptHostSelection(source) {
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = text => text.replace(/\r?\n/g, newline);
  const replace = (from, to) => {
    from = lines(from);
    assert.equal(source.split(from).length, 2, 'Host adapter anchor must occur exactly once: ' + from.slice(0, 100));
    source = source.replace(from, () => lines(to));
  };
  replace('const [highlight, setHighlight] = React.useState(0);', `const [highlight, setHighlight] = React.useState(0);
			const [optimistic, setOptimistic] = React.useState(null);
			const ignoredPending = React.useRef(null), access = React.useRef(null);
			access.current = { directory, allowed: available && !locked };
			const sameModel = (a, b) => Boolean(a && b && a.provider === b.provider && a.model === b.model);`);
  replace('const current = state.pending ?? state.current;', `const pending = state.pending === ignoredPending.current ? null : state.pending;
			const current = optimistic ?? pending ?? state.current;`);
  replace('{ className: "dsh-reasoning-trigger-effort" }, effortLabel)',
    '{ className: "dsh-reasoning-trigger-effort", "data-maximum": isMaximumEffort(efforts, preview ?? efforts.findIndex((item) => item.id === effort)) || undefined }, effortLabel)');
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
.dsh-reasoning-header, .dsh-reasoning-slider-wrap, .dsh-reasoning-search, .dsh-reasoning-retry { flex-shrink:0; }
.dsh-reasoning-model-list { min-height:0; }
.dsh-reasoning-panel > .dsh-reasoning-notice { min-height:0; overflow:auto; overflow-wrap:anywhere; overscroll-behavior:contain; }
`;
