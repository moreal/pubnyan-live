# Async Backlog Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Planner agent add and edit backlog items on `main` while a Worker loop keeps completing items in its own worktree on `agent/backlog`, with claim/done/failed states in `docs/backlog.md` keeping the two from colliding.

**Architecture:** `docs/backlog.md` stays the queue and gains four states (`[ ]`, `[~]`, `[x]`, `[!]`), with items identified by title instead of line. Pure markdown transforms live in `src/tools/backlog-file.ts` and `src/tools/backlog-edit.ts`; the Worker loop steps live in `src/loop/worker.ts` as functions over an injected shell runner so they are tested against a temporary git repository; `scripts/agent-loop.mjs` and `scripts/plan.mjs` are thin CLIs around `flue run`. Repository-touching tools resolve their root from `PUBNYAN_ROOT` so the same code serves the main checkout and the worker worktree.

**Tech Stack:** `@flue/runtime` 2.0.3 / `@flue/cli` 2.0.3 (installed), `valibot` 1.4, Node 26 native TypeScript, vitest 5, git.

**Spec:** `docs/superpowers/specs/2026-09-06-async-backlog-loop-design.md`

## Global Constraints

- Node >= 26, ESM, native TypeScript: local imports carry `.ts` extensions; no enums, no parameter properties (erasable syntax only).
- Conventional commits. Never commit `dist/verify/`, `data/`, `.env`, `.worktrees/`.
- Harness tools: `defineTool({ name, description, input: v.object(...), harness: true, async run({ data, harness }) })`; `harness.sandbox.exec(cmd, { cwd, timeoutMs })` returns `{ stdout, stderr, exitCode }`; `harness.sandbox.readFile/writeFile(absPath)`.
- Skills: `import skill from '../skills/<name>/SKILL.md'`; the frontmatter `name` MUST equal the directory name.
- Model ids: Director and Planner `anthropic/claude-opus-5`; Implementer and Reviewer `anthropic/claude-sonnet-5`.
- Agent branch is `agent/backlog`; the Planner commits only on `main`.
- Item titles are the bold text at the start of an item (`**...**`), matched exactly (including a trailing period when present).
- Failure reason bullet format: `  - failed YYYY-MM-DD: <reason>` (two-space indent), directly under the item.
- `Done when:` sentence is required in every item the Planner writes: regex `/(^|\s)Done when: \S/`.
- Run `npm test` and `npm run check:types` before every commit in this plan. `npm run verify` is not needed for these tasks (no motion or exporter changes), but the final task runs the full `npm run check` once.
- Tests that need git create a temporary directory with `mkdtemp` under `os.tmpdir()`, run `git init -b main`, set `user.name`/`user.email` locally, and remove the directory in `afterEach`.

## File structure

```
src/root.ts                         REPO_ROOT (unchanged) + WORK_ROOT (PUBNYAN_ROOT ?? REPO_ROOT)
src/tools/backlog-file.ts           pure: parseItems, findItem, firstItem, countItems, setState, duplicateTitles, hasDoneWhen
src/tools/backlog-file.test.ts
src/tools/backlog.ts                read_backlog (claimed item), mark_done({title})   [WORK_ROOT]
src/tools/checks.ts, git.ts, tree-hash.ts   REPO_ROOT -> WORK_ROOT
src/tools/backlog-edit.ts           pure: applyOps(md, ops, protectedTitles)
src/tools/backlog-edit.test.ts
src/tools/backlog-planner.ts        read_backlog_doc, write_backlog                     [REPO_ROOT]
src/tools/backlog-planner.test.ts
src/loop/sh.ts                      Sh type + execSh (child_process.spawn)
src/loop/worker.ts                  parseDirectorReply, ensureBranch, ensureWorktree, syncFromMain, recoverOrphans, claimNext, markFailed, runDirector
src/loop/worker.test.ts
src/loop/run.ts                     runLoop(options): the iteration + sleep + safety rules
scripts/agent-loop.mjs              CLI: [--max N] [--poll 5m] [--no-worktree]
scripts/plan.mjs                    CLI: npm run plan -- <topic> "<message>"
src/agents/director.ts              prompt: claimed item, FAILED: no claimed item
src/agents/reviewer.ts              prompt: verify Done when
src/agents/planner.ts               Planner
src/skills/backlog-authoring/SKILL.md
docs/backlog.md                     header: states and actor rules
AGENTS.md                           commands and rules
.github/workflows/agent.yml         npm run agent -- --max 1
.gitignore                          .worktrees/
package.json                        scripts: plan
```

---

### Task 1: Backlog states and title-based transforms

**Files:**
- Modify: `src/tools/backlog-file.ts` (rewrite)
- Modify: `src/tools/backlog-file.test.ts` (rewrite)

**Interfaces:**
- Produces:
  ```ts
  export type ItemState = 'open' | 'claimed' | 'done' | 'failed';
  export interface BacklogItem { line: number; state: ItemState; title: string; text: string; section: string; }
  export function parseItems(md: string): BacklogItem[];
  export function findItem(md: string, title: string): BacklogItem | null;   // first item with that title, any state
  export function firstItem(md: string, state: ItemState): BacklogItem | null;
  export function countItems(md: string): Record<ItemState, number>;
  export function setState(md: string, title: string, state: ItemState, opts?: { reason?: string; date?: string }): string;
  export function duplicateTitles(md: string): string[];                      // among non-done items
  export function hasDoneWhen(text: string): boolean;
  export const MARKER: Record<ItemState, string>;                              // { open: ' ', claimed: '~', done: 'x', failed: '!' }
  ```
- `text` is the whole item text after the checkbox (starts with `**title**`), as before.

- [ ] **Step 1: Write the failing tests**

Replace `src/tools/backlog-file.test.ts` with:

```ts
import { describe, expect, test } from 'vitest';
import { countItems, duplicateTitles, findItem, firstItem, hasDoneWhen, parseItems, setState } from './backlog-file.ts';

const md = `# Backlog

Intro text.

## Phase 4: Lottie

- [x] **Done thing.** Already finished.
- [ ] **export-lottie: static frame.** Build the first exporter. Done when: parity on \`spinner\` passes.
- [~] **Claimed item.** Being worked on. Done when: it is.

## Maintenance

- [!] **Broken item.** Something small. Done when: fixed.
  - failed 2026-09-01: reviewer never passed
- [ ] **Tidy.** Something small. Done when: tidy.
`;

describe('parseItems', () => {
  test('reads every state with its section, title, text, and 1-based line', () => {
    expect(parseItems(md)).toEqual([
      { line: 7, state: 'done', title: 'Done thing.', text: '**Done thing.** Already finished.', section: 'Phase 4: Lottie' },
      { line: 8, state: 'open', title: 'export-lottie: static frame.', text: '**export-lottie: static frame.** Build the first exporter. Done when: parity on `spinner` passes.', section: 'Phase 4: Lottie' },
      { line: 9, state: 'claimed', title: 'Claimed item.', text: '**Claimed item.** Being worked on. Done when: it is.', section: 'Phase 4: Lottie' },
      { line: 13, state: 'failed', title: 'Broken item.', text: '**Broken item.** Something small. Done when: fixed.', section: 'Maintenance' },
      { line: 15, state: 'open', title: 'Tidy.', text: '**Tidy.** Something small. Done when: tidy.', section: 'Maintenance' },
    ]);
  });

  test('an item without a bold title uses the first 60 characters as its title', () => {
    expect(parseItems('- [ ] plain text item')[0].title).toBe('plain text item');
  });
});

describe('lookups', () => {
  test('findItem matches the title exactly', () => {
    expect(findItem(md, 'Tidy.')?.line).toBe(15);
    expect(findItem(md, 'Tidy')).toBeNull();
  });

  test('firstItem returns the first item in the given state or null', () => {
    expect(firstItem(md, 'open')?.title).toBe('export-lottie: static frame.');
    expect(firstItem(md, 'claimed')?.title).toBe('Claimed item.');
    expect(firstItem('- [x] **All.** done', 'open')).toBeNull();
  });

  test('countItems counts every state', () => {
    expect(countItems(md)).toEqual({ open: 2, claimed: 1, done: 1, failed: 1 });
  });
});

