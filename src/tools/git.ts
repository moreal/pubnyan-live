import { defineTool } from '@flue/runtime';
import type { JsonValue } from '@flue/runtime';
import * as v from 'valibot';
import { WORK_ROOT } from '../root.ts';
import { summarizeCheckOutput } from './checks.ts';
import { computeTreeHash, readCachedTreeHash, shellQuote, writeCachedTreeHash } from './tree-hash.ts';

export const AGENT_BRANCH = 'agent/backlog';
export { shellQuote };

export const gitCommit = defineTool({
  name: 'git_commit',
  description: `Commit every change in the repository on branch ${AGENT_BRANCH} (created from the current HEAD when missing). Refuses to commit unless the check suite (npm run check) passes. Never commits dist/verify, data, or .env (they are gitignored). Returns the branch and short SHA.`,
  input: v.object({ message: v.pipe(v.string(), v.minLength(10)) }),
  harness: true,
  async run({ data, harness }): Promise<{ output: JsonValue }> {
    const sh = (cmd: string, timeoutMs = 60_000) => harness.sandbox.exec(cmd, { cwd: WORK_ROOT, timeoutMs });
    const status = await sh('git status --porcelain');
    if (status.stdout.trim() === '') return { output: { ok: false, error: 'nothing to commit' } };

    // run_checks may have already verified this exact tree; skip the redundant `npm run check`
    // if the tree has not changed since.
    const treeHash = await computeTreeHash(sh);
    const cachedHash = await readCachedTreeHash();
    if (treeHash !== cachedHash) {
      const check = await sh('npm run check', 900_000);
      if (check.exitCode !== 0) {
        return { output: { ok: false, error: `check suite failed (exit ${check.exitCode}); fix it before committing`, tail: summarizeCheckOutput(`${check.stdout}\n${check.stderr}`) } };
      }
      await writeCachedTreeHash(treeHash);
    }
    const current = (await sh('git branch --show-current')).stdout.trim();
    if (current !== AGENT_BRANCH) {
      // Never `checkout -B`: that would reset an existing agent/backlog to HEAD and orphan the
      // commits already on it. A plain checkout carries the uncommitted work across.
      const exists = (await sh(`git rev-parse --verify --quiet refs/heads/${AGENT_BRANCH}`)).exitCode === 0;
      const co = await sh(exists ? `git checkout ${AGENT_BRANCH}` : `git checkout -b ${AGENT_BRANCH}`);
      if (co.exitCode !== 0) {
        return { output: { ok: false, error: `could not switch to ${AGENT_BRANCH}: ${co.stderr.trim() || co.stdout.trim()}` } };
      }
    }
    await sh('git add -A');
    const commit = await sh(`git commit -q -m ${shellQuote(data.message)}`);
    if (commit.exitCode !== 0) return { output: { ok: false, error: commit.stderr || commit.stdout } };
    const sha = (await sh('git rev-parse --short HEAD')).stdout.trim();
    return { output: { ok: true, branch: AGENT_BRANCH, sha } };
  },
});
