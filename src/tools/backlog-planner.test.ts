import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { execSh, git } from '../loop/sh.ts';
import { readBacklogDoc, writeBacklog, type PlannerFs } from './backlog-planner.ts';

const BACKLOG = `# Backlog

## Section

- [ ] **One.** First. Done when: one.
- [ ] **Two.** Second. Done when: two.
`;

let repo: string;
let fs: PlannerFs;
let path: string;

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), 'planner-'));
  await git(execSh, repo, 'init', '-q', '-b', 'main');
  await git(execSh, repo, 'config', 'user.name', 'test');
  await git(execSh, repo, 'config', 'user.email', 'test@example.com');
  await execSh('mkdir', ['-p', join(repo, 'docs')]);
  path = join(repo, 'docs', 'backlog.md');
  await writeFile(path, BACKLOG);
  await git(execSh, repo, 'add', '-A');
  await git(execSh, repo, 'commit', '-q', '-m', 'init');
  // The worker has claimed One. on agent/backlog; main does not know.
  await git(execSh, repo, 'branch', 'agent/backlog');
  await git(execSh, repo, 'checkout', '-q', 'agent/backlog');
  await writeFile(path, BACKLOG.replace('- [ ] **One.**', '- [~] **One.**'));
  await git(execSh, repo, 'commit', '-q', '-am', 'chore(backlog): claim One.');
  await git(execSh, repo, 'checkout', '-q', 'main');
  fs = {
    readFile: (p) => readFile(p, 'utf8'),
    writeFile: (p, s) => writeFile(p, s),
    exec: async (cmd) => {
      const r = await execSh('sh', ['-c', cmd], { cwd: repo });
      return { stdout: r.stdout, stderr: r.stderr, exitCode: r.exitCode };
    },
  };
});
afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

test('readBacklogDoc lists items and the titles claimed on agent/backlog', async () => {
  const doc = await readBacklogDoc(fs, path);
  expect(doc.items).toEqual([
    { title: 'One.', state: 'open', section: 'Section' },
    { title: 'Two.', state: 'open', section: 'Section' },
  ]);
  expect(doc.claimed).toEqual(['One.']);
  expect(doc.markdown).toBe(BACKLOG);
});

test('writeBacklog applies ops, commits only docs/backlog.md on main, and reports titles', async () => {
  await writeFile(join(repo, 'other.txt'), 'unrelated dirt');
  const r = await writeBacklog(fs, path, [{ op: 'insert', title: 'Three.', text: 'Third. Done when: three.', section: 'Section' }], 'add Three');
  expect(r).toMatchObject({ ok: true, titles: ['Three.'] });
  expect(await git(execSh, repo, 'log', '-1', '--format=%s')).toBe('docs(backlog): add Three');
  expect(await git(execSh, repo, 'show', '--stat', '--format=', 'HEAD')).toMatch(/docs\/backlog\.md/);
  expect(await git(execSh, repo, 'status', '--porcelain')).toBe('?? other.txt');
});

test('writeBacklog refuses to touch the item claimed on agent/backlog', async () => {
  const r = await writeBacklog(fs, path, [{ op: 'replace', title: 'One.', text: 'x. Done when: x.' }], 'edit One');
  expect(r).toEqual({ ok: false, error: 'edits rejected', errors: ['replace "One.": item is claimed by the worker; leave it alone'] });
  expect(await fs.readFile(path)).toBe(BACKLOG);
});

test('writeBacklog refuses off main and with a dirty backlog', async () => {
  await git(execSh, repo, 'checkout', '-q', '-b', 'feature');
  expect(await writeBacklog(fs, path, [{ op: 'remove', title: 'Two.' }], 'x')).toEqual({ ok: false, error: 'not on main (on feature); the planner commits only on main' });
  await git(execSh, repo, 'checkout', '-q', 'main');
  await writeFile(path, `${BACKLOG}\nlocal edit\n`);
  expect(await writeBacklog(fs, path, [{ op: 'remove', title: 'Two.' }], 'x')).toEqual({ ok: false, error: 'docs/backlog.md has uncommitted changes; commit or discard them first' });
});

test('writeBacklog restores docs/backlog.md when the commit fails', async () => {
  const hookPath = join(repo, '.git', 'hooks', 'pre-commit');
  await writeFile(hookPath, '#!/bin/sh\nexit 1\n');
  await chmod(hookPath, 0o755);
  const r = await writeBacklog(fs, path, [{ op: 'insert', title: 'Three.', text: 'Third. Done when: three.', section: 'Section' }], 'add Three');
  expect(r.ok).toBe(false);
  expect((r as { ok: false; error: string }).error).toMatch(/restored/);
  expect(await git(execSh, repo, 'status', '--porcelain')).toBe('');
  expect(await fs.readFile(path)).toBe(BACKLOG);
});

test('writeBacklog refuses a multi-line summary before running any git command', async () => {
  const r = await writeBacklog(fs, path, [{ op: 'remove', title: 'Two.' }], 'first line\nsecond line');
  expect(r).toEqual({ ok: false, error: 'summary must be a single line' });
  expect(await fs.readFile(path)).toBe(BACKLOG);
  expect(await git(execSh, repo, 'status', '--porcelain')).toBe('');
});
