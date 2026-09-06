import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { REPO_ROOT } from '../root.ts';

/** Single-quote a string for POSIX sh. */
export const shellQuote = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;

type Exec = (cmd: string, timeoutMs?: number) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

/**
 * `run_checks` verifies the working tree; `git_commit` stages the same working tree a moment
 * later. This is where the two agree on what "the same tree" means, so the second `npm run
 * check` can be skipped when nothing has changed in between.
 */
const CACHE_PATH = join(REPO_ROOT, 'data', 'checked-tree');

/**
 * The `git write-tree` hash of the current working tree (tracked, modified, and untracked
 * files), computed against a scratch copy of the index so callers never disturb what is
 * actually staged.
 */
export async function computeTreeHash(sh: Exec): Promise<string> {
  const tmp = (await sh('mktemp')).stdout.trim();
  try {
    await sh(`cp .git/index ${shellQuote(tmp)} 2>/dev/null || true`);
    const add = await sh(`GIT_INDEX_FILE=${shellQuote(tmp)} git add -A`);
    if (add.exitCode !== 0) throw new Error(`git add -A failed: ${add.stderr || add.stdout}`);
    const wt = await sh(`GIT_INDEX_FILE=${shellQuote(tmp)} git write-tree`);
    if (wt.exitCode !== 0) throw new Error(`git write-tree failed: ${wt.stderr || wt.stdout}`);
    return wt.stdout.trim();
  } finally {
    await sh(`rm -f ${shellQuote(tmp)}`);
  }
}

export async function readCachedTreeHash(): Promise<string | null> {
  try {
    return (await readFile(CACHE_PATH, 'utf8')).trim() || null;
  } catch {
    return null;
  }
}

export async function writeCachedTreeHash(hash: string): Promise<void> {
  await mkdir(dirname(CACHE_PATH), { recursive: true });
  await writeFile(CACHE_PATH, `${hash}\n`);
}
