// src/loop/run.test.ts
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { abortAwareSleep, runLoop } from './run.ts';
import { execSh, git, type Sh } from './sh.ts';

const BACKLOG = `# Backlog

## Section

- [ ] **First.** Do it. Done when: done.
- [ ] **Second.** Do it too. Done when: done.
`;

let repo: string;
beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), 'run-'));
  await git(execSh, repo, 'init', '-q', '-b', 'main');
  await git(execSh, repo, 'config', 'user.name', 'test');
  await git(execSh, repo, 'config', 'user.email', 'test@example.com');
  await execSh('mkdir', ['-p', join(repo, 'docs')]);
  await writeFile(join(repo, 'docs', 'backlog.md'), BACKLOG);
  await writeFile(join(repo, 'package-lock.json'), '{}');
  await git(execSh, repo, 'add', '-A');
  await git(execSh, repo, 'commit', '-q', '-m', 'init');
});
afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

/** A Director stand-in: marks the claimed item done and commits, like the real one, then replies. */
function fakeDirector(script: Array<'done' | 'failed' | 'crash' | 'done-then-garbage' | 'sigint'>, opts: { ac?: AbortController } = {}): Sh {
  let i = 0;
  return async (cmd, args, execOpts) => {
    if (cmd !== 'npx') return execSh(cmd, args, execOpts);
    const cwd = execOpts?.cwd ?? repo;
    const md = await readFile(join(cwd, 'docs', 'backlog.md'), 'utf8');
    const title = /- \[~\] \*\*(.+?)\*\*/.exec(md)![1];
    const kind = script[i++] ?? 'crash';
    if (kind === 'done' || kind === 'done-then-garbage') {
      await writeFile(join(cwd, 'docs', 'backlog.md'), md.replace(`- [~] **${title}**`, `- [x] **${title}**`));
      await git(execSh, cwd, 'commit', '-q', '-am', `feat: ${title}`);
      const sha = await git(execSh, cwd, 'rev-parse', '--short', 'HEAD');
      if (kind === 'done-then-garbage') return { stdout: 'I got confused and forgot the reply contract.', stderr: '', exitCode: 0, timedOut: false };
      return { stdout: `DONE: ${title} (${sha})\n`, stderr: '', exitCode: 0, timedOut: false };
    }
    if (kind === 'failed') return { stdout: `FAILED: ${title}: could not\n`, stderr: '', exitCode: 0, timedOut: false };
    if (kind === 'sigint') {
      opts.ac?.abort();
      return { stdout: '', stderr: '', exitCode: 130, timedOut: false };
    }
    return { stdout: '', stderr: 'boom', exitCode: 1, timedOut: false };
  };
}

const base = (sh: Sh) => ({
  repoRoot: repo,
  useWorktree: true,
  pollMs: 10,
  directorTimeoutMs: 1000,
  maxConsecutiveFailures: 3,
  sh,
  install: async () => {},
  resolveEnv: () => ({}),
  sleep: async () => {},
  log: () => {},
});

test('completes items until max, one claim commit and one item commit each', async () => {
  const r = await runLoop({ ...base(fakeDirector(['done', 'done'])), max: 2 });
  expect(r).toEqual({ completed: 2, failed: 0, reason: 'reached max 2' });
  const work = join(repo, '.worktrees', 'agent');
  const log = await git(execSh, work, 'log', '--format=%s');
  expect(log.split('\n')).toEqual(['feat: Second.', 'chore(backlog): claim Second.', 'feat: First.', 'chore(backlog): claim First.', 'init']);
});

test('a failed item is marked and skipped; the loop continues to the next', async () => {
  const r = await runLoop({ ...base(fakeDirector(['failed', 'done'])), max: 1 });
  expect(r).toEqual({ completed: 1, failed: 1, reason: 'reached max 1' });
  const md = await readFile(join(repo, '.worktrees', 'agent', 'docs', 'backlog.md'), 'utf8');
  expect(md).toMatch(/- \[!\] \*\*First\.\*\*.*\n  - failed \d{4}-\d{2}-\d{2}: could not\n- \[x\] \*\*Second\.\*\*/);
});

test('an empty backlog waits and re-checks main; stops when the signal aborts', async () => {
  await writeFile(join(repo, 'docs', 'backlog.md'), '# Backlog\n\n## Section\n\n- [x] **Old.** done\n');
  await git(execSh, repo, 'commit', '-q', '-am', 'empty');
  const ac = new AbortController();
  let sleeps = 0;
  const sleep = async () => {
    sleeps++;
    if (sleeps === 1) {
      await writeFile(join(repo, 'docs', 'backlog.md'), '# Backlog\n\n## Section\n\n- [x] **Old.** done\n- [ ] **New.** Done when: done.\n');
      await git(execSh, repo, 'commit', '-q', '-am', 'docs(backlog): add New');
    } else ac.abort();
  };
  const r = await runLoop({ ...base(fakeDirector(['done'])), max: null, sleep, signal: ac.signal });
  expect(r.completed).toBe(1);
  expect(r.reason).toBe('stopped');
  expect(sleeps).toBe(2);
});

