// src/loop/sh.test.ts
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { execSh, git } from './sh.ts';

let dir: string;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

test('execSh captures stdout, stderr, and the exit code', async () => {
  const r = await execSh('sh', ['-c', 'echo out; echo err 1>&2; exit 3']);
  expect(r).toEqual({ stdout: 'out\n', stderr: 'err\n', exitCode: 3, timedOut: false });
});

test('execSh reports a timeout instead of hanging', async () => {
  const r = await execSh('sh', ['-c', 'exec sleep 5'], { timeoutMs: 200 });
  expect(r.timedOut).toBe(true);
  expect(r.exitCode).not.toBe(0);
});

test('execSh resolves with exitCode 130 when aborted, without rejecting or setting timedOut', async () => {
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 100);
  const r = await execSh('sh', ['-c', 'exec sleep 5'], { signal: ac.signal });
  expect(r.exitCode).toBe(130);
  expect(r.timedOut).toBe(false);
});

test('git helper returns trimmed stdout and throws with stderr on failure', async () => {
  dir = await mkdtemp(join(tmpdir(), 'sh-'));
  await execSh('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  expect(await git(execSh, dir, 'branch', '--show-current')).toBe('main');
  await expect(git(execSh, dir, 'checkout', 'nope')).rejects.toThrow(/git checkout failed:/);
});
