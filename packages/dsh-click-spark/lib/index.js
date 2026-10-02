/**
 * Host loader entry for a browser-only plugin.
 *
 * The whole effect lives in the renderer, so the host half owns no service, no
 * route and no configuration. It exists because the Cordis loader needs a
 * resolvable package entry with an `apply` before it mounts the row.
 */

/** Provides no host-side behavior. */
export function apply() {}
