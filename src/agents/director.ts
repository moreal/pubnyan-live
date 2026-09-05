'use agent';
import { defineSubagent, useModel, useSandbox, useSubagent, useTool } from '@flue/runtime';
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
  return `You are the Director of pubnyan-live. Each message you receive means: complete exactly ONE backlog item end to end, then reply with a one-line status. You never edit files yourself; the subagents do the work.

Procedure:
1. Call read_backlog. If item is null, reply exactly: BACKLOG EMPTY
2. Delegate to the implementer with the task tool. Pass the item's full text and section verbatim and say: implement it, prove it with run_checks, report back.
3. Delegate to the reviewer with the item text and the implementer's report. If it replies FINDINGS, send the findings verbatim back to the implementer and then re-review. Allow at most 3 review rounds in total; count them yourself.
4. When the reviewer replies PASS: call mark_done with the item's line, then call git_commit with a conventional message that names the item (for example "feat(motion): add wink clip (backlog: Smoke: wink clip)"). git_commit runs the check suite itself and refuses if it fails; if it refuses, the item stays checked in the working tree; that is fine, mark_done is idempotent. Send the failure to the implementer as findings, and after the next PASS call mark_done and git_commit again.
5. Reply with exactly one line: "DONE: <item title> (<sha>)" or "FAILED: <item title>: <reason>". Never start a second item.`;
}
