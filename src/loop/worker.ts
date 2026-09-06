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

/**
 * `expectedTitle`, when given, lets the parser split a `FAILED: <title>: <reason>` line correctly
 * even when the title itself contains a colon; the non-greedy regex fallback below cannot.
 */
export function parseDirectorReply(r: { stdout: string; exitCode: number; timedOut: boolean }, expectedTitle?: string): DirectorOutcome {
  if (r.timedOut) return { kind: 'crash', reason: 'flue run timed out' };
  if (r.exitCode !== 0) return { kind: 'crash', reason: `flue run exited ${r.exitCode}` };
  const done = /^DONE: (.+) \(([0-9a-f]{7,40})\)\s*$/m.exec(r.stdout);
  if (done) return { kind: 'done', title: done[1], sha: done[2] };
  if (/^FAILED: no claimed item\s*$/m.test(r.stdout)) return { kind: 'failed', title: expectedTitle ?? '', reason: 'no claimed item' };
  if (expectedTitle) {
    const prefix = `FAILED: ${expectedTitle}: `;
    const line = r.stdout.split('\n').find((l) => l.startsWith(prefix));
    if (line) return { kind: 'failed', title: expectedTitle, reason: line.slice(prefix.length).trim() };
  }
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

/**
 * Leave HEAD of `workRoot` on agent/backlog, creating it from HEAD when it does not exist locally
 * or remotely, or from `origin/agent/backlog` when only the remote has it. Never resets an
 * existing local branch.
 */
export async function ensureBranch(sh: Sh, workRoot: string): Promise<void> {
  const current = await git(sh, workRoot, 'branch', '--show-current');
  if (current === AGENT_BRANCH) return;
  const has = await sh('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${AGENT_BRANCH}`], { cwd: workRoot });
  if (has.exitCode === 0) {
    await git(sh, workRoot, 'checkout', '-q', AGENT_BRANCH);
    return;
  }
  const hasRemote = await sh('git', ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${AGENT_BRANCH}`], { cwd: workRoot });
  if (hasRemote.exitCode === 0) {
    await git(sh, workRoot, 'checkout', '-q', '-b', AGENT_BRANCH, `origin/${AGENT_BRANCH}`);
    return;
  }
  await git(sh, workRoot, 'checkout', '-q', '-b', AGENT_BRANCH);
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

export interface ClaimedItem {
  title: string;
  text: string;
  section: string;
}

async function readBacklog(workRoot: string): Promise<string> {
  return readFile(join(workRoot, BACKLOG), 'utf8');
}

async function commitBacklog(sh: Sh, workRoot: string, md: string, message: string): Promise<void> {
  await writeFile(join(workRoot, BACKLOG), md);
  await git(sh, workRoot, 'add', BACKLOG);
  await git(sh, workRoot, 'commit', '-q', '-m', message);
}

/** A `[~]` at loop start is a claim left by a dead run: put those items back to `[ ]` and commit. */
export async function recoverOrphans(sh: Sh, workRoot: string): Promise<string[]> {
  let md = await readBacklog(workRoot);
  const titles = parseItems(md).filter((it) => it.state === 'claimed').map((it) => it.title);
  if (titles.length === 0) return [];
  for (const title of titles) md = setState(md, title, 'open');
  await commitBacklog(sh, workRoot, md, `chore(backlog): unclaim ${titles.join(', ')}`);
  return titles;
}

/** Flip the first `[ ]` item to `[~]` and commit the claim. Returns null when nothing is open. */
export async function claimNext(sh: Sh, workRoot: string): Promise<ClaimedItem | null> {
  const md = await readBacklog(workRoot);
  const item = firstItem(md, 'open');
  if (!item) return null;
  await commitBacklog(sh, workRoot, setState(md, item.title, 'claimed'), `chore(backlog): claim ${item.title}`);
  return { title: item.title, text: item.text, section: item.section };
}

/**
 * Stash whatever the failed run left behind, mark the item `[!]` with the reason, and commit.
 * Never flips an item that the Director already marked `[x]` before crashing: the item stays
 * done, and nothing is stashed or committed.
 */
export async function markFailed(sh: Sh, workRoot: string, title: string, reason: string, date?: string): Promise<{ stashed: boolean; alreadyDone: boolean }> {
  const before = await readBacklog(workRoot);
  const item = parseItems(before).find((it) => it.title === title);
  if (item?.state === 'done') return { stashed: false, alreadyDone: true };
  const dirty = (await git(sh, workRoot, 'status', '--porcelain')) !== '';
  if (dirty) await git(sh, workRoot, 'stash', 'push', '-u', '-q', '-m', `failed: ${title}`);
  const md = await readBacklog(workRoot);
  await commitBacklog(sh, workRoot, setState(md, title, 'failed', { reason, date }), `chore(backlog): fail ${title}`);
  return { stashed: dirty, alreadyDone: false };
}

/** Run the Director once for the claimed item, inside `workRoot`, and classify its reply. */
export async function runDirector(
  sh: Sh,
  workRoot: string,
  opts: { env: NodeJS.ProcessEnv; timeoutMs: number; signal?: AbortSignal; id?: string; title?: string; log?: (line: string) => void },
): Promise<DirectorOutcome> {
  const id = opts.id ?? `pubnyan-${Date.now()}`;
  opts.log?.(`flue run --id ${id}`);
  const r = await sh('npx', ['flue', 'run', 'src/agents/director.ts', '-m', 'next', '--id', id], {
    cwd: workRoot,
    env: { ...opts.env, PUBNYAN_ROOT: workRoot },
    timeoutMs: opts.timeoutMs,
    signal: opts.signal,
  });
  return parseDirectorReply(r, opts.title);
}
