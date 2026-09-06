// scripts/backlog-add.mjs
// Add items to docs/backlog.md with the same checks the Planner gets, without going through an
// agent conversation. Usage:
//   npm run backlog:add -- path/to/ops.json
//   echo '{"summary":"...","ops":[...]}' | npm run backlog:add
// The input is the exact `write_backlog` tool input shape: {"summary": "...", "ops": [...]}.
import { readFile as readFsFile, writeFile as writeFsFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as v from 'valibot';
import { execSh } from '../src/loop/sh.ts';
import { REPO_ROOT } from '../src/root.ts';
import { PLANNER_BACKLOG_PATH, writeBacklog, writeBacklogInputSchema } from '../src/tools/backlog-planner.ts';

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * The repository root this process operates on. Always `REPO_ROOT` (the checkout the CLI is
 * invoked from) except in tests, which spawn this script as a real subprocess against a scratch
 * git repo and need to point it elsewhere via `BACKLOG_ADD_ROOT`.
 */
const root = process.env.BACKLOG_ADD_ROOT ?? REPO_ROOT;

/** Builds a `PlannerFs` on top of `node:fs` and `execSh`, rooted at `root`. */
function nodeFs() {
  return {
    readFile: (p) => readFsFile(p, 'utf8'),
    writeFile: (p, s) => writeFsFile(p, s),
    exec: async (cmd) => {
      const r = await execSh('sh', ['-c', cmd], { cwd: root });
      return { stdout: r.stdout, stderr: r.stderr, exitCode: r.exitCode };
    },
  };
}

/**
 * @param {string[]} argv
 * @param {{ input?: string, fs?: ReturnType<typeof nodeFs>, path?: string }} [opts]
 */
export async function main(argv, { input, fs = nodeFs(), path = process.env.BACKLOG_ADD_ROOT ? join(process.env.BACKLOG_ADD_ROOT, 'docs', 'backlog.md') : PLANNER_BACKLOG_PATH } = {}) {
  const raw = input ?? (argv[0] ? await readFsFile(argv[0], 'utf8') : await readStdin());

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { ok: false, output: `invalid JSON: ${err.message}` };
  }

  const result = v.safeParse(writeBacklogInputSchema, parsed);
  if (!result.success) {
    const issues = result.issues.map((issue) => `${issue.path?.map((p) => p.key).join('.') ?? '(root)'}: ${issue.message}`);
    return { ok: false, output: `invalid input:\n${issues.join('\n')}` };
  }

  const r = await writeBacklog(fs, path, result.output.ops, result.output.summary);
  if (r.ok) return { ok: true, output: r.sha };
  const lines = [r.error, ...(r.errors ?? [])];
  return { ok: false, output: lines.join('\n') };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, output } = await main(process.argv.slice(2));
  console.log(output);
  process.exit(ok ? 0 : 1);
}
