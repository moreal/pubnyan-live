// src/tools/tree-hash.test.ts
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { execSh } from '../loop/sh.ts';
import { computeTreeHash } from './tree-hash.ts';

let repoDir: string;
let worktreeDir: string;

afterEach(async () => {
  if (worktreeDir) await rm(worktreeDir, { recursive: true, force: true });
  if (repoDir) await rm(repoDir, { recursive: true, force: true });
});

/** Run `cmd` through a shell in `cwd`, matching the `Exec` shape `computeTreeHash` expects. */
function shIn(cwd: string) {
  return async (cmd: string, timeoutMs?: number) => {
    const r = await execSh('sh', ['-c', cmd], { cwd, timeoutMs });
    return { stdout: r.stdout, stderr: r.stderr, exitCode: r.exitCode };
  };
}

test('computeTreeHash resolves the index inside a linked worktree', async () => {
  repoDir = await mkdtemp(join(tmpdir(), 'tree-hash-repo-'));
  const repoSh = shIn(repoDir);
  await repoSh('git init -q -b main');
  await repoSh('git config user.email test@example.com && git config user.name test');
  await writeFile(join(repoDir, 'a.txt'), 'a\n');
  await repoSh('git add a.txt && git commit -q -m initial');

  worktreeDir = join(tmpdir(), `tree-hash-wt-${Date.now()}`);
  await repoSh(`git worktree add -q -b agent/backlog ${worktreeDir}`);

  const wtSh = shIn(worktreeDir);
  const hash = await computeTreeHash(wtSh);
  expect(hash).toMatch(/^[0-9a-f]{40}$/);

  await writeFile(join(worktreeDir, 'untracked.txt'), 'new\n');
  const hashAfter = await computeTreeHash(wtSh);
  expect(hashAfter).toMatch(/^[0-9a-f]{40}$/);
  expect(hashAfter).not.toBe(hash);
});
