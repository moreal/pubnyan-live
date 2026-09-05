import { defineTool } from '@flue/runtime';
import type { JsonValue } from '@flue/runtime';
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
  async run({ data, harness }): Promise<{ output: JsonValue }> {
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
