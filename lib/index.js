/**
 * Aggregate bundle entry — an empty shell.
 *
 * This package owns no behavior: its `cordis.patch.yml` inserts one row per
 * component package under `packages/`, and the loader imports those rows'
 * `name` specifiers instead of this entry. It exists because npm and the DSH
 * installer expect a resolvable package entry.
 */

/** Provides no host-side behavior. */
export function apply() {}
