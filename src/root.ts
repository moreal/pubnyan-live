import { fileURLToPath } from 'node:url';

/** Absolute repository root, independent of the process working directory. */
export const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
