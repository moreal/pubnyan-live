# pubnyan-live Agent Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `docs/backlog.md` executable without a human in the loop: a Flue Director agent takes the first open item, delegates it to an Implementer subagent, has a Reviewer subagent check it, commits on an `agent/backlog` branch, and marks the item done; `npm run agent` repeats that until the backlog is empty.

**Architecture:** Three `'use agent'` modules under `src/agents/`, four harness tools under `src/tools/` (backlog read/mark, the check suite, git commit), three skills under `src/skills/`, and a loop script. The tools enforce the safety rules (no commit without a green check suite; commits only on `agent/backlog`) so the prompts do not have to be trusted for them. Pure backlog-file logic is unit-tested; agent modules are type-checked and load-tested with `flue run`.

**Tech Stack:** `@flue/runtime` 2.0.3 and `@flue/cli` 2.0.3 (already installed), `valibot` 1.4 for tool schemas, Node 26, vitest.

**Spec:** `docs/superpowers/specs/2026-09-05-pubnyan-live-design.md`, section "Agentic workflow (Flue)".

## Global Constraints

- Everything in the foundation plan's Global Constraints still applies: Node >=26, `.ts` extensions on local imports, `#` aliases, erasable TypeScript, conventional commits, never commit `dist/verify/`, `.env`, or `data/`.
- Flue facts verified by a live run: `flue run <module> -m <text> --id <id>` loads the module through Flue's own loader, so `import skill from '../skills/<name>/SKILL.md'` works and the frontmatter `name` MUST equal the directory name; local `.ts` imports with extensions work; `.env` at the project root is loaded automatically; the db is `src/db.ts` (SQLite at `data/flue.db`, gitignored); the model provider reads `ANTHROPIC_API_KEY` and fails with "Provider is not configured: anthropic" when it is empty.
- Harness tools: `defineTool({ name, description, input: v.object(...), harness: true, async run({ data, harness }) { ... } })`; `harness.sandbox.exec(cmd, { cwd, timeoutMs })` returns `{ stdout, stderr, exitCode }`; `harness.sandbox.readFile/writeFile(path)` take absolute paths. Agents that use harness tools must declare `useSandbox(local(), { cwd })`.
- The local sandbox passes only `PATH`, `HOME`, `USER`, `LANG`, `TERM`, `TMPDIR` and similar to the model's shell; that is enough for `npm`, `git`, and puppeteer's Chrome.
- Model ids: Director `anthropic/claude-opus-5`; Implementer and Reviewer `anthropic/claude-sonnet-5`.
- Agents commit only on branch `agent/backlog`; humans merge it into `main`.
- `REPO_ROOT` is resolved from `src/root.ts` (`new URL('../', import.meta.url).pathname`), never from `process.cwd()`.

## File structure

```
src/root.ts                         REPO_ROOT
src/tools/backlog-file.ts           pure: firstOpenItem, countItems, markDone (+ test)
src/tools/backlog.ts                read_backlog, mark_done
src/tools/checks.ts                 run_checks  (npm run check)
src/tools/git.ts                    git_commit  (gate: check suite green; branch agent/backlog)
src/skills/rig-reference/SKILL.md
src/skills/clip-dsl/SKILL.md
src/skills/pubnyan-motion/SKILL.md
src/agents/director.ts              Director (+ useSubagent Implementer, Reviewer)
src/agents/implementer.ts           Implementer
src/agents/reviewer.ts              Reviewer
scripts/agent-loop.mjs              npm run agent [max]
.github/workflows/agent.yml         manual/scheduled run that opens a PR
package.json                        scripts: check, agent
vitest.config.ts                    include src/**/*.test.ts
AGENTS.md, README.md, docs/backlog.md
```

---

### Task 1: Backlog file helpers and the `check` script

**Files:**
- Create: `src/root.ts`, `src/tools/backlog-file.ts`
- Test: `src/tools/backlog-file.test.ts`
- Modify: `package.json` (scripts), `vitest.config.ts` (include)

**Interfaces:**
- Produces: `REPO_ROOT: string`; `BacklogItem { line: number; title: string; text: string; section: string }`; `firstOpenItem(markdown): BacklogItem | null`; `countItems(markdown): { open: number; done: number }`; `markDone(markdown, line): string`; npm script `check` = `npm run check:types && npm test && npm run verify`.

