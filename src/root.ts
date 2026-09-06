import { fileURLToPath } from 'node:url';

/** Absolute repository root of this source tree, independent of the process working directory. */
export const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));

/**
 * The checkout the Director's tools operate on. The worker loop runs the Director inside a
 * separate worktree and points PUBNYAN_ROOT at it; without the variable it is this checkout.
 */
export const WORK_ROOT = process.env.PUBNYAN_ROOT ? process.env.PUBNYAN_ROOT.replace(/\/?$/, '/') : REPO_ROOT;
