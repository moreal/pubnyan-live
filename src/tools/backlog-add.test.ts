import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { REPO_ROOT } from '../root.ts';
import { execSh, git } from '../loop/sh.ts';
import { main } from '../../scripts/backlog-add.mjs';
import type { PlannerFs } from './backlog-planner.ts';

const BACKLOG = `# Backlog

## Section

- [ ] **One.** First. Done when: one.
`;

let repo: string;
let path: string;
let fs: PlannerFs;

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), 'backlog-add-'));
  await git(execSh, repo, 'init', '-q', '-b', 'main');
  await git(execSh, repo, 'config', 'user.name', 'test');
  await git(execSh, repo, 'config', 'user.email', 'test@example.com');
  await execSh('mkdir', ['-p', join(repo, 'docs')]);
  path = join(repo, 'docs', 'backlog.md');
  await writeFile(path, BACKLOG);
  await git(execSh, repo, 'add', '-A');
  await git(execSh, repo, 'commit', '-q', '-m', 'init');
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

test('adds an item and prints the sha', async () => {
  const input = JSON.stringify({
    summary: 'smoke add',
    ops: [{ op: 'insert', section: 'Section', title: 'Smoke: add cli.', text: 'x. Done when: y.' }],
  });
  const r = await main([], { input, fs, path });
  expect(r.ok).toBe(true);
  expect(r.output).toMatch(/^[0-9a-f]{7,}$/);
  expect(await git(execSh, repo, 'log', '-1', '--format=%s')).toBe('docs(backlog): smoke add');
  expect(await fs.readFile(path)).toContain('Smoke: add cli.');
});

test('rejects a duplicate title on the second run', async () => {
  const input = JSON.stringify({
    summary: 'smoke add',
    ops: [{ op: 'insert', section: 'Section', title: 'Smoke: add cli.', text: 'x. Done when: y.' }],
  });
  const first = await main([], { input, fs, path });
  expect(first.ok).toBe(true);
  const second = await main([], { input, fs, path });
  expect(second.ok).toBe(false);
  expect(second.output).toMatch(/edits rejected/);
  expect(second.output).toMatch(/already exists/i);
});

test('rejects invalid JSON', async () => {
  const r = await main([], { input: 'not json', fs, path });
  expect(r.ok).toBe(false);
  expect(r.output).toMatch(/invalid JSON/);
});

test('rejects an input that fails schema validation', async () => {
  const r = await main([], { input: JSON.stringify({ summary: 'x', ops: [] }), fs, path });
  expect(r.ok).toBe(false);
  expect(r.output).toMatch(/invalid input/);
});

// Spawns the actual `scripts/backlog-add.mjs` as a subprocess, exactly as `npm run backlog:add`
// does, piping the literal Done-when JSON on stdin. `BACKLOG_ADD_ROOT` points the script at the
// scratch repo (on `main`) instead of this checkout so the test never touches the real backlog.
test('the real CLI subprocess prints a sha and the commit message matches, then rejects a duplicate', async () => {
  const script = join(REPO_ROOT, 'scripts', 'backlog-add.mjs');
  const input = JSON.stringify({
    summary: 'smoke add',
    ops: [{ op: 'insert', section: 'Section', title: 'Smoke: add cli.', text: 'x. Done when: y.' }],
  });
  const env = { ...process.env, BACKLOG_ADD_ROOT: repo };

  const write = (args: string[]) =>
    new Promise<{ stdout: string; stderr: string; code: number }>((resolve) => {
      const child = execFile('node', args, { env }, (err, stdout, stderr) => {
        resolve({ stdout, stderr, code: (err as { code?: number } | null)?.code ?? 0 });
      });
      child.stdin?.end(input);
    });

  const first = await write([script]);
  expect(first.code).toBe(0);
  expect(first.stdout.trim()).toMatch(/^[0-9a-f]{7,}$/);
  expect(await git(execSh, repo, 'log', '-1', '--format=%s')).toBe('docs(backlog): smoke add');

  const second = await write([script]);
  expect(second.code).not.toBe(0);
  expect(second.stdout).toMatch(/edits rejected/);
  expect(second.stdout).toMatch(/already exists/i);
});