- [ ] **Step 1: Write the failing test**

```ts
// src/tools/backlog-file.test.ts
import { describe, expect, test } from 'vitest';
import { countItems, firstOpenItem, markDone } from './backlog-file.ts';

const md = `# Backlog

Intro text.

## Phase 4: Lottie

- [x] **Done thing.** Already finished.
- [ ] **export-lottie: static frame.** Build the first exporter. Parity on \`spinner\` passes.
- [ ] **Second item.** Later.

## Maintenance

- [ ] **Tidy.** Something small.
`;

describe('backlog-file', () => {
  test('firstOpenItem returns the first unchecked item with its section, title, and 1-based line', () => {
    expect(firstOpenItem(md)).toEqual({
      line: 8,
      title: 'export-lottie: static frame.',
      text: '**export-lottie: static frame.** Build the first exporter. Parity on `spinner` passes.',
      section: 'Phase 4: Lottie',
    });
  });

  test('firstOpenItem returns null when nothing is open', () => {
    expect(firstOpenItem('- [x] **All.** done')).toBeNull();
  });

  test('countItems counts open and done', () => {
    expect(countItems(md)).toEqual({ open: 3, done: 1 });
  });

  test('markDone flips exactly that line and refuses other lines', () => {
    const next = markDone(md, 8);
    expect(next.split('\n')[7]).toBe('- [x] **export-lottie: static frame.** Build the first exporter. Parity on `spinner` passes.');
    expect(countItems(next)).toEqual({ open: 2, done: 2 });
    expect(() => markDone(md, 7)).toThrow(/not an open backlog item/);
    expect(() => markDone(md, 99)).toThrow(/not an open backlog item/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/tools`
Expected: no test files matched (vitest include does not cover `src/`) or an unresolved import. Both count as red.

- [ ] **Step 3: Write root.ts, backlog-file.ts, and the config changes**

```ts
// src/root.ts
/** Absolute repository root, independent of the process working directory. */
export const REPO_ROOT = new URL('../', import.meta.url).pathname;
```

```ts
// src/tools/backlog-file.ts
export interface BacklogItem {
  /** 1-based line number in docs/backlog.md */
  line: number;
  /** The bold title without the asterisks, e.g. "export-lottie: static frame." */
  title: string;
  /** The whole item text after the checkbox */
  text: string;
  /** Nearest preceding "## " heading */
  section: string;
}

const OPEN = /^- \[ \] /;
const DONE = /^- \[x\] /i;

export function firstOpenItem(markdown: string): BacklogItem | null {
  const lines = markdown.split('\n');
  let section = '';
  for (let i = 0; i < lines.length; i++) {
    const heading = /^##\s+(.*)$/.exec(lines[i]);
    if (heading) {
      section = heading[1].trim();
      continue;
    }
    if (OPEN.test(lines[i])) {
      const text = lines[i].replace(OPEN, '').trim();
      const title = /^\*\*(.+?)\*\*/.exec(text)?.[1] ?? text.slice(0, 60);
      return { line: i + 1, title, text, section };
    }
  }
  return null;
}

export function countItems(markdown: string): { open: number; done: number } {
  const lines = markdown.split('\n');
  return { open: lines.filter((l) => OPEN.test(l)).length, done: lines.filter((l) => DONE.test(l)).length };
}

/** Returns the markdown with the open item at `line` (1-based) checked. */
export function markDone(markdown: string, line: number): string {
  const lines = markdown.split('\n');
  const target = lines[line - 1];
  if (target === undefined || !OPEN.test(target)) throw new Error(`line ${line} is not an open backlog item`);
  lines[line - 1] = target.replace(OPEN, '- [x] ');
  return lines.join('\n');
}
```

`package.json` scripts: add `"check": "npm run check:types && npm test && npm run verify"` and `"agent": "node scripts/agent-loop.mjs"`.

`vitest.config.ts`: `include: ['packages/**/*.test.ts', 'motion/**/*.test.ts', 'src/**/*.test.ts']`.

- [ ] **Step 4: Run tests and type check**

Run: `npx vitest run src/tools && npm run check:types`
Expected: 4 passed; tsc silent.

- [ ] **Step 5: Commit**

```bash
git add src package.json vitest.config.ts
git commit -m "feat(agents): backlog file helpers and the check script"
```

---

### Task 2: Harness tools

**Files:**
- Create: `src/tools/backlog.ts`, `src/tools/checks.ts`, `src/tools/git.ts`
- Test: `src/tools/git.test.ts` (pure helper only)

**Interfaces:**
- Consumes: Task 1 helpers, `REPO_ROOT`.
- Produces: tools `read_backlog` (no input) → `{ item: BacklogItem | null, open, done }`; `mark_done` `{ line }` → `{ ok, title }`; `run_checks` (no input) → `{ ok, exitCode, summary: string[], tail: string[] }`; `git_commit` `{ message }` → `{ ok, branch, sha }` or `{ ok: false, error }`. Also `AGENT_BRANCH = 'agent/backlog'` and `summarizeCheckOutput(text): string[]` exported for tests.

- [ ] **Step 1: Write backlog.ts**

```ts
// src/tools/backlog.ts
import { defineTool } from '@flue/runtime';
import { join } from 'node:path';
import * as v from 'valibot';
import { REPO_ROOT } from '../root.ts';
import { countItems, firstOpenItem, markDone } from './backlog-file.ts';

export const BACKLOG_PATH = join(REPO_ROOT, 'docs', 'backlog.md');

export const readBacklog = defineTool({
  name: 'read_backlog',
  description: 'Return the first unchecked item of docs/backlog.md (title, full text, section, 1-based line) and the open/done counts. item is null when the backlog is empty.',
  harness: true,
  async run({ harness }) {
    const md = await harness.sandbox.readFile(BACKLOG_PATH);
    return { output: { item: firstOpenItem(md), ...countItems(md) } };
  },
});

export const markDoneTool = defineTool({
  name: 'mark_done',
  description: 'Check off the open backlog item at the given 1-based line of docs/backlog.md. Call only after the reviewer passed the item.',
  input: v.object({ line: v.pipe(v.number(), v.integer(), v.minValue(1)) }),
  harness: true,
  async run({ data, harness }) {
    const md = await harness.sandbox.readFile(BACKLOG_PATH);
    const item = firstOpenItem(md);
    const next = markDone(md, data.line);
    await harness.sandbox.writeFile(BACKLOG_PATH, next);
    return { output: { ok: true, title: item?.line === data.line ? item.title : `line ${data.line}` } };
  },
});
```

- [ ] **Step 2: Write checks.ts**

```ts
// src/tools/checks.ts
import { defineTool } from '@flue/runtime';
import { REPO_ROOT } from '../root.ts';

const INTERESTING = /^(PASS|FAIL|Test Files|Tests|.*error TS\d+|\s*(✓|×|✗|FAIL) |Error:)/;

/** The lines a reader needs from a `npm run check` transcript. */
export function summarizeCheckOutput(text: string): string[] {
  return text.split('\n').map((l) => l.trimEnd()).filter((l) => INTERESTING.test(l)).slice(0, 80);
}

export const runChecks = defineTool({
  name: 'run_checks',
  description: 'Run the full check suite (npm run check: type check, unit tests, pixel parity for every clip). Returns ok, the exit code, the PASS/FAIL summary lines, and the last lines of output. Contact sheets are written to dist/verify/<clip>-contact.png for you to look at.',
  harness: true,
  async run({ harness }) {
    const r = await harness.sandbox.exec('npm run check', { cwd: REPO_ROOT, timeoutMs: 900_000 });
    const text = `${r.stdout}\n${r.stderr}`;
    return { output: { ok: r.exitCode === 0, exitCode: r.exitCode, summary: summarizeCheckOutput(text), tail: text.split('\n').slice(-40) } };
  },
});
```

- [ ] **Step 3: Write git.ts and its test**

```ts
// src/tools/git.ts
import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { REPO_ROOT } from '../root.ts';

export const AGENT_BRANCH = 'agent/backlog';

/** Single-quote a string for POSIX sh. */
export const shellQuote = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;

export const gitCommit = defineTool({
  name: 'git_commit',
  description: `Commit every change in the repository on branch ${AGENT_BRANCH} (created from the current HEAD when missing). Refuses to commit unless the check suite (npm run check) passes. Never commits dist/verify, data, or .env (they are gitignored). Returns the branch and short SHA.`,
  input: v.object({ message: v.pipe(v.string(), v.minLength(10)) }),
  harness: true,
  async run({ data, harness }) {
    const sh = (cmd: string, timeoutMs = 60_000) => harness.sandbox.exec(cmd, { cwd: REPO_ROOT, timeoutMs });
    const status = await sh('git status --porcelain');
    if (status.stdout.trim() === '') return { output: { ok: false, error: 'nothing to commit' } };
    const check = await sh('npm run check', 900_000);
    if (check.exitCode !== 0) {
      return { output: { ok: false, error: `check suite failed (exit ${check.exitCode}); fix it before committing`, tail: check.stdout.split('\n').slice(-30) } };
    }
    const current = (await sh('git branch --show-current')).stdout.trim();
    if (current !== AGENT_BRANCH) {
      const co = await sh(`git checkout -B ${AGENT_BRANCH}`);
      if (co.exitCode !== 0) return { output: { ok: false, error: co.stderr } };
    }
    await sh('git add -A');
    const commit = await sh(`git commit -q -m ${shellQuote(data.message)}`);
    if (commit.exitCode !== 0) return { output: { ok: false, error: commit.stderr || commit.stdout } };
    const sha = (await sh('git rev-parse --short HEAD')).stdout.trim();
    return { output: { ok: true, branch: AGENT_BRANCH, sha } };
  },
});
```

```ts
// src/tools/git.test.ts
import { expect, test } from 'vitest';
import { summarizeCheckOutput } from './checks.ts';
import { AGENT_BRANCH, shellQuote } from './git.ts';

test('shellQuote survives single quotes', () => {
  expect(shellQuote(`feat: it's done`)).toBe(`'feat: it'\\''s done'`);
});

test('agent branch name is fixed', () => {
  expect(AGENT_BRANCH).toBe('agent/backlog');
});

test('summarizeCheckOutput keeps the lines a reader needs', () => {
  const text = ['> check', 'PASS spinner / svg: worst 0.007% at t=1s', 'noise', ' Test Files  13 passed (13)', 'src/x.ts(3,1): error TS2322: bad', 'FAIL idle / svg: worst 1.2% at t=0s'].join('\n');
  expect(summarizeCheckOutput(text)).toEqual([
    'PASS spinner / svg: worst 0.007% at t=1s',
    ' Test Files  13 passed (13)',
    'src/x.ts(3,1): error TS2322: bad',
    'FAIL idle / svg: worst 1.2% at t=0s',
  ]);
});
```

- [ ] **Step 4: Run tests and type check**

Run: `npx vitest run src && npm run check:types`
Expected: 7 passed; tsc silent. If tsc complains about the `run` signature typing of `harness`, the tool is missing `harness: true`.

- [ ] **Step 5: Commit**

```bash
git add src/tools
git commit -m "feat(agents): backlog, check-suite, and gated git-commit tools"
```

---

### Task 3: Skills and the three agents

**Files:**
- Create: `src/skills/rig-reference/SKILL.md`, `src/skills/clip-dsl/SKILL.md`, `src/skills/pubnyan-motion/SKILL.md`, `src/agents/director.ts`, `src/agents/implementer.ts`, `src/agents/reviewer.ts`

**Interfaces:**
- Consumes: the four tools from Task 2.
- Produces: agents `Director`, `Implementer`, `Reviewer`; the Director's reply contract: exactly one line starting with `DONE:`, `FAILED:`, or `BACKLOG EMPTY`.

- [ ] **Step 1: Write the skills**

```markdown
<!-- src/skills/rig-reference/SKILL.md -->
---
name: rig-reference
description: Part names, pivots, hierarchy, and expressions of the pubnyan and starorbit rigs. Use before writing or editing any clip.
---
# Rigs

Two rigs, generated from `rig/parts.map.json` by `npm run rig:extract` (never edit `rig/*.rig.json` by hand). Coordinates: artboard origin top-left, y down; `-l` is the viewer's left.

## pubnyan (artboard 374 x 319)

Draw order, bottom first. Every part except `body` is a child of `body`, so body transforms move everything.

| part | fill | notes |
|---|---|---|
| body | black | head, ears, whiskers, torso, and the orbital ring in ONE silhouette; pivot at bottom centre (187, 314). The ring cannot rotate on its own. |
| face | white | star-shaped muzzle |
| eye-l.white, eye-r.white | white | eye shapes; change per expression |
| ring-gap-l, ring-gap-r | white | slivers where the ring's inner edge shows; animate to suggest the ring turning |
| tear-l, tear-r | white | hidden except in `cry` |
| eye-l.pupil, eye-r.pupil | black | hidden in angry, curious, shy |
| nose, mouth | black | on the face; mouth changes per expression |

Pivots default to each part's bounding-box centre. Expressions: `normal` (default), `angry`, `curious`, `cry`, `shy`. A `shape` key names one of these. Morphs happen when both expressions have the same path structure for that part (mouth normal <-> shy does; most eye pairs crossfade).

## starorbit (artboard 288 x 203)

Parts `ring` and `star`, no hierarchy. Used by the `spinner` clip.
```

```markdown
<!-- src/skills/clip-dsl/SKILL.md -->
---
name: clip-dsl
description: How to write a clip in motion/clips, register it, and prove it with the check suite. Use for any animation task.
---
# Clip DSL

One file per clip in `motion/clips/<name>.clip.ts`:

```ts
import { clip, key, track } from '#ir/clip.ts';
export default clip('nod', { rig: 'pubnyan', duration: 0.6, fps: 30, loop: false }, [
  track('body', 'position', [key(0, [0, 0]), key(0.25, [0, 6], 'easeOut'), key(0.6, [0, 0], 'inOutSine')]),
]);
```

- `track(part, property, keys)`; property is `position` ([dx, dy] px), `rotation` (degrees about the pivot), `scale` ([sx, sy]), `opacity` (0..1, the part's own shapes only, children do not inherit), or `shape` (an expression name or `default`).
- `key(t, value, ease?)`; t in seconds; the ease belongs to the segment that ENDS at this key. Eases: linear, easeIn, easeOut, easeInOut, inOutSine, outQuint, outBack.
- One track per (part, property). Key times strictly increasing within [0, duration].
- Looping clips must end where they start (rotation may differ by a multiple of 360); the validator rejects anything else.
- Register the clip in `motion/index.ts` (import it and add it to `clips`). Validation runs at module load, so a bad clip fails every command with a message naming the key.
- Prove it: call `run_checks` (or run `npm run check`). Then read `dist/verify/<clip>-contact.png`: top row is the reference sampler, second row the SVG export; they must look identical and the motion must read as intended.
- Exports land in `dist/svg/<clip>.svg`; commit `dist/svg` with the clip.
- Reference: `motion/README.md`, `motion/clips/idle.clip.ts`.
```

```markdown
<!-- src/skills/pubnyan-motion/SKILL.md -->
---
name: pubnyan-motion
description: Motion principles for the pubnyan mascot: amplitudes, timing, and what to avoid. Use when designing any pubnyan animation.
---
# How pubnyan moves

- Calm cat. Amplitudes are small: body scale within 1 +- 0.02, position within 8 px, rotation within 6 degrees.
- The star mouth and the orbital ring are the identity elements. Never distort the mouth; suggest ring motion with `ring-gap-l/r` scale changes in alternating phase.
- Blinks are a scale-y squash of both eye whites and both pupils to about 0.08 over 0.1 s in and 0.12 s out, with `easeIn` then `easeOut`.
- Expression changes cross-fade in 0.2 to 0.4 s; hold the new expression for at least 0.5 s before returning.
- One-shot reactions are 0.3 to 0.8 s and return exactly to rest so they can follow the idle loop.
- Use `inOutSine` for anything that breathes or sways, `easeOut` for arrivals, `outBack` sparingly for a bounce.
- A looping clip must end where it starts.
```

- [ ] **Step 2: Write the agents**

```ts
// src/agents/implementer.ts
'use agent';
import { useModel, useSandbox, useSkill, useTool } from '@flue/runtime';
import { local } from '@flue/runtime/node';
import { REPO_ROOT } from '../root.ts';
import clipDsl from '../skills/clip-dsl/SKILL.md';
import pubnyanMotion from '../skills/pubnyan-motion/SKILL.md';
import rigReference from '../skills/rig-reference/SKILL.md';
import { runChecks } from '../tools/checks.ts';

export function Implementer() {
  useModel('anthropic/claude-sonnet-5');
  useSandbox(local(), { cwd: REPO_ROOT });
  useSkill(rigReference);
  useSkill(clipDsl);
  useSkill(pubnyanMotion);
  useTool(runChecks);
  return `You implement ONE backlog item of pubnyan-live, a project that animates the Hackers' Pub mascot from a TypeScript motion definition (motion/) and exports it to several formats, verified by pixel parity in headless Chrome.

Rules:
- Read AGENTS.md first. Never edit vendor/, rig/*.rig.json, or .env. Do not commit; the director commits after review.
- Follow the item's acceptance criteria literally. For animation items activate the skills; for exporter items read the neighbouring package (packages/export-svg) and mirror its structure and tests.
- Work in small steps and call run_checks until it reports ok. Read dist/verify/<clip>-contact.png for any clip you touched and judge the motion.
- Keep the change minimal and tested. Follow the existing code style (Node 26 native TypeScript, .ts import extensions, # aliases).

When finished, reply with a report: what you changed (files), how you verified it (run_checks summary), what you looked at, and any doubts. If you cannot complete the item, say so plainly and explain why.`;
}
```

```ts
// src/agents/reviewer.ts
'use agent';
import { useModel, useSandbox, useTool } from '@flue/runtime';
import { local } from '@flue/runtime/node';
import { REPO_ROOT } from '../root.ts';
import { runChecks } from '../tools/checks.ts';

export function Reviewer() {
  useModel('anthropic/claude-sonnet-5');
  useSandbox(local(), { cwd: REPO_ROOT });
  useTool(runChecks);
  return `You review ONE completed backlog item of pubnyan-live before it is committed. You are read-only: never edit files.

Procedure:
1. Read the item text and the implementer's report you were given.
2. Run \`git status --porcelain\` and \`git diff\` (bash) to see exactly what changed.
3. Call run_checks. It must report ok.
4. For every clip touched, read dist/verify/<clip>-contact.png and judge whether the motion matches the item and the reference row matches the export row.
5. Check the acceptance criteria in the item one by one.

Reply with exactly one of:
- \`PASS\` on the first line, followed by one paragraph on what you verified.
- \`FINDINGS:\` on the first line, followed by a numbered list of concrete, actionable defects (file, what is wrong, what to change). Only list things that block the item; polish goes in a final "Notes (non-blocking)" line.`;
}
```

```ts
// src/agents/director.ts
'use agent';
import { defineSubagent, useModel, usePersistentState, useSandbox, useSubagent, useTool } from '@flue/runtime';
import { local } from '@flue/runtime/node';
import { REPO_ROOT } from '../root.ts';
import { markDoneTool, readBacklog } from '../tools/backlog.ts';
import { gitCommit } from '../tools/git.ts';
import { Implementer } from './implementer.ts';
import { Reviewer } from './reviewer.ts';

export const implementer = defineSubagent({
  name: 'implementer',
  description: 'Implements one backlog item in the repository and reports what it changed and how it verified it.',
  agent: Implementer,
  model: 'anthropic/claude-sonnet-5',
});

export const reviewer = defineSubagent({
  name: 'reviewer',
  description: 'Reviews one completed backlog item read-only and replies PASS or FINDINGS.',
  agent: Reviewer,
  model: 'anthropic/claude-sonnet-5',
});

export function Director() {
  useModel('anthropic/claude-opus-5');
  useSandbox(local(), { cwd: REPO_ROOT });
  useTool(readBacklog);
  useTool(markDoneTool);
  useTool(gitCommit);
  useSubagent(implementer);
  useSubagent(reviewer);
  const [rounds, setRounds] = usePersistentState('reviewRounds', 0);
  void setRounds;
  return `You are the Director of pubnyan-live. Each message you receive means: complete exactly ONE backlog item end to end, then reply with a one-line status. You never edit files yourself; the subagents do the work.

Procedure:
1. Call read_backlog. If item is null, reply exactly: BACKLOG EMPTY
2. Delegate to the implementer with the task tool. Pass the item's full text and section verbatim and say: implement it, prove it with run_checks, report back.
3. Delegate to the reviewer with the item text and the implementer's report. If it replies FINDINGS, send the findings verbatim back to the implementer and then re-review. Review rounds so far in this conversation: ${rounds}. Allow at most 3 rounds in total.
4. When the reviewer replies PASS: call mark_done with the item's line, then call git_commit with a conventional message that names the item (for example "feat(motion): add wink clip (backlog: Smoke: wink clip)"). git_commit runs the check suite itself and refuses if it fails; if it refuses, send the failure to the implementer as findings and continue the review loop.
5. Reply with exactly one line: "DONE: <item title> (<sha>)" or "FAILED: <item title>: <reason>". Never start a second item.`;
}
```

- [ ] **Step 3: Type check and load-test the modules with flue run**

Run: `npm run check:types`
Expected: silent.

Run: `npx flue run src/agents/director.ts -m next --id loadtest --json 2>/dev/null | head -c 600`
Expected: the module loads (skills validated, tools registered) and the run either completes (if `ANTHROPIC_API_KEY` is set in `.env`) or fails ONLY with `Provider is not configured: anthropic`. Any other error (skill name mismatch, import failure, tool validation) is a defect to fix. If a load test conversation was created, delete it: `rm -f data/flue.db*` is acceptable since `data/` is gitignored scratch.

- [ ] **Step 4: Commit**

```bash
git add src/skills src/agents
git commit -m "feat(agents): director, implementer, and reviewer agents with skills"
```

---

### Task 4: Loop script, workflow, and docs

**Files:**
- Create: `scripts/agent-loop.mjs`, `.github/workflows/agent.yml`
- Modify: `AGENTS.md`, `README.md`, `docs/backlog.md`

- [ ] **Step 1: Write the loop script**

```js
// scripts/agent-loop.mjs
// Runs the Director once per backlog item until the backlog is empty, an item fails, or `max` items are done.
// Usage: npm run agent [-- <max>]   (default max: AGENT_MAX_ITEMS or 3)
import { spawnSync } from 'node:child_process';

const max = Number(process.argv[2] ?? process.env.AGENT_MAX_ITEMS ?? 3);
if (!Number.isInteger(max) || max < 1) {
  console.error('usage: npm run agent -- <max items>');
  process.exit(2);
}

for (let i = 1; i <= max; i++) {
  const id = `pubnyan-${Date.now()}`;
  console.log(`[agent-loop] item ${i}/${max}, conversation ${id}`);
  const r = spawnSync('npx', ['flue', 'run', 'src/agents/director.ts', '-m', 'next', '--id', id], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const reply = (r.stdout ?? '').trim();
  const last = reply.split('\n').filter(Boolean).pop() ?? '';
  console.log(`[agent-loop] director: ${last}`);
  if (r.status !== 0) {
    console.error(`[agent-loop] flue run exited ${r.status}; stopping`);
    process.exit(1);
  }
  if (/^BACKLOG EMPTY/m.test(reply)) process.exit(0);
  if (/^FAILED:/m.test(reply)) {
    console.error('[agent-loop] item failed; stopping so a human can look');
    process.exit(1);
  }
  if (!/^DONE:/m.test(reply)) {
    console.error('[agent-loop] director did not follow the reply contract; stopping');
    process.exit(1);
  }
}
console.log(`[agent-loop] reached max ${max} items`);
```

- [ ] **Step 2: Write the workflow**

```yaml
# .github/workflows/agent.yml
name: agent
on:
  workflow_dispatch:
    inputs:
      max:
        description: Maximum backlog items to complete
        default: "1"
  # schedule:
  #   - cron: "0 3 * * *"   # enable once the loop has proven itself
jobs:
  backlog:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with: { submodules: true, fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: 26 }
      - run: npm ci
      - run: git config user.name "pubnyan-agent" && git config user.email "agent@users.noreply.github.com"
      - run: npm run agent -- ${{ inputs.max || '1' }}
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      - uses: peter-evans/create-pull-request@v7
        with:
          branch: agent/backlog
          title: "agent: backlog items"
          body: "Completed by the Flue director loop. Review dist/verify contact sheets locally with `npm run verify`."
          base: main
```

- [ ] **Step 3: Update AGENTS.md, README.md, and the backlog**

AGENTS.md: add a section:

```markdown
## The agent loop

- `npm run agent -- 1` completes one backlog item: the Director (src/agents/director.ts) delegates to the Implementer, has the Reviewer check it, commits on `agent/backlog`, and marks the item done. Needs `ANTHROPIC_API_KEY` in `.env`.
- Commits happen only through the `git_commit` tool, which runs `npm run check` first and refuses on failure.
- Merge `agent/backlog` into `main` after looking at the contact sheets. The GitHub workflow `agent` does the same on demand and opens a PR.
```

README.md Commands block: add `npm run check          # type check + tests + verify` and `npm run agent -- 1     # let the Flue director complete one backlog item (needs ANTHROPIC_API_KEY in .env)`.

docs/backlog.md: mark the "Flue agents" and "Agent loop scripts" items `[x]` (they are what this plan delivers) and move them under a new `## Phase 6 (done): agent loop` heading placed after Phase 5, so the loop's first real item is the Lottie static frame.

- [ ] **Step 4: Verify and commit**

Run: `node scripts/agent-loop.mjs 0`
Expected: usage error, exit 2 (proves the script parses).

Run: `npm run check:types && npm test`
Expected: green.

```bash
git add scripts .github AGENTS.md README.md docs/backlog.md
git commit -m "feat(agents): npm run agent loop, on-demand workflow, docs"
```

---

### Task 5: Smoke run on a throwaway item

**Precondition:** `ANTHROPIC_API_KEY` set in `.env` (the controller confirms with the user before dispatching this task).

- [ ] **Step 1: Add the smoke item at the top of the backlog**

Insert directly under the `# Backlog` intro paragraph, before `## Phase 4: Lottie`:

```markdown
## Smoke

- [ ] **Smoke: wink clip.** Add `motion/clips/wink.clip.ts`: rig pubnyan, 1 s, non-loop; `eye-r.white` and `eye-r.pupil` scale from [1, 1] at 0 s to [1, 0.08] at 0.35 s (`easeIn`) and back to [1, 1] at 0.55 s (`easeOut`); nothing else moves. Register it in `motion/index.ts`. `npm run check` green; `dist/svg/wink.svg` committed.
```

Commit that on `main`: `git commit -am "docs(backlog): smoke item for the agent loop"`.

- [ ] **Step 2: Run one item**

Run: `npm run agent -- 1 2>&1 | tail -40`
Expected: `[agent-loop] director: DONE: Smoke: wink clip. (<sha>)`, exit 0. Watch stderr for the delegation steps (task -> implementer, task -> reviewer, mark_done, git_commit).

- [ ] **Step 3: Inspect the result**

```bash
git log --oneline main..agent/backlog
git show --stat agent/backlog
git diff main..agent/backlog -- docs/backlog.md motion/index.ts motion/clips/wink.clip.ts
```
Expected: one commit on `agent/backlog` adding `motion/clips/wink.clip.ts`, registering it, adding `dist/svg/wink.svg`, updating `manifest.json`, and checking the smoke item. Open `dist/verify/wink-contact.png` after `git checkout agent/backlog && npm run verify`: the right eye closes around 0.35 s and reopens.

- [ ] **Step 4: Fold the result in**

If the result is correct: `git checkout main && git merge --ff-only agent/backlog && git branch -d agent/backlog`, then remove the `## Smoke` section from the backlog (the item is done and its heading is noise) and commit `docs(backlog): remove smoke section`. If it is wrong, keep the branch for inspection and report what the loop did; that is a finding about the prompts or tools, not about the clip.

## Self-review notes

- Spec coverage: Director, Animator (named Implementer because phase 4-5 items are exporter work), Reviewer, tools, skills, loop, scheduled workflow, backlog cursor (persistent state is per conversation; the loop uses a fresh conversation per item, so the durable cursor is the backlog file itself).
- Names used across tasks: `REPO_ROOT`, `firstOpenItem`, `countItems`, `markDone`, `readBacklog`, `markDoneTool`, `runChecks`, `summarizeCheckOutput`, `gitCommit`, `AGENT_BRANCH`, `shellQuote`, `Implementer`, `Reviewer`, `Director`, `implementer`, `reviewer`.
