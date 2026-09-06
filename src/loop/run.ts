// src/loop/run.ts
import { open, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { piBearerToken, resolveAnthropicEnv } from '../tools/anthropic-auth.ts';
import { execSh, git, type Sh } from './sh.ts';
import { claimNext, ensureBranch, ensureWorktree, markFailed, recoverOrphans, runDirector, syncFromMain } from './worker.ts';

export interface LoopOptions {
  repoRoot: string;
  /** false: run in repoRoot itself (CI). true: in <repoRoot>/.worktrees/agent. */
  useWorktree: boolean;
  /** Stop after this many completed items; null runs until aborted. */
  max: number | null;
  pollMs: number;
  directorTimeoutMs: number;
  maxConsecutiveFailures: number;
  sh?: Sh;
  install?: (path: string) => Promise<void>;
  /** Returns the env additions for the Director run, or null when no credentials are available. */
  resolveEnv?: () => NodeJS.ProcessEnv | null;
  sleep?: (ms: number) => Promise<void>;
  signal?: AbortSignal;
  log?: (line: string) => void;
}

export interface LoopResult {
  completed: number;
  failed: number;
  reason: string;
}

const defaultInstall = async (path: string) => {
  const r = await execSh('npm', ['ci', '--no-audit', '--no-fund'], { cwd: path, timeoutMs: 600_000 });
  if (r.exitCode !== 0) throw new Error(`npm ci failed in ${path}: ${r.stderr.slice(-2000)}`);
};

const defaultResolveEnv = (): NodeJS.ProcessEnv | null => {
  const auth = resolveAnthropicEnv(process.env, piBearerToken);
  return auth.source === 'none' ? null : { ...process.env, ...auth.env };
};

/** Resolves after `ms`, or immediately when `signal` aborts first, so an idle poll can be interrupted. */
export const abortAwareSleep = (signal: AbortSignal | undefined) => (ms: number) =>
  new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Take a pid lock file at `lockPath` so two loops never share a worktree and unclaim each other's
 * items. Overwrites a lock left by a dead process.
 */
async function acquireLock(lockPath: string): Promise<{ acquired: true } | { acquired: false; pid: number }> {
  try {
    const fh = await open(lockPath, 'wx');
    try {
      await fh.writeFile(String(process.pid));
    } finally {
      await fh.close();
    }
    return { acquired: true };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
  }
  const pid = Number((await readFile(lockPath, 'utf8').catch(() => '')).trim());
  if (Number.isInteger(pid) && isAlive(pid)) return { acquired: false, pid };
  await writeFile(lockPath, String(process.pid));
  return { acquired: true };
}

export async function runLoop(o: LoopOptions): Promise<LoopResult> {
  const sh = o.sh ?? execSh;
  const log = o.log ?? ((line: string) => console.log(`[agent-loop] ${line}`));
  const sleep = o.sleep ?? abortAwareSleep(o.signal);
  const resolveEnv = o.resolveEnv ?? defaultResolveEnv;
  const install = o.install ?? defaultInstall;

  const workRoot = o.useWorktree ? await ensureWorktree(sh, o.repoRoot, join(o.repoRoot, '.worktrees', 'agent'), install) : o.repoRoot;

  const lockPath = o.useWorktree ? join(o.repoRoot, '.worktrees', 'agent.lock') : join(o.repoRoot, '.agent-loop.lock');
  const lock = await acquireLock(lockPath);
  if (!lock.acquired) return { completed: 0, failed: 0, reason: `another loop is running (pid ${lock.pid})` };

  try {
    await ensureBranch(sh, workRoot);
    log(`work root ${workRoot}`);

    let completed = 0;
    let failed = 0;
    let streak = 0;
    const stopped = () => o.signal?.aborted === true;

    while (!stopped()) {
      if (o.max !== null && completed >= o.max) return { completed, failed, reason: `reached max ${o.max}` };

      const dirty = await git(sh, workRoot, 'status', '--porcelain');
      if (dirty !== '') return { completed, failed, reason: `working tree is dirty in ${workRoot}:\n${dirty}` };

      await syncFromMain(sh, workRoot);
      if (o.useWorktree) await ensureWorktree(sh, o.repoRoot, workRoot, install); // package-lock may have changed
      for (const t of await recoverOrphans(sh, workRoot)) log(`unclaimed stale item: ${t}`);

      // Credentials are checked before claiming so a missing key never marks an item failed.
      const env = resolveEnv();
      if (!env) return { completed, failed, reason: 'no credentials: set ANTHROPIC_API_KEY in .env or log in with `pi`' };

      const item = await claimNext(sh, workRoot);
      if (!item) {
        if (o.max !== null) return { completed, failed, reason: 'backlog empty' };
        log(`backlog empty, sleeping ${Math.round(o.pollMs / 1000)}s`);
        await sleep(o.pollMs);
        continue;
      }
      log(`claimed: ${item.title}`);

      const out = await runDirector(sh, workRoot, { env, timeoutMs: o.directorTimeoutMs, signal: o.signal, title: item.title, log });
      // SIGINT during the Director run: the claim stays; the next start recovers it. Never mark it failed.
      if (stopped()) return { completed, failed, reason: 'stopped' };
      if (out.kind === 'done') {
        completed++;
        streak = 0;
        log(`DONE: ${out.title} (${out.sha})`);
        continue;
      }
      const marked = await markFailed(sh, workRoot, item.title, out.reason);
      if (marked.alreadyDone) {
        completed++;
        streak = 0;
        log(`DONE (recovered): ${item.title}`);
        continue;
      }
      failed++;
      streak++;
      log(`FAILED: ${item.title}: ${out.reason}${marked.stashed ? ' (dirty tree stashed)' : ''}`);
      if (streak >= o.maxConsecutiveFailures) return { completed, failed, reason: `${streak} consecutive failures` };
    }
    return { completed, failed, reason: 'stopped' };
  } finally {
    await rm(lockPath, { force: true });
  }
}
