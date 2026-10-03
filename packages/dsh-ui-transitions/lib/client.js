window.__ModuleLoader__.load({
	id: "dsh-ui-transitions",
	factory: () => {
		const NS = "dsh-ui-transitions";

		/**
		 * Tier 1: paint-only enhancements for known DSH surfaces.
		 *
		 * Semantic hooks avoid depending on CSS-module hashes. :where() gives
		 * these defaults zero specificity so an owner's animation/transition
		 * declarations take precedence. General dialogs, tooltips, sidebars,
		 * switches, lists and the reasoning slider keep their existing motion.
		 *
		 * Opacity never changes the geometry used to position portaled menus.
		 * The fade's implicit end value is the owner's opacity; no fill mode,
		 * transform, layout, focus, hit-testing or unmount changes are needed.
		 */
		const CSS = `
@media (prefers-reduced-motion: no-preference) and (forced-colors: none) {
	@keyframes dsh-ui-transitions-enter {
		from { opacity: 0; }
	}

	/* MenuSurface is shared by ordinary menus and the composer suggestions.
	   A nested role=menu alone (e.g. in the reasoning slider) does not match. */
	:where(
		[data-menu-material="translucent"][role="menu"],
		[data-menu-material="translucent"][data-trigger-menu]
	) {
		animation: dsh-ui-transitions-enter 160ms cubic-bezier(.22, 1, .36, 1);
	}

	/* Settings has its own panel rather than the already-animated Modal. */
	:where([data-shortcut-modal="settings"][role="dialog"]) {
		animation: dsh-ui-transitions-enter 200ms cubic-bezier(.22, 1, .36, 1);
	}

	/* Only interpolate colors the host already changes on hover/selection.
	   Settings omits aria-current on inactive rows, so match its nav buttons. */
	:where(
		[data-menu-material="translucent"][role="menu"] button[role="menuitem"],
		[data-menu-material="translucent"][data-trigger-menu] [role="option"],
		[data-shortcut-modal="settings"][role="dialog"] > nav button[type="button"]
	) {
		transition: background-color 90ms ease-out, color 90ms ease-out;
	}
}
`;

		function apply(ctx) {
			ctx.effect(() => {
				const style = document.createElement("style");
				style.dataset.plugin = NS;
				style.textContent = CSS;
				document.head.appendChild(style);
				return () => style.remove();
			}, NS + ": tier 1 styles");
		}

		return { apply };
	}
});
