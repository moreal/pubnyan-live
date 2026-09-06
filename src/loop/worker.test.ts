// src/loop/worker.test.ts
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { execSh, git } from './sh.ts';
import type { Sh } from './sh.ts';
import { AGENT_BRANCH, claimNext, ensureBranch, ensureWorktree, markFailed, parseDirectorReply, recoverOrphans, runDirector, syncFromMain } from './worker.ts';

const BACKLOG = `# Backlog

## Section

- [ ] **First.** Do it. Done when: done.
- [ ] **Second.** Do it too. Done when: done.
`;

let repo: string;
const g = (...args: string[]) => git(execSh, repo, ...args);

async function commitAll(message: string, cwd = repo) {
  await git(execSh, cwd, 'add', '-A');
  await git(execSh, cwd, 'commit', '-q', '-m', message);
}

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), 'worker-'));
  await g('init', '-q', '-b', 'main');
  await g('config', 'user.name', 'test');
  await g('config', 'user.email', 'test@example.com');
  await execSh('mkdir', ['-p', join(repo, 'docs')]);
  await writeFile(join(repo, 'docs', 'backlog.md'), BACKLOG);
  await writeFile(join(repo, 'package-lock.json'), '{"v":1}');
  await commitAll('init');
});

afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

describe('parseDirectorReply', () => {
  test('DONE line', () => {
    expect(parseDirectorReply({ stdout: 'noise\nDONE: First. (abc1234)\n', exitCode: 0, timedOut: false })).toEqual({ kind: 'done', title: 'First.', sha: 'abc1234' });
  });
  test('FAILED line', () => {
    expect(parseDirectorReply({ stdout: 'FAILED: First.: reviewer gave up\n', exitCode: 0, timedOut: false })).toEqual({ kind: 'failed', title: 'First.', reason: 'reviewer gave up' });
  });
  test('timeout and non-zero exit are crashes', () => {
    expect(parseDirectorReply({ stdout: '', exitCode: 1, timedOut: true })).toEqual({ kind: 'crash', reason: 'flue run timed out' });
    expect(parseDirectorReply({ stdout: 'DONE: First. (abc1234)', exitCode: 2, timedOut: false })).toEqual({ kind: 'crash', reason: 'flue run exited 2' });
  });
  test('a reply that breaks the contract is a crash', () => {
    expect(parseDirectorReply({ stdout: 'I did some things.', exitCode: 0, timedOut: false })).toEqual({ kind: 'crash', reason: 'director did not follow the reply contract: I did some things.' });
  });
});

describe('ensureBranch', () => {
  test('creates agent/backlog from HEAD when missing and is a no-op afterwards', async () => {
    await ensureBranch(execSh, repo);
    expect(await g('branch', '--show-current')).toBe(AGENT_BRANCH);
    await ensureBranch(execSh, repo);
    expect(await g('branch', '--show-current')).toBe(AGENT_BRANCH);
  });
});

describe('ensureWorktree', () => {
  test('adds the worktree on agent/backlog and installs once per lock hash', async () => {
    const installs: string[] = [];
    const install = async (p: string) => {
      installs.push(p);
    };
    const path = join(repo, '.worktrees', 'agent');
    expect(await ensureWorktree(execSh, repo, path, install)).toBe(path);
    expect(await git(execSh, path, 'branch', '--show-current')).toBe(AGENT_BRANCH);
    expect(installs).toEqual([path]);

    await ensureWorktree(execSh, repo, path, install);
    expect(installs).toEqual([path]);

    await writeFile(join(repo, 'package-lock.json'), '{"v":2}');
    await commitAll('bump lock');
    await git(execSh, path, 'merge', '--no-edit', 'main');
    await ensureWorktree(execSh, repo, path, install);
    expect(installs).toEqual([path, path]);
  });
});

describe('syncFromMain', () => {
  test('merges main into agent/backlog', async () => {
    const path = join(repo, '.worktrees', 'agent');
    await ensureWorktree(execSh, repo, path, async () => {});
    await writeFile(join(repo, 'docs', 'backlog.md'), `${BACKLOG}- [ ] **Third.** New. Done when: done.\n`);
    await commitAll('docs(backlog): add Third');
    await syncFromMain(execSh, path);
    expect(await readFile(join(path, 'docs', 'backlog.md'), 'utf8')).toContain('**Third.**');
  });

  test('aborts and throws on a conflict, leaving the tree clean', async () => {
    const path = join(repo, '.worktrees', 'agent');
    await ensureWorktree(execSh, repo, path, async () => {});
    await writeFile(join(path, 'docs', 'backlog.md'), BACKLOG.replace('**First.** Do it.', '**First.** Worker edit.'));
    await commitAll('worker edit', path);
    await writeFile(join(repo, 'docs', 'backlog.md'), BACKLOG.replace('**First.** Do it.', '**First.** Planner edit.'));
    await commitAll('planner edit');
    await expect(syncFromMain(execSh, path)).rejects.toThrow(/merge conflict with main: docs\/backlog\.md/);
    expect(await git(execSh, path, 'status', '--porcelain')).toBe('');
  });
});