describe('setState', () => {
  test('open -> claimed flips only the marker', () => {
    const next = setState(md, 'Tidy.', 'claimed');
    expect(next.split('\n')[14]).toBe('- [~] **Tidy.** Something small. Done when: tidy.');
    expect(countItems(next)).toEqual({ open: 1, claimed: 2, done: 1, failed: 1 });
  });

  test('claimed -> done', () => {
    expect(findItem(setState(md, 'Claimed item.', 'done'), 'Claimed item.')?.state).toBe('done');
  });

  test('-> failed inserts the reason bullet under the item', () => {
    const next = setState(md, 'Tidy.', 'failed', { reason: 'check suite red', date: '2026-09-06' });
    const lines = next.split('\n');
    expect(lines[14]).toBe('- [!] **Tidy.** Something small. Done when: tidy.');
    expect(lines[15]).toBe('  - failed 2026-09-06: check suite red');
  });

  test('failed -> open removes the reason bullets', () => {
    const next = setState(md, 'Broken item.', 'open');
    const lines = next.split('\n');
    expect(lines[12]).toBe('- [ ] **Broken item.** Something small. Done when: fixed.');
    expect(lines[13]).toBe('- [ ] **Tidy.** Something small. Done when: tidy.');
  });

  test('is idempotent when the item is already in that state', () => {
    expect(setState(md, 'Done thing.', 'done')).toBe(md);
  });

  test('throws when the title does not exist', () => {
    expect(() => setState(md, 'Nope.', 'done')).toThrow(/no backlog item titled "Nope."/);
  });
});