test('the default sleep is abort-aware: SIGINT-style abort during an idle poll stops promptly', async () => {
  await writeFile(join(repo, 'docs', 'backlog.md'), '# Backlog\n\n## Section\n\n- [x] **Old.** done\n');
  await git(execSh, repo, 'commit', '-q', '-am', 'empty');
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 50);
  const start = performance.now();
  const r = await runLoop({ ...base(fakeDirector([])), max: null, pollMs: 60_000, signal: ac.signal, sleep: undefined });
  const elapsed = performance.now() - start;
  expect(r.reason).toBe('stopped');
  expect(elapsed).toBeLessThan(5000);
});

test('stops after three consecutive failures', async () => {
  await writeFile(join(repo, 'docs', 'backlog.md'), `${BACKLOG}- [ ] **Third.** Done when: done.\n- [ ] **Fourth.** Done when: done.\n`);
  await git(execSh, repo, 'commit', '-q', '-am', 'more');
  const r = await runLoop({ ...base(fakeDirector(['crash', 'failed', 'crash'])), max: null });
  expect(r).toEqual({ completed: 0, failed: 3, reason: '3 consecutive failures' });
});

test('stops immediately on an empty backlog when max is set, without sleeping', async () => {
  await writeFile(join(repo, 'docs', 'backlog.md'), '# Backlog\n\n## Section\n\n- [x] **Old.** done\n');
  await git(execSh, repo, 'commit', '-q', '-am', 'empty');
  let sleeps = 0;
  const r = await runLoop({ ...base(fakeDirector([])), max: 1, sleep: async () => { sleeps++; } });
  expect(r).toEqual({ completed: 0, failed: 0, reason: 'backlog empty' });
  expect(sleeps).toBe(0);
});

test('refuses a dirty work tree', async () => {
  const r0 = await runLoop({ ...base(fakeDirector([])), max: 0 });
  expect(r0.reason).toBe('reached max 0');
  await writeFile(join(repo, '.worktrees', 'agent', 'junk.txt'), 'x');
  const r = await runLoop({ ...base(fakeDirector(['done'])), max: 1 });
  expect(r.reason).toMatch(/working tree is dirty/);
});

test('a director that marks done + commits but replies with garbage counts as completed, not failed', async () => {
  const r = await runLoop({ ...base(fakeDirector(['done-then-garbage'])), max: 1 });
  expect(r).toEqual({ completed: 1, failed: 0, reason: 'reached max 1' });
  const work = join(repo, '.worktrees', 'agent');
  expect(await git(execSh, work, 'log', '--format=%s')).not.toMatch(/fail/);
  const md = await readFile(join(work, 'docs', 'backlog.md'), 'utf8');
  expect(md).toContain('- [x] **First.**');
});

test('SIGINT during the Director run leaves the claim in place and does not mark it failed', async () => {
  const ac = new AbortController();
  const sh = fakeDirector(['sigint'], { ac });
  const r = await runLoop({ ...base(sh), max: null, signal: ac.signal });
  expect(r).toEqual({ completed: 0, failed: 0, reason: 'stopped' });
  const work = join(repo, '.worktrees', 'agent');
  const md = await readFile(join(work, 'docs', 'backlog.md'), 'utf8');
  expect(md).toContain('- [~] **First.**');
  expect(await git(execSh, work, 'log', '--format=%s')).not.toMatch(/fail/);
});

test('a stale lock left by a dead process does not block the loop', async () => {
  const work = join(repo, '.worktrees', 'agent');
  await execSh('mkdir', ['-p', join(repo, '.worktrees')]);
  await writeFile(`${work}.lock`, '999999');
  const r = await runLoop({ ...base(fakeDirector(['done'])), max: 1 });
  expect(r).toEqual({ completed: 1, failed: 0, reason: 'reached max 1' });
});

test('a lock held by the current (alive) process refuses to start a second loop', async () => {
  await runLoop({ ...base(fakeDirector([])), max: 0 }); // creates the worktree
  const work = join(repo, '.worktrees', 'agent');
  await writeFile(`${work}.lock`, String(process.pid));
  const r = await runLoop({ ...base(fakeDirector(['done'])), max: 1 });
  expect(r).toEqual({ completed: 0, failed: 0, reason: `another loop is running (pid ${process.pid})` });
  await rm(`${work}.lock`, { force: true });
});

test('the lock is released after the loop returns', async () => {
  const work = join(repo, '.worktrees', 'agent');
  await runLoop({ ...base(fakeDirector(['done'])), max: 1 });
  await expect(readFile(`${work}.lock`, 'utf8')).rejects.toThrow();
});

test('abortAwareSleep resolves immediately when the signal is already aborted', async () => {
  const ac = new AbortController();
  ac.abort();
  const start = performance.now();
  await abortAwareSleep(ac.signal)(1500);
  expect(performance.now() - start).toBeLessThan(200);
});
