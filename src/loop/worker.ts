// src/loop/worker.ts
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { firstItem, parseItems, setState } from '../tools/backlog-file.ts';
import { AGENT_BRANCH } from '../tools/git.ts';
import { git, type Sh } from './sh.ts';

export { AGENT_BRANCH };
const BACKLOG = join('docs', 'backlog.md');

export type DirectorOutcome =
  | { kind: 'done'; title: string; sha: string }
  | { kind: 'failed'; title: string; reason: string }
  | { kind: 'crash'; reason: string };

export function parseDirectorReply(r: { stdout: string; exitCode: number; timedOut: boolean }): DirectorOutcome {
  if (r.timedOut) return { kind: 'crash', reason: 'flue run timed out' };
  if (r.exitCode !== 0) return { kind: 'crash', reason: `flue run exited ${r.exitCode}` };
  const done = /^DONE: (.+) \(([0-9a-f]{7,40})\)\s*$/m.exec(r.stdout);
  if (done) return { kind: 'done', title: done[1], sha: done[2] };
  const failed = /^FAILED: (.+?): (.+)$/m.exec(r.stdout);
  if (failed) return { kind: 'failed', title: failed[1], reason: failed[2].trim() };
  const last = r.stdout.trim().split('\n').filter(Boolean).pop() ?? '';
  return { kind: 'crash', reason: `director did not follow the reply contract: ${last.slice(0, 200)}` };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Leave HEAD of `workRoot` on agent/backlog, creating it from HEAD when it does not exist. Never resets an existing branch. */
export async function ensureBranch(sh: Sh, workRoot: string): Promise<void> {
  const current = await git(sh, workRoot, 'branch', '--show-current');
  if (current === AGENT_BRANCH) return;
  const has = await sh('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${AGENT_BRANCH}`], { cwd: workRoot });
  await git(sh, workRoot, 'checkout', '-q', ...(has.exitCode === 0 ? [AGENT_BRANCH] : ['-b', AGENT_BRANCH]));
}

/**
 * Make sure a worktree on agent/backlog exists at `path`, its submodules are checked out, and
 * `install` has run for the current package-lock.json. The lock hash is remembered next to the
 * worktree so a restart does not reinstall.
 */
export async function ensureWorktree(sh: Sh, repoRoot: string, path: string, install: (path: string) => Promise<void>): Promise<string> {
  if (!(await exists(join(path, '.git')))) {
    await mkdir(dirname(path), { recursive: true });
    const has = await sh('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${AGENT_BRANCH}`], { cwd: repoRoot });
    if (has.exitCode === 0) await git(sh, repoRoot, 'worktree', 'add', path, AGENT_BRANCH);
    else await git(sh, repoRoot, 'worktree', 'add', '-b', AGENT_BRANCH, path, 'HEAD');
    const sub = await sh('git', ['submodule', 'update', '--init'], { cwd: path });
    if (sub.exitCode !== 0) throw new Error(`git submodule update failed: ${sub.stderr}`);
  }
  const lockHash = createHash('sha256').update(await readFile(join(path, 'package-lock.json'))).digest('hex');
  const marker = `${path}.lock-hash`;
  const previous = (await exists(marker)) ? (await readFile(marker, 'utf8')).trim() : '';
  if (previous !== lockHash) {
    await install(path);
    await writeFile(marker, `${lockHash}\n`);
  }
  return path;
}

/** Bring Planner commits from main into agent/backlog. On conflict, abort the merge and throw with the paths. */
export async function syncFromMain(sh: Sh, workRoot: string): Promise<void> {
  const r = await sh('git', ['merge', '--no-edit', 'main'], { cwd: workRoot });
  if (r.exitCode === 0) return;
  const conflicts = await git(sh, workRoot, 'diff', '--name-only', '--diff-filter=U');
  await sh('git', ['merge', '--abort'], { cwd: workRoot });
  throw new Error(`merge conflict with main: ${conflicts.split('\n').join(', ') || (r.stderr || r.stdout).trim()}`);
}