describe('validation helpers', () => {
  test('duplicateTitles ignores done items', () => {
    const dup = `- [x] **A.** x\n- [ ] **A.** y\n- [ ] **B.** z\n- [!] **B.** w\n`;
    expect(duplicateTitles(dup)).toEqual(['B.']);
  });

  test('hasDoneWhen requires the sentence with content', () => {
    expect(hasDoneWhen('**T.** Do it. Done when: `npm test` passes.')).toBe(true);
    expect(hasDoneWhen('**T.** Do it. Done when:')).toBe(false);
    expect(hasDoneWhen('**T.** Do it.')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/tools/backlog-file.test.ts`
Expected: FAIL (`parseItems` is not exported).

- [ ] **Step 3: Rewrite the module**

Replace `src/tools/backlog-file.ts` with:

```ts
export type ItemState = 'open' | 'claimed' | 'done' | 'failed';

export interface BacklogItem {
  /** 1-based line number in docs/backlog.md */
  line: number;
  state: ItemState;
  /** The bold title without the asterisks, e.g. "export-lottie: static frame." */
  title: string;
  /** The whole item text after the checkbox */
  text: string;
  /** Nearest preceding "## " heading */
  section: string;
}

export const MARKER: Record<ItemState, string> = { open: ' ', claimed: '~', done: 'x', failed: '!' };
const STATE_OF: Record<string, ItemState> = { ' ': 'open', '~': 'claimed', x: 'done', X: 'done', '!': 'failed' };
const ITEM = /^- \[([ ~xX!])\] /;
const REASON = /^  - failed \d{4}-\d{2}-\d{2}: /;
const DONE_WHEN = /(^|\s)Done when: \S/;

export function parseItems(md: string): BacklogItem[] {
  const lines = md.split('\n');
  const items: BacklogItem[] = [];
  let section = '';
  for (let i = 0; i < lines.length; i++) {
    const heading = /^##\s+(.*)$/.exec(lines[i]);
    if (heading) {
      section = heading[1].trim();
      continue;
    }
    const m = ITEM.exec(lines[i]);
    if (!m) continue;
    const text = lines[i].slice(m[0].length).trim();
    const title = /^\*\*(.+?)\*\*/.exec(text)?.[1] ?? text.slice(0, 60);
    items.push({ line: i + 1, state: STATE_OF[m[1]], title, text, section });
  }
  return items;
}

export function findItem(md: string, title: string): BacklogItem | null {
  return parseItems(md).find((it) => it.title === title) ?? null;
}

export function firstItem(md: string, state: ItemState): BacklogItem | null {
  return parseItems(md).find((it) => it.state === state) ?? null;
}

export function countItems(md: string): Record<ItemState, number> {
  const counts: Record<ItemState, number> = { open: 0, claimed: 0, done: 0, failed: 0 };
  for (const it of parseItems(md)) counts[it.state]++;
  return counts;
}

/**
 * Returns the markdown with the item titled `title` moved to `state`. Entering `failed` inserts a
 * reason bullet directly under the item; leaving `failed` removes any reason bullets. Idempotent
 * when the item is already in `state`. Throws when no item has that title.
 */
export function setState(md: string, title: string, state: ItemState, opts: { reason?: string; date?: string } = {}): string {
  const item = findItem(md, title);
  if (!item) throw new Error(`no backlog item titled "${title}"`);
  if (item.state === state) return md;
  const lines = md.split('\n');
  const i = item.line - 1;
  lines[i] = `- [${MARKER[state]}] ${item.text}`;
  if (item.state === 'failed') {
    while (i + 1 < lines.length && REASON.test(lines[i + 1])) lines.splice(i + 1, 1);
  }
  if (state === 'failed') {
    const date = opts.date ?? new Date().toISOString().slice(0, 10);
    const reason = (opts.reason ?? 'unknown').replace(/\s+/g, ' ').trim();
    lines.splice(i + 1, 0, `  - failed ${date}: ${reason}`);
  }
  return lines.join('\n');
}

/** Titles that appear more than once among items that are not done. */
export function duplicateTitles(md: string): string[] {
  const seen = new Map<string, number>();
  for (const it of parseItems(md)) {
    if (it.state === 'done') continue;
    seen.set(it.title, (seen.get(it.title) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([t]) => t);
}

export function hasDoneWhen(text: string): boolean {
  return DONE_WHEN.test(text);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/tools/backlog-file.test.ts`
Expected: PASS, 13 tests. `npm run check:types` will fail because `backlog.ts` still imports `firstOpenItem`/`markDone`; Task 2 fixes that. Do not commit yet.

### Task 2: WORK_ROOT and title-based `read_backlog` / `mark_done`

**Files:**
- Modify: `src/root.ts`
- Modify: `src/tools/backlog.ts` (rewrite)
- Modify: `src/tools/checks.ts:2,29`, `src/tools/git.ts:4,18`, `src/tools/tree-hash.ts:3,16`
- Modify: `src/agents/director.ts` (prompt lines only)
- Modify: `src/agents/reviewer.ts` (prompt lines only)

**Interfaces:**
- Consumes: Task 1.
- Produces: `export const WORK_ROOT: string` in `src/root.ts`; tool `read_backlog` output `{ item: { title, text, section } | null, counts: Record<ItemState, number> }`; tool `mark_done` input `{ title: string }`, output `{ ok: true, title, alreadyDone: boolean }`.

- [ ] **Step 1: Add WORK_ROOT**

Replace `src/root.ts` with:

```ts
import { fileURLToPath } from 'node:url';

/** Absolute repository root of this source tree, independent of the process working directory. */
export const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));

/**
 * The checkout the Director's tools operate on. The worker loop runs the Director inside a
 * separate worktree and points PUBNYAN_ROOT at it; without the variable it is this checkout.
 */
export const WORK_ROOT = process.env.PUBNYAN_ROOT ? process.env.PUBNYAN_ROOT.replace(/\/?$/, '/') : REPO_ROOT;
```

- [ ] **Step 2: Point the Director's tools at WORK_ROOT**

In `src/tools/checks.ts`, `src/tools/git.ts`, and `src/tools/tree-hash.ts` change `import { REPO_ROOT } from '../root.ts';` to `import { WORK_ROOT } from '../root.ts';` and replace every `REPO_ROOT` use in those three files with `WORK_ROOT` (`cwd: WORK_ROOT` in checks.ts and git.ts; `join(WORK_ROOT, 'data', 'checked-tree')` in tree-hash.ts).

- [ ] **Step 3: Rewrite backlog.ts**

Replace `src/tools/backlog.ts` with:

```ts
import { defineTool } from '@flue/runtime';
import type { JsonValue } from '@flue/runtime';
import { join } from 'node:path';
import * as v from 'valibot';
import { WORK_ROOT } from '../root.ts';
import { countItems, findItem, firstItem, setState } from './backlog-file.ts';

export const BACKLOG_PATH = join(WORK_ROOT, 'docs', 'backlog.md');

export const readBacklog = defineTool({
  name: 'read_backlog',
  description: 'Return the backlog item currently claimed for you (marked `- [~]` in docs/backlog.md): title, full text, section. item is null when nothing is claimed. Also returns the counts per state.',
  harness: true,
  async run({ harness }): Promise<{ output: JsonValue }> {
    const md = await harness.sandbox.readFile(BACKLOG_PATH);
    const item = firstItem(md, 'claimed');
    return {
      output: {
        item: item ? { title: item.title, text: item.text, section: item.section } : null,
        counts: countItems(md),
      },
    };
  },
});

export const markDoneTool = defineTool({
  name: 'mark_done',
  description: 'Mark the backlog item with this exact title done (`- [x]`) in docs/backlog.md. Call after the reviewer passed the item. Idempotent: calling it on an item that is already done is a no-op.',
  input: v.object({ title: v.pipe(v.string(), v.minLength(1)) }),
  harness: true,
  async run({ data, harness }) {
    const md = await harness.sandbox.readFile(BACKLOG_PATH);
    const item = findItem(md, data.title);
    if (!item) return { output: { ok: false, error: `no backlog item titled "${data.title}"` } };
    const alreadyDone = item.state === 'done';
    if (!alreadyDone) await harness.sandbox.writeFile(BACKLOG_PATH, setState(md, data.title, 'done'));
    return { output: { ok: true, title: item.title, alreadyDone } };
  },
});
```

- [ ] **Step 4: Update the Director prompt**

In `src/agents/director.ts` replace the procedure's step 1 and step 4 text:

- Step 1 becomes: `1. Call read_backlog. If item is null, reply exactly: FAILED: no claimed item`
- In step 4 replace `call mark_done with the item's line` with `call mark_done with the item's exact title`.
- In the final step, remove the words `or "BACKLOG EMPTY"` if present; the two allowed replies are `DONE: <item title> (<sha>)` and `FAILED: <item title>: <reason>`.

- [ ] **Step 5: Update the Reviewer prompt**

In `src/agents/reviewer.ts` replace procedure step 5 with:

```
5. Find the sentence in the item that starts with "Done when:". Run or inspect exactly what it says (a command and its expected result, a parity target, a file that must exist). Then check the remaining acceptance criteria one by one.
```

and change the reply format so both branches start with the Done-when result:

```
Reply with exactly one of:
- `PASS` on the first line, then a line `Done when: <what you ran and what it showed>`, then one paragraph on what else you verified.
- `FINDINGS:` on the first line, then a line `Done when: <met | not met: why>`, then a numbered list of concrete, actionable defects (file, what is wrong, what to change). Only list things that block the item; polish goes in a final "Notes (non-blocking)" line.
```

- [ ] **Step 6: Type-check and test**

Run: `npm run check:types && npm test`
Expected: both green.

- [ ] **Step 7: Commit**

```bash
git add src/root.ts src/tools/backlog-file.ts src/tools/backlog-file.test.ts src/tools/backlog.ts src/tools/checks.ts src/tools/git.ts src/tools/tree-hash.ts src/agents/director.ts src/agents/reviewer.ts
git commit -m "feat(backlog): four item states, title-based mark_done, WORK_ROOT for the director's tools"
```

### Task 3: Shell runner for the loop

**Files:**
- Create: `src/loop/sh.ts`
- Create: `src/loop/sh.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ShResult { stdout: string; stderr: string; exitCode: number; timedOut: boolean; }
  export interface ShOptions { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv; signal?: AbortSignal; }
  export type Sh = (cmd: string, args: string[], opts?: ShOptions) => Promise<ShResult>;
  export const execSh: Sh;
  export async function git(sh: Sh, cwd: string, ...args: string[]): Promise<string>;  // trimmed stdout; throws Error(`git ${args[0]} failed: ${stderr||stdout}`) on non-zero
  ```

- [ ] **Step 1: Write the failing tests**

```ts
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

test('git helper returns trimmed stdout and throws with stderr on failure', async () => {
  dir = await mkdtemp(join(tmpdir(), 'sh-'));
  await execSh('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  expect(await git(execSh, dir, 'branch', '--show-current')).toBe('main');
  await expect(git(execSh, dir, 'checkout', 'nope')).rejects.toThrow(/git checkout failed:/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/loop/sh.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/loop/sh.ts
import { spawn } from 'node:child_process';

export interface ShResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

export interface ShOptions {
  cwd?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}

export type Sh = (cmd: string, args: string[], opts?: ShOptions) => Promise<ShResult>;

/** Spawn a process, capture both streams, and resolve when it exits. Never rejects on a non-zero exit. */
export const execSh: Sh = (cmd, args, opts = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env ?? process.env, signal: opts.signal, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    child.stdout.setEncoding('utf8').on('data', (d: string) => (stdout += d));
    child.stderr.setEncoding('utf8').on('data', (d: string) => (stderr += d));
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill('SIGTERM');
        }, opts.timeoutMs)
      : null;
    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      // AbortSignal kills surface as an error; report them as a failed run, not a crash of the loop.
      if ((err as NodeJS.ErrnoException).name === 'AbortError') resolve({ stdout, stderr, exitCode: 130, timedOut });
      else reject(err);
    });
    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? (signal ? 128 : 1), timedOut });
    });
  });

/** Run git in `cwd`; return trimmed stdout or throw with the error text. */
export async function git(sh: Sh, cwd: string, ...args: string[]): Promise<string> {
  const r = await sh('git', args, { cwd });
  if (r.exitCode !== 0) throw new Error(`git ${args[0]} failed: ${(r.stderr || r.stdout).trim()}`);
  return r.stdout.trim();
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/loop/sh.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/loop/sh.ts src/loop/sh.test.ts
git commit -m "feat(loop): shell runner with timeout and git helper"
```

### Task 4: Worker steps: reply parsing, branch, worktree, sync

**Files:**
- Create: `src/loop/worker.ts`
- Create: `src/loop/worker.test.ts`
- Modify: `.gitignore` (add `.worktrees/`)

**Interfaces:**
- Consumes: `Sh`, `execSh`, `git` from Task 3; `parseItems`, `setState`, `firstItem` from Task 1.
- Produces:
  ```ts
  export const AGENT_BRANCH = 'agent/backlog';
  export type DirectorOutcome =
    | { kind: 'done'; title: string; sha: string }
    | { kind: 'failed'; title: string; reason: string }
    | { kind: 'crash'; reason: string };
  export function parseDirectorReply(r: { stdout: string; exitCode: number; timedOut: boolean }): DirectorOutcome;
  export async function ensureBranch(sh: Sh, workRoot: string): Promise<void>;                 // HEAD on agent/backlog (create from HEAD if missing)
  export async function ensureWorktree(sh: Sh, repoRoot: string, path: string, install: (path: string) => Promise<void>): Promise<string>;
  export async function syncFromMain(sh: Sh, workRoot: string): Promise<void>;                 // merge main; abort + throw on conflict
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// src/loop/worker.test.ts
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { execSh, git } from './sh.ts';
import { AGENT_BRANCH, ensureBranch, ensureWorktree, parseDirectorReply, syncFromMain } from './worker.ts';

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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/loop/worker.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the first half of worker.ts**

```ts
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

export { BACKLOG, firstItem, parseItems, setState };
```

The trailing re-export line exists only so Task 5 can extend this file without an unused-import error in the meantime; Task 5 removes it.

Add `.worktrees/` to `.gitignore`.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/loop/worker.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/loop/worker.ts src/loop/worker.test.ts .gitignore
git commit -m "feat(loop): director reply parsing, branch and worktree setup, merge from main"
```

### Task 5: Worker steps: orphan recovery, claim, fail, run

**Files:**
- Modify: `src/loop/worker.ts`
- Modify: `src/loop/worker.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ClaimedItem { title: string; text: string; section: string; }
  export async function recoverOrphans(sh: Sh, workRoot: string): Promise<string[]>;           // titles unclaimed
  export async function claimNext(sh: Sh, workRoot: string): Promise<ClaimedItem | null>;
  export async function markFailed(sh: Sh, workRoot: string, title: string, reason: string, date?: string): Promise<{ stashed: boolean }>;
  export async function runDirector(sh: Sh, workRoot: string, opts: { env: NodeJS.ProcessEnv; timeoutMs: number; signal?: AbortSignal; id?: string }): Promise<DirectorOutcome>;
  ```

- [ ] **Step 1: Add the failing tests**

Append to `src/loop/worker.test.ts` (extend the import line with `claimNext, markFailed, recoverOrphans, runDirector` and add `import type { Sh } from './sh.ts';`):

```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/loop/worker.test.ts`
Expected: FAIL (`claimNext` is not exported).

- [ ] **Step 3: Implement**

In `src/loop/worker.ts` delete the last line (`export { BACKLOG, firstItem, parseItems, setState };`) and append:

```ts
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

/** Stash whatever the failed run left behind, mark the item `[!]` with the reason, and commit. */
export async function markFailed(sh: Sh, workRoot: string, title: string, reason: string, date?: string): Promise<{ stashed: boolean }> {
  const dirty = (await git(sh, workRoot, 'status', '--porcelain')) !== '';
  if (dirty) await git(sh, workRoot, 'stash', 'push', '-u', '-q', '-m', `failed: ${title}`);
  const md = await readBacklog(workRoot);
  await commitBacklog(sh, workRoot, setState(md, title, 'failed', { reason, date }), `chore(backlog): fail ${title}`);
  return { stashed: dirty };
}

/** Run the Director once for the claimed item, inside `workRoot`, and classify its reply. */
export async function runDirector(
  sh: Sh,
  workRoot: string,
  opts: { env: NodeJS.ProcessEnv; timeoutMs: number; signal?: AbortSignal; id?: string },
): Promise<DirectorOutcome> {
  const id = opts.id ?? `pubnyan-${Date.now()}`;
  const r = await sh('npx', ['flue', 'run', 'src/agents/director.ts', '-m', 'next', '--id', id], {
    cwd: workRoot,
    env: { ...opts.env, PUBNYAN_ROOT: workRoot },
    timeoutMs: opts.timeoutMs,
    signal: opts.signal,
  });
  return parseDirectorReply(r);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/loop/worker.test.ts && npm run check:types`
Expected: PASS, 15 tests; types clean.

- [ ] **Step 5: Commit**

```bash
git add src/loop/worker.ts src/loop/worker.test.ts
git commit -m "feat(loop): claim, orphan recovery, failure marking, director run"
```

### Task 6: The loop runner and the `npm run agent` CLI

**Files:**
- Create: `src/loop/run.ts`
- Create: `src/loop/run.test.ts`
- Modify: `scripts/agent-loop.mjs` (rewrite)
- Modify: `.github/workflows/agent.yml:36`

**Interfaces:**
- Consumes: everything from Tasks 3 to 5; `resolveAnthropicEnv`, `piBearerToken` from `src/tools/anthropic-auth.ts`.
- Produces:
  ```ts
  export interface LoopOptions {
    repoRoot: string;
    useWorktree: boolean;          // false: workRoot = repoRoot
    max: number | null;            // null = forever
    pollMs: number;
    directorTimeoutMs: number;
    maxConsecutiveFailures: number;
    sh?: Sh;                       // default execSh
    install?: (path: string) => Promise<void>;   // default: npm ci in path
    resolveEnv?: () => NodeJS.ProcessEnv | null; // default: resolveAnthropicEnv over process.env; null = no credentials
    sleep?: (ms: number) => Promise<void>;
    signal?: AbortSignal;
    log?: (line: string) => void;
  }
  export async function runLoop(o: LoopOptions): Promise<{ completed: number; failed: number; reason: string }>;
  ```

- [ ] **Step 1: Write the failing test**

The loop is tested with a fake `sh` for `npx` and the real one for git, so the whole iteration runs against a temporary repository.

```ts
// src/loop/run.test.ts
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { runLoop } from './run.ts';
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
function fakeDirector(script: Array<'done' | 'failed' | 'crash'>): Sh {
  let i = 0;
  return async (cmd, args, opts) => {
    if (cmd !== 'npx') return execSh(cmd, args, opts);
    const cwd = opts?.cwd ?? repo;
    const md = await readFile(join(cwd, 'docs', 'backlog.md'), 'utf8');
    const title = /- \[~\] \*\*(.+?)\*\*/.exec(md)![1];
    const kind = script[i++] ?? 'crash';
    if (kind === 'done') {
      await writeFile(join(cwd, 'docs', 'backlog.md'), md.replace(`- [~] **${title}**`, `- [x] **${title}**`));
      await git(execSh, cwd, 'commit', '-q', '-am', `feat: ${title}`);
      const sha = await git(execSh, cwd, 'rev-parse', '--short', 'HEAD');
      return { stdout: `DONE: ${title} (${sha})\n`, stderr: '', exitCode: 0, timedOut: false };
    }
    if (kind === 'failed') return { stdout: `FAILED: ${title}: could not\n`, stderr: '', exitCode: 0, timedOut: false };
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

test('stops after three consecutive failures', async () => {
  await writeFile(join(repo, 'docs', 'backlog.md'), `${BACKLOG}- [ ] **Third.** Done when: done.\n- [ ] **Fourth.** Done when: done.\n`);
  await git(execSh, repo, 'commit', '-q', '-am', 'more');
  const r = await runLoop({ ...base(fakeDirector(['crash', 'failed', 'crash'])), max: null });
  expect(r).toEqual({ completed: 0, failed: 3, reason: '3 consecutive failures' });
});

test('refuses a dirty work tree', async () => {
  const r0 = await runLoop({ ...base(fakeDirector([])), max: 0 });
  expect(r0.reason).toBe('reached max 0');
  await writeFile(join(repo, '.worktrees', 'agent', 'junk.txt'), 'x');
  const r = await runLoop({ ...base(fakeDirector(['done'])), max: 1 });
  expect(r.reason).toMatch(/working tree is dirty/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/loop/run.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement run.ts**

```ts
// src/loop/run.ts
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

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runLoop(o: LoopOptions): Promise<LoopResult> {
  const sh = o.sh ?? execSh;
  const log = o.log ?? ((line: string) => console.log(`[agent-loop] ${line}`));
  const sleep = o.sleep ?? defaultSleep;
  const resolveEnv = o.resolveEnv ?? defaultResolveEnv;
  const install = o.install ?? defaultInstall;

  const workRoot = o.useWorktree ? await ensureWorktree(sh, o.repoRoot, join(o.repoRoot, '.worktrees', 'agent'), install) : o.repoRoot;
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
      log(`backlog empty, sleeping ${Math.round(o.pollMs / 1000)}s`);
      await sleep(o.pollMs);
      continue;
    }
    log(`claimed: ${item.title}`);

    const out = await runDirector(sh, workRoot, { env, timeoutMs: o.directorTimeoutMs, signal: o.signal });
    if (out.kind === 'done') {
      completed++;
      streak = 0;
      log(`DONE: ${out.title} (${out.sha})`);
      continue;
    }
    failed++;
    streak++;
    const marked = await markFailed(sh, workRoot, item.title, out.reason);
    log(`FAILED: ${item.title}: ${out.reason}${marked.stashed ? ' (dirty tree stashed)' : ''}`);
    if (streak >= o.maxConsecutiveFailures) return { completed, failed, reason: `${streak} consecutive failures` };
  }
  return { completed, failed, reason: 'stopped' };
}
```

Note on the abort test: `runDirector` receives `o.signal`; when the test aborts during `sleep`, the next `stopped()` check ends the loop before another claim. The "no credentials" return happens before any claim, so `resolveEnv: () => ({})` in the tests stands in for a configured key.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/loop/run.test.ts && npm run check:types`
Expected: PASS, 5 tests; types clean. If the "dirty tree" test fails because `max: 0` returns before creating the worktree, move the `reached max` check below `ensureBranch` (it already is) and confirm `ensureWorktree` ran; the test relies on the worktree existing after the first call.

- [ ] **Step 5: Rewrite the CLI**

Replace `scripts/agent-loop.mjs` with:

```js
// scripts/agent-loop.mjs
// Worker loop: claims the first open backlog item, runs the Director on it, marks it done or failed,
// and repeats. Runs forever unless --max is given.
// Usage: npm run agent [-- --max N] [--poll 5m] [--no-worktree]
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { runLoop } from '../src/loop/run.ts';
import { REPO_ROOT } from '../src/root.ts';

const envFile = join(REPO_ROOT, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const { values, positionals } = parseArgs({
  options: {
    max: { type: 'string' },
    poll: { type: 'string' },
    'no-worktree': { type: 'boolean', default: false },
  },
  allowPositionals: true,
});

// Legacy form: `npm run agent -- 3`
const maxRaw = values.max ?? positionals[0] ?? process.env.AGENT_MAX_ITEMS ?? null;
const max = maxRaw === null ? null : Number(maxRaw);
if (max !== null && (!Number.isInteger(max) || max < 0)) {
  console.error('usage: npm run agent [-- --max N] [--poll 5m] [--no-worktree]');
  process.exit(2);
}

function parseDuration(s) {
  const m = /^(\d+)(ms|s|m|h)?$/.exec(s);
  if (!m) throw new Error(`bad duration: ${s}`);
  return Number(m[1]) * ({ ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[m[2] ?? 'ms']);
}
const pollMs = values.poll ? parseDuration(values.poll) : Number(process.env.AGENT_POLL_MS ?? 5 * 60_000);
const useWorktree = !values['no-worktree'] && !process.env.CI;

const ac = new AbortController();
process.on('SIGINT', () => {
  console.error('[agent-loop] stopping after the current step');
  ac.abort();
});

const r = await runLoop({
  repoRoot: REPO_ROOT,
  useWorktree,
  max,
  pollMs,
  directorTimeoutMs: 45 * 60_000,
  maxConsecutiveFailures: 3,
  signal: ac.signal,
});
console.log(`[agent-loop] ${r.reason}; completed ${r.completed}, failed ${r.failed}`);
process.exit(r.reason.startsWith('reached max') || r.reason === 'stopped' ? 0 : 1);
```

- [ ] **Step 6: Update the workflow**

In `.github/workflows/agent.yml` change the run line to `- run: npm run agent -- --max "${MAX:-1}"`. Leave the rest.

- [ ] **Step 7: Smoke the CLI without credentials**

Run: `node scripts/agent-loop.mjs --max 0 --no-worktree`
Expected: prints `work root ...` then `reached max 0; completed 0, failed 0` and exits 0. Then `git status --porcelain` must be empty (no claim happened).

- [ ] **Step 8: Commit**

```bash
git add src/loop/run.ts src/loop/run.test.ts scripts/agent-loop.mjs .github/workflows/agent.yml
git commit -m "feat(loop): long-running worker loop with worktree, claim commits, failure skipping"
```

### Task 7: Planner edit operations (pure)

**Files:**
- Create: `src/tools/backlog-edit.ts`
- Create: `src/tools/backlog-edit.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  ```ts
  export type Op =
    | { op: 'insert'; title: string; text: string; section: string; after?: string }
    | { op: 'replace'; title: string; text: string }
    | { op: 'remove'; title: string }
    | { op: 'reopen'; title: string };
  export type ApplyResult = { ok: true; md: string } | { ok: false; errors: string[] };
  export function applyOps(md: string, ops: Op[], protectedTitles: Iterable<string>): ApplyResult;
  ```
- `text` is the body after the title, without the marker or the bold title. The function composes `- [ ] **${title}** ${text}`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/tools/backlog-edit.test.ts
import { describe, expect, test } from 'vitest';
import { applyOps } from './backlog-edit.ts';

const md = `# Backlog

Intro.

## Phase A

- [x] **Old.** Finished.
- [ ] **One.** First open. Done when: one.
- [~] **Busy.** Claimed by the worker. Done when: busy.

## Maintenance

- [!] **Broken.** Failed once. Done when: fixed.
  - failed 2026-09-01: reviewer never passed
- [ ] **Two.** Second open. Done when: two.
`;

const ok = (r: ReturnType<typeof applyOps>) => {
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.md;
};

describe('insert', () => {
  test('at the end of a section', () => {
    const out = ok(applyOps(md, [{ op: 'insert', title: 'Three.', text: 'Third. Done when: three.', section: 'Maintenance' }], []));
    expect(out.split('\n').slice(-3)).toEqual(['- [ ] **Two.** Second open. Done when: two.', '- [ ] **Three.** Third. Done when: three.', '']);
  });

  test('after a named item, even a protected one', () => {
    const out = ok(applyOps(md, [{ op: 'insert', title: 'One-b.', text: 'Between. Done when: b.', section: 'Phase A', after: 'Busy.' }], ['Busy.']));
    const lines = out.split('\n');
    expect(lines[8]).toBe('- [~] **Busy.** Claimed by the worker. Done when: busy.');
    expect(lines[9]).toBe('- [ ] **One-b.** Between. Done when: b.');
    expect(lines[10]).toBe('');
  });

  test('refuses an unknown section, a missing Done when, and a duplicate title', () => {
    expect(applyOps(md, [{ op: 'insert', title: 'X.', text: 'x. Done when: x.', section: 'Nope' }], [])).toEqual({ ok: false, errors: ['insert "X.": no section "Nope"'] });
    expect(applyOps(md, [{ op: 'insert', title: 'X.', text: 'no criteria', section: 'Phase A' }], [])).toEqual({ ok: false, errors: ['insert "X.": text must contain a "Done when:" sentence'] });
    expect(applyOps(md, [{ op: 'insert', title: 'One.', text: 'dup. Done when: d.', section: 'Phase A' }], [])).toEqual({ ok: false, errors: ['insert "One.": an item with that title already exists'] });
  });
});

describe('replace / remove / reopen', () => {
  test('replace keeps the marker and rewrites the body', () => {
    const out = ok(applyOps(md, [{ op: 'replace', title: 'One.', text: 'Rewritten. Done when: new.' }], []));
    expect(out).toContain('- [ ] **One.** Rewritten. Done when: new.\n');
  });

  test('remove drops the line and its reason bullets', () => {
    const out = ok(applyOps(md, [{ op: 'remove', title: 'Broken.' }], []));
    expect(out).not.toContain('Broken.');
    expect(out).not.toContain('failed 2026-09-01');
  });

  test('reopen turns a failed item back into an open one', () => {
    const out = ok(applyOps(md, [{ op: 'reopen', title: 'Broken.' }], []));
    expect(out).toContain('- [ ] **Broken.** Failed once. Done when: fixed.\n- [ ] **Two.**');
  });

  test('refuses to touch claimed, done, or protected items, or unknown titles', () => {
    expect(applyOps(md, [{ op: 'replace', title: 'Busy.', text: 'x. Done when: x.' }], [])).toEqual({ ok: false, errors: ['replace "Busy.": item is claimed by the worker; leave it alone'] });
    expect(applyOps(md, [{ op: 'remove', title: 'Old.' }], [])).toEqual({ ok: false, errors: ['remove "Old.": item is done; done items are history'] });
    expect(applyOps(md, [{ op: 'remove', title: 'One.' }], ['One.'])).toEqual({ ok: false, errors: ['remove "One.": item is claimed by the worker; leave it alone'] });
    expect(applyOps(md, [{ op: 'reopen', title: 'One.' }], [])).toEqual({ ok: false, errors: ['reopen "One.": item is not failed'] });
    expect(applyOps(md, [{ op: 'remove', title: 'Ghost.' }], [])).toEqual({ ok: false, errors: ['remove "Ghost.": no such item'] });
  });

  test('a reorder is remove + insert, applied in order, and nothing is written on any error', () => {
    const out = ok(applyOps(md, [
      { op: 'remove', title: 'Two.' },
      { op: 'insert', title: 'Two.', text: 'Second open. Done when: two.', section: 'Phase A', after: 'Old.' },
    ], []));
    const lines = out.split('\n');
    expect(lines[6]).toBe('- [x] **Old.** Finished.');
    expect(lines[7]).toBe('- [ ] **Two.** Second open. Done when: two.');
    const bad = applyOps(md, [{ op: 'remove', title: 'Two.' }, { op: 'remove', title: 'Busy.' }], []);
    expect(bad.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/tools/backlog-edit.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/tools/backlog-edit.ts
import { duplicateTitles, findItem, hasDoneWhen, parseItems, setState, type BacklogItem } from './backlog-file.ts';

export type Op =
  | { op: 'insert'; title: string; text: string; section: string; after?: string }
  | { op: 'replace'; title: string; text: string }
  | { op: 'remove'; title: string }
  | { op: 'reopen'; title: string };

export type ApplyResult = { ok: true; md: string } | { ok: false; errors: string[] };

const REASON = /^  - failed \d{4}-\d{2}-\d{2}: /;

function itemLine(title: string, text: string, marker = ' '): string {
  return `- [${marker}] **${title}** ${text.trim()}`;
}

/** Index of the last line belonging to `item` (its own line plus any reason bullets). */
function itemEnd(lines: string[], item: BacklogItem): number {
  let end = item.line - 1;
  while (end + 1 < lines.length && REASON.test(lines[end + 1])) end++;
  return end;
}

/** Index of the last non-blank line of the section, or the heading line when the section is empty. */
function sectionEnd(lines: string[], section: string): number | null {
  const start = lines.findIndex((l) => /^##\s+(.*)$/.exec(l)?.[1].trim() === section);
  if (start < 0) return null;
  let end = start;
  for (let i = start + 1; i < lines.length && !/^##\s/.test(lines[i]); i++) if (lines[i].trim() !== '') end = i;
  return end;
}

/** Why `op` may not touch `item`, or null when it may. */
function guard(op: Op, item: BacklogItem | null, protectedTitles: Set<string>): string | null {
  if (!item) return `${op.op} "${op.title}": no such item`;
  if (item.state === 'claimed' || protectedTitles.has(item.title)) return `${op.op} "${op.title}": item is claimed by the worker; leave it alone`;
  if (item.state === 'done') return `${op.op} "${op.title}": item is done; done items are history`;
  return null;
}

/**
 * Apply Planner edits to the backlog markdown. All-or-nothing: the first failing op aborts and
 * the original text is not returned. `protectedTitles` are titles claimed on agent/backlog that
 * main may not know about yet.
 */
export function applyOps(md: string, ops: Op[], protectedTitles: Iterable<string>): ApplyResult {
  const protectedSet = new Set(protectedTitles);
  let text = md;
  for (const op of ops) {
    const lines = text.split('\n');
    if (op.op === 'insert') {
      if (findItem(text, op.title) && findItem(text, op.title)!.state !== 'done') return { ok: false, errors: [`insert "${op.title}": an item with that title already exists`] };
      if (!hasDoneWhen(op.text)) return { ok: false, errors: [`insert "${op.title}": text must contain a "Done when:" sentence`] };
      let at: number;
      if (op.after !== undefined) {
        const anchor = findItem(text, op.after);
        if (!anchor) return { ok: false, errors: [`insert "${op.title}": no item "${op.after}" to insert after`] };
        if (anchor.section !== op.section) return { ok: false, errors: [`insert "${op.title}": "${op.after}" is in section "${anchor.section}", not "${op.section}"`] };
        at = itemEnd(lines, anchor) + 1;
      } else {
        const end = sectionEnd(lines, op.section);
        if (end === null) return { ok: false, errors: [`insert "${op.title}": no section "${op.section}"`] };
        at = end + 1;
      }
      lines.splice(at, 0, itemLine(op.title, op.text));
      text = lines.join('\n');
      continue;
    }
    const item = findItem(text, op.title);
    const why = guard(op, item, protectedSet);
    if (why) return { ok: false, errors: [why] };
    const it = item!;
    if (op.op === 'replace') {
      if (!hasDoneWhen(op.text)) return { ok: false, errors: [`replace "${op.title}": text must contain a "Done when:" sentence`] };
      const marker = /^- \[(.)\]/.exec(lines[it.line - 1])![1];
      lines[it.line - 1] = itemLine(op.title, op.text, marker);
      text = lines.join('\n');
    } else if (op.op === 'remove') {
      lines.splice(it.line - 1, itemEnd(lines, it) - (it.line - 1) + 1);
      text = lines.join('\n');
    } else if (op.op === 'reopen') {
      if (it.state !== 'failed') return { ok: false, errors: [`reopen "${op.title}": item is not failed`] };
      text = setState(text, op.title, 'open');
    }
  }
  const dups = duplicateTitles(text);
  if (dups.length) return { ok: false, errors: dups.map((t) => `duplicate title "${t}" among open items`) };
  void parseItems; // keep the import list honest if you drop the dup check later
  return { ok: true, md: text };
}
```

Remove the `void parseItems;` line and the `parseItems` import if the type checker does not complain about the unused import (it does not by default; delete both for cleanliness).

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/tools/backlog-edit.test.ts && npm run check:types`
Expected: PASS, 8 tests; types clean.

- [ ] **Step 5: Commit**

```bash
git add src/tools/backlog-edit.ts src/tools/backlog-edit.test.ts
git commit -m "feat(backlog): planner edit operations with claim and title guards"
```

### Task 8: Planner tools `read_backlog_doc` and `write_backlog`

**Files:**
- Create: `src/tools/backlog-planner.ts`
- Create: `src/tools/backlog-planner.test.ts`

**Interfaces:**
- Consumes: `applyOps`, `Op` from Task 7; `parseItems` from Task 1; `AGENT_BRANCH` from `src/loop/worker.ts`.
- Produces:
  ```ts
  // pure core, tested directly:
  export interface PlannerFs { readFile(p: string): Promise<string>; writeFile(p: string, s: string): Promise<void>; exec(cmd: string): Promise<{ stdout: string; stderr: string; exitCode: number }>; }
  export async function claimedOnAgentBranch(fs: PlannerFs): Promise<string[]>;
  export async function readBacklogDoc(fs: PlannerFs, path: string): Promise<{ markdown: string; items: { title: string; state: ItemState; section: string }[]; claimed: string[] }>;
  export async function writeBacklog(fs: PlannerFs, path: string, ops: Op[], summary: string): Promise<{ ok: true; sha: string; titles: string[] } | { ok: false; error: string; errors?: string[] }>;
  // Flue tools:
  export const readBacklogDocTool; // name 'read_backlog_doc'
  export const writeBacklogTool;   // name 'write_backlog'
  ```
- All `exec` commands run with cwd `REPO_ROOT` (the tool passes `{ cwd: REPO_ROOT }` to `harness.sandbox.exec`).

- [ ] **Step 1: Write the failing tests**

```ts
// src/tools/backlog-planner.test.ts
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/tools/backlog-planner.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/tools/backlog-planner.ts
import { defineTool } from '@flue/runtime';
import type { JsonValue } from '@flue/runtime';
import { join } from 'node:path';
import * as v from 'valibot';
import { AGENT_BRANCH } from '../loop/worker.ts';
import { REPO_ROOT } from '../root.ts';
import { applyOps, type Op } from './backlog-edit.ts';
import { parseItems, type ItemState } from './backlog-file.ts';
import { shellQuote } from './tree-hash.ts';

export const PLANNER_BACKLOG_PATH = join(REPO_ROOT, 'docs', 'backlog.md');

export interface PlannerFs {
  readFile(p: string): Promise<string>;
  writeFile(p: string, s: string): Promise<void>;
  /** Runs a shell command in the repository root. */
  exec(cmd: string): Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

/** Titles marked `[~]` in agent/backlog's copy of the backlog. Empty when the branch does not exist. */
export async function claimedOnAgentBranch(fs: PlannerFs): Promise<string[]> {
  const r = await fs.exec(`git show ${AGENT_BRANCH}:docs/backlog.md`);
  if (r.exitCode !== 0) return [];
  return parseItems(r.stdout).filter((it) => it.state === 'claimed').map((it) => it.title);
}

export async function readBacklogDoc(fs: PlannerFs, path: string): Promise<{ markdown: string; items: { title: string; state: ItemState; section: string }[]; claimed: string[] }> {
  const markdown = await fs.readFile(path);
  return {
    markdown,
    items: parseItems(markdown).map(({ title, state, section }) => ({ title, state, section })),
    claimed: await claimedOnAgentBranch(fs),
  };
}

export async function writeBacklog(
  fs: PlannerFs,
  path: string,
  ops: Op[],
  summary: string,
): Promise<{ ok: true; sha: string; titles: string[] } | { ok: false; error: string; errors?: string[] }> {
  const branch = (await fs.exec('git branch --show-current')).stdout.trim();
  if (branch !== 'main') return { ok: false, error: `not on main (on ${branch}); the planner commits only on main` };
  const dirty = (await fs.exec('git status --porcelain -- docs/backlog.md')).stdout.trim();
  if (dirty !== '') return { ok: false, error: 'docs/backlog.md has uncommitted changes; commit or discard them first' };

  const md = await fs.readFile(path);
  const result = applyOps(md, ops, await claimedOnAgentBranch(fs));
  if (!result.ok) return { ok: false, error: 'edits rejected', errors: result.errors };

  await fs.writeFile(path, result.md);
  const add = await fs.exec('git add docs/backlog.md');
  if (add.exitCode !== 0) return { ok: false, error: `git add failed: ${add.stderr}` };
  const commit = await fs.exec(`git commit -q -m ${shellQuote(`docs(backlog): ${summary}`)} -- docs/backlog.md`);
  if (commit.exitCode !== 0) return { ok: false, error: `git commit failed: ${commit.stderr || commit.stdout}` };
  const sha = (await fs.exec('git rev-parse --short HEAD')).stdout.trim();
  return { ok: true, sha, titles: ops.map((o) => o.title) };
}

const opSchema = v.variant('op', [
  v.object({ op: v.literal('insert'), title: v.pipe(v.string(), v.minLength(1)), text: v.pipe(v.string(), v.minLength(1)), section: v.pipe(v.string(), v.minLength(1)), after: v.optional(v.string()) }),
  v.object({ op: v.literal('replace'), title: v.pipe(v.string(), v.minLength(1)), text: v.pipe(v.string(), v.minLength(1)) }),
  v.object({ op: v.literal('remove'), title: v.pipe(v.string(), v.minLength(1)) }),
  v.object({ op: v.literal('reopen'), title: v.pipe(v.string(), v.minLength(1)) }),
]);

function harnessFs(harness: { sandbox: { readFile(p: string): Promise<string>; writeFile(p: string, s: string): Promise<void>; exec(cmd: string, o: { cwd: string; timeoutMs: number }): Promise<{ stdout: string; stderr: string; exitCode: number }> } }): PlannerFs {
  return {
    readFile: (p) => harness.sandbox.readFile(p),
    writeFile: (p, s) => harness.sandbox.writeFile(p, s),
    exec: (cmd) => harness.sandbox.exec(cmd, { cwd: REPO_ROOT, timeoutMs: 60_000 }),
  };
}

export const readBacklogDocTool = defineTool({
  name: 'read_backlog_doc',
  description: 'Return docs/backlog.md in full plus a parsed list of items (title, state: open|claimed|done|failed, section) and the titles currently claimed by the worker on agent/backlog. Never edit claimed or done items.',
  harness: true,
  async run({ harness }): Promise<{ output: JsonValue }> {
    return { output: await readBacklogDoc(harnessFs(harness), PLANNER_BACKLOG_PATH) };
  },
});

export const writeBacklogTool = defineTool({
  name: 'write_backlog',
  description:
    'Apply a list of edits to docs/backlog.md and commit them on main as "docs(backlog): <summary>". Ops: insert {title, text, section, after?}, replace {title, text}, remove {title}, reopen {title}. text is the item body without the bold title and must contain a "Done when:" sentence. All-or-nothing: any rule violation (claimed or done item touched, duplicate title, unknown section, missing Done when) rejects the whole call and writes nothing. Refuses when not on main or when docs/backlog.md has uncommitted changes.',
  input: v.object({ ops: v.pipe(v.array(opSchema), v.minLength(1)), summary: v.pipe(v.string(), v.minLength(3), v.maxLength(72)) }),
  harness: true,
  async run({ data, harness }): Promise<{ output: JsonValue }> {
    return { output: await writeBacklog(harnessFs(harness), PLANNER_BACKLOG_PATH, data.ops, data.summary) };
  },
});
```

If `v.variant` is not available under that name in the installed valibot, use `v.union([...])` of the same four objects; the test does not exercise the schema.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/tools/backlog-planner.test.ts && npm run check:types`
Expected: PASS, 4 tests; types clean. If the `harnessFs` parameter type fights the real `harness` type, replace the inline type with `Parameters<Parameters<typeof defineTool>[0]['run']>[0]['harness']` or simply `any` with an eslint-free comment; do not spend more than a few minutes on it.

- [ ] **Step 5: Commit**

```bash
git add src/tools/backlog-planner.ts src/tools/backlog-planner.test.ts
git commit -m "feat(planner): read_backlog_doc and write_backlog tools with main-only commits"
```

### Task 9: Planner agent, skill, and `npm run plan`

**Files:**
- Create: `src/skills/backlog-authoring/SKILL.md`
- Create: `src/agents/planner.ts`
- Create: `scripts/plan.mjs`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: `readBacklogDocTool`, `writeBacklogTool` from Task 8; `resolveAnthropicEnv`, `piBearerToken`; existing skills.

- [ ] **Step 1: Write the skill**

```markdown
---
name: backlog-authoring
description: How to write, size, and place items in docs/backlog.md so the worker loop can complete them unattended. Use whenever you add or edit backlog items.
---
# Backlog authoring

`docs/backlog.md` is a queue shared by humans, the Planner, and the worker loop. One item = one unattended Director run (an Implementer session plus a Reviewer session, at most three review rounds). Write items the Implementer can finish and the Reviewer can judge without asking anyone.

## Item format

One line per item, under a `## Section` heading:

    - [ ] **<title>.** <what to build, where, and how>. <constraints>. Done when: <an executable check>.

- Title: short, unique among non-done items, ends with a period, names the area (`export-rive: state machine.`, `motion/clips: blink-v2.`).
- Body: name the files and functions to touch, the pattern to mirror (`mirror packages/export-svg`), and anything the Implementer would otherwise have to guess.
- `Done when:` is mandatory and must be checkable by running something: a command and its expected output, a parity target passing in `npm run verify`, a test file that must exist and pass. "Works well" is not a check.

## Sizing

- If you cannot name the files to change, the item is not ready; investigate first.
- One item touches one area (one clip, one exporter feature, one tool). Split anything with an "and" that crosses areas.
- Put prerequisites first; the loop takes items top to bottom within the whole file.

## States (read-only for you unless stated)

- `[ ]` open: yours to add, edit, reorder, remove.
- `[~]` claimed: the worker is on it now. Never edit, move, or remove. `read_backlog_doc` lists these under `claimed`.
- `[x]` done: history. Never edit.
- `[!]` failed: the reason is in the bullet under it. Fix the item text with `replace`, then `reopen` it.

## Process

1. Ask what the user wants and why, until you can write the `Done when` sentence.
2. Read the code the item touches (`read_backlog_doc`, `grep`, `read`); check AGENTS.md rules.
3. Propose the items as text in your reply and wait for an explicit "yes".
4. Only then call `write_backlog` once with all ops and a summary under 72 characters.
5. Reply with one line per title and the commit sha.
```

- [ ] **Step 2: Write the agent**

```ts
// src/agents/planner.ts
'use agent';
import { useModel, useSandbox, useSkill, useTool } from '@flue/runtime';
import { local } from '@flue/runtime/node';
import { REPO_ROOT } from '../root.ts';
import backlogAuthoring from '../skills/backlog-authoring/SKILL.md';
import clipDsl from '../skills/clip-dsl/SKILL.md';
import exporterPackage from '../skills/exporter-package/SKILL.md';
import pubnyanMotion from '../skills/pubnyan-motion/SKILL.md';
import rigReference from '../skills/rig-reference/SKILL.md';
import { readBacklogDocTool, writeBacklogTool } from '../tools/backlog-planner.ts';

export function Planner() {
  useModel('anthropic/claude-opus-5');
  useSandbox(local(), { cwd: REPO_ROOT });
  useSkill(backlogAuthoring);
  useSkill(rigReference);
  useSkill(clipDsl);
  useSkill(pubnyanMotion);
  useSkill(exporterPackage);
  useTool(readBacklogDocTool);
  useTool(writeBacklogTool);
  return `You are the Planner of pubnyan-live. You turn a person's goal into backlog items that the unattended worker loop can complete, and you commit them to docs/backlog.md on main. You never implement anything yourself and never edit files other than through write_backlog.

Follow the backlog-authoring skill. In particular: interview until every item has a checkable "Done when:" sentence; read the code an item touches before writing it; propose the items as plain text and wait for the person to confirm; call write_backlog exactly once per confirmation; never touch items that are claimed ([~]) or done ([x]).

Keep replies short. When you propose items, show them exactly as they will appear in the file.`;
}
```

- [ ] **Step 3: Write the CLI**

```js
// scripts/plan.mjs
// Talk to the Planner. Usage: npm run plan -- <topic> "<message>"
// The topic names the conversation; reuse it to continue.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../src/root.ts';
import { piBearerToken, resolveAnthropicEnv } from '../src/tools/anthropic-auth.ts';

const envFile = join(REPO_ROOT, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const [topic, ...rest] = process.argv.slice(2);
const message = rest.join(' ').trim();
if (!topic || !message) {
  console.error('usage: npm run plan -- <topic> "<message>"');
  process.exit(2);
}
const auth = resolveAnthropicEnv(process.env, piBearerToken);
if (auth.source === 'none') {
  console.error('[plan] no Anthropic credentials: set ANTHROPIC_API_KEY in .env or log in with `pi`');
  process.exit(2);
}
const r = spawnSync('npx', ['flue', 'run', 'src/agents/planner.ts', '--id', `plan-${topic}`, '-m', message], {
  cwd: REPO_ROOT,
  stdio: 'inherit',
  env: { ...process.env, ...auth.env },
});
process.exit(r.status ?? 1);
```

- [ ] **Step 4: Register the script**

In `package.json` scripts add `"plan": "node scripts/plan.mjs"` after `"agent"`.

- [ ] **Step 5: Verify the module loads**

Run: `npm run check:types && npm test`
Expected: green.

Run: `ANTHROPIC_API_KEY= npx flue run src/agents/planner.ts -m hi --id plan-smoke 2>&1 | tail -3`
Expected: the run reaches the provider and fails with "Provider is not configured: anthropic" (or the equivalent credential error), which proves the module, skill import, and tools load. Any other error (module not found, skill name mismatch) must be fixed before continuing.

- [ ] **Step 6: Commit**

```bash
git add src/skills/backlog-authoring/SKILL.md src/agents/planner.ts scripts/plan.mjs package.json
git commit -m "feat(planner): Planner agent, backlog-authoring skill, npm run plan"
```

### Task 10: Documentation, backlog header, and end-to-end check

**Files:**
- Modify: `docs/backlog.md` (header only)
- Modify: `AGENTS.md` (Rules, Commands, The agent loop)

- [ ] **Step 1: Backlog header**

Replace the first paragraph of `docs/backlog.md` (the line starting `Work queue shared by humans and agents.`) with:

```markdown
Work queue shared by humans, the Planner agent, and the worker loop. Items are taken top to bottom. States: `[ ]` open, `[~]` claimed by the running worker (do not edit), `[x]` done (in the commit that completed it), `[!]` failed (reason in the bullet below it; fix the text and reopen). Every item ends with a `Done when:` sentence naming an executable check; the Reviewer verifies it, and every item still ends with `npm run verify` green and a look at the contact sheet.
```

- [ ] **Step 2: AGENTS.md**

In `## Rules` replace the line `- Pick work from docs/backlog.md top to bottom. Mark an item [x] in the same commit that completes it.` with:

```markdown
- `docs/backlog.md` states: `[ ]` open, `[~]` claimed, `[x]` done, `[!]` failed. The worker loop claims (`[~]`) before starting and the Director marks `[x]` in the commit that completes the item. Nobody but the loop edits a `[~]` item. The Planner edits open items only through `write_backlog`, on `main`.
```

In `## Commands` add:

```markdown
- `npm run agent` — worker loop, forever, in `.worktrees/agent` on `agent/backlog`; `npm run agent -- --max 1` for one item; `--no-worktree` to run in this checkout (CI).
- `npm run plan -- <topic> "<message>"` — talk to the Planner; reuse the topic to continue the conversation.
```

Replace the `## The agent loop` section body with:

```markdown
- Humans and the Planner work in this checkout on `main`. The worker loop (`npm run agent`) works in `.worktrees/agent` on `agent/backlog`, merges `main` before every item, and needs credentials: `ANTHROPIC_API_KEY` in `.env` or a pi login (`pi` then `/login`), from which it mints a Claude subscription OAuth token via `pi auth print-bearer-token`.
- Per item the loop: merges `main`, unclaims stale `[~]` items, claims the first `[ ]` (commit `chore(backlog): claim ...`), runs the Director (Implementer, Reviewer, `git_commit`, `mark_done`), and on `FAILED:`, a crash, or a timeout stashes the tree as `failed: <title>`, marks the item `[!]` with the reason, and moves on. Three consecutive failures stop the loop. An empty backlog is polled every 5 minutes (`--poll`, `AGENT_POLL_MS`).
- A merge conflict with `main` stops the loop with the paths printed; resolve it in `.worktrees/agent` and start the loop again. The loop refuses to start on a dirty work tree.
- Commits happen only through the `git_commit` tool (Director), the loop's claim/fail/unclaim commits, and the Planner's `write_backlog` (docs/backlog.md on `main` only).
- Merge `agent/backlog` into `main` after looking at the contact sheets. The GitHub workflow `agent` runs `npm run agent -- --max 1` in its own checkout and opens a PR.
```

- [ ] **Step 3: One-time branch setup**

Run in the main checkout (currently on `agent/backlog` with `main` strictly behind):

```bash
git branch -f main agent/backlog && git checkout main
```

Expected: `git branch --show-current` prints `main`; `git log --oneline -1 main` equals the last commit of this plan so far.

- [ ] **Step 4: End-to-end with a dummy item, no credentials needed for the negative path**

Run: `npm run agent -- --max 0`
Expected: creates `.worktrees/agent` (this runs `npm ci` there once, several minutes), prints `work root .../.worktrees/agent`, `reached max 0`. `git -C .worktrees/agent branch --show-current` prints `agent/backlog`.

If credentials are available, add a dummy item on `main` and run one item:

```bash
cat >> docs/backlog.md <<'EOF'
- [ ] **Smoke: loop plumbing.** Add the line `loop smoke 2026-09-06` to the end of `docs/backlog-smoke.txt` (create it). Done when: `tail -1 docs/backlog-smoke.txt` prints `loop smoke 2026-09-06` and `npm run check` is green.
EOF
git commit -am "docs(backlog): smoke item"
npm run agent -- --max 1
git -C .worktrees/agent log --oneline -3
```

Expected: the last three commits on `agent/backlog` are the item commit, `chore(backlog): claim Smoke: loop plumbing.`, and the merge or the smoke docs commit; the item is `[x]` in `.worktrees/agent/docs/backlog.md`. Then remove the smoke file and item in a follow-up commit on `agent/backlog` (or leave them for the human merge). Without credentials, skip this and say so in the report.

- [ ] **Step 5: Full check and commit**

Run: `npm run check`
Expected: green (types, tests, parity).

```bash
git add docs/backlog.md AGENTS.md
git commit -m "docs: backlog states and actor rules for the async loop"
```

---

## Self-review notes

- Spec §1 (worktree, merge, PUBNYAN_ROOT): Tasks 2, 4, 6. Submodule init and lock-hash reinstall: Task 4. Conflict stops the loop: Task 4 throws, Task 6 lets it propagate (the CLI exits 1 with the message).
- Spec §2 (states, reason bullet, title identity, Done when, worker and planner rules): Tasks 1, 5, 7, 8.
- Spec §3 (loop steps, CLI flags, safety, Director and Reviewer prompt changes): Tasks 2, 5, 6.
- Spec §4 (Planner, tools, skill, `npm run plan`): Tasks 8, 9.
- Spec §5 (docs, agent.yml, .gitignore): Tasks 4, 6, 10.
- Spec §6 (tests): every task has its tests; manual acceptance in Task 10.
- Names used across tasks: `Sh`, `execSh`, `git` (Task 3) → Tasks 4–8; `setState`, `firstItem`, `parseItems`, `findItem`, `hasDoneWhen`, `duplicateTitles` (Task 1) → Tasks 2, 4, 5, 7, 8; `applyOps`, `Op` (Task 7) → Task 8; `AGENT_BRANCH` (Task 4) → Task 8; `runLoop` (Task 6) → CLI.