describe('claim / recover / fail', () => {
  test('claimNext flips the first open item and commits the claim', async () => {
    await ensureBranch(execSh, repo);
    const item = await claimNext(execSh, repo);
    expect(item).toEqual({ title: 'First.', text: '**First.** Do it. Done when: done.', section: 'Section' });
    expect(await g('log', '-1', '--format=%s')).toBe('chore(backlog): claim First.');
    expect(await g('status', '--porcelain')).toBe('');
    expect(await readFile(join(repo, 'docs', 'backlog.md'), 'utf8')).toContain('- [~] **First.**');
  });

  test('claimNext returns null when nothing is open', async () => {
    await writeFile(join(repo, 'docs', 'backlog.md'), '- [x] **Only.** done\n');
    await commitAll('all done');
    expect(await claimNext(execSh, repo)).toBeNull();
  });

  test('recoverOrphans unclaims every claimed item in one commit', async () => {
    await writeFile(join(repo, 'docs', 'backlog.md'), BACKLOG.replace('- [ ] **First.**', '- [~] **First.**').replace('- [ ] **Second.**', '- [~] **Second.**'));
    await commitAll('two stale claims');
    expect(await recoverOrphans(execSh, repo)).toEqual(['First.', 'Second.']);
    expect(await g('log', '-1', '--format=%s')).toBe('chore(backlog): unclaim First., Second.');
    expect(await readFile(join(repo, 'docs', 'backlog.md'), 'utf8')).toBe(BACKLOG);
    expect(await recoverOrphans(execSh, repo)).toEqual([]);
  });

  test('markFailed stashes a dirty tree, marks the item, and commits', async () => {
    await ensureBranch(execSh, repo);
    await claimNext(execSh, repo);
    await writeFile(join(repo, 'scratch.txt'), 'half-done work');
    const r = await markFailed(execSh, repo, 'First.', 'reviewer never passed', '2026-09-06');
    expect(r.stashed).toBe(true);
    expect(await g('status', '--porcelain')).toBe('');
    expect(await g('stash', 'list')).toMatch(/failed: First\./);
    expect(await g('log', '-1', '--format=%s')).toBe('chore(backlog): fail First.');
    const md = await readFile(join(repo, 'docs', 'backlog.md'), 'utf8');
    expect(md).toContain('- [!] **First.** Do it. Done when: done.\n  - failed 2026-09-06: reviewer never passed\n');
  });

  test('markFailed with a clean tree does not stash', async () => {
    await ensureBranch(execSh, repo);
    await claimNext(execSh, repo);
    expect((await markFailed(execSh, repo, 'First.', 'timed out')).stashed).toBe(false);
  });
});

describe('runDirector', () => {
  test('spawns flue run in the work root with PUBNYAN_ROOT and parses the reply', async () => {
    const calls: { cmd: string; args: string[]; cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number }[] = [];
    const fake: Sh = async (cmd, args, opts = {}) => {
      calls.push({ cmd, args, cwd: opts.cwd, env: opts.env, timeoutMs: opts.timeoutMs });
      return { stdout: 'DONE: First. (abc1234)\n', stderr: '', exitCode: 0, timedOut: false };
    };
    const out = await runDirector(fake, '/work', { env: { ANTHROPIC_API_KEY: 'k' }, timeoutMs: 1000, id: 'pubnyan-1' });
    expect(out).toEqual({ kind: 'done', title: 'First.', sha: 'abc1234' });
    expect(calls).toEqual([
      {
        cmd: 'npx',
        args: ['flue', 'run', 'src/agents/director.ts', '-m', 'next', '--id', 'pubnyan-1'],
        cwd: '/work',
        env: { ANTHROPIC_API_KEY: 'k', PUBNYAN_ROOT: '/work' },
        timeoutMs: 1000,
      },
    ]);
  });
});
