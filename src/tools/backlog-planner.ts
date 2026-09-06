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
