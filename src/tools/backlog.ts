import { defineTool } from '@flue/runtime';
import type { JsonValue } from '@flue/runtime';
import { join } from 'node:path';
import * as v from 'valibot';
import { REPO_ROOT } from '../root.ts';
import { countItems, firstOpenItem, markDone } from './backlog-file.ts';

export const BACKLOG_PATH = join(REPO_ROOT, 'docs', 'backlog.md');

export const readBacklog = defineTool({
  name: 'read_backlog',
  description: 'Return the first unchecked item of docs/backlog.md (title, full text, section, 1-based line) and the open/done counts. item is null when the backlog is empty.',
  harness: true,
  async run({ harness }): Promise<{ output: JsonValue }> {
    const md = await harness.sandbox.readFile(BACKLOG_PATH);
    const item = firstOpenItem(md);
    return {
      output: {
        item: item ? { line: item.line, title: item.title, text: item.text, section: item.section } : null,
        ...countItems(md),
      },
    };
  },
});

export const markDoneTool = defineTool({
  name: 'mark_done',
  description: 'Check off the open backlog item at the given 1-based line of docs/backlog.md. Call after the reviewer passed the item. Idempotent and safe to call again (for example after a later git_commit refusal): calling it on a line that is already checked is a no-op.',
  input: v.object({ line: v.pipe(v.number(), v.integer(), v.minValue(1)) }),
  harness: true,
  async run({ data, harness }) {
    const md = await harness.sandbox.readFile(BACKLOG_PATH);
    const item = firstOpenItem(md);
    const next = markDone(md, data.line);
    const alreadyDone = next === md;
    if (!alreadyDone) await harness.sandbox.writeFile(BACKLOG_PATH, next);
    return { output: { ok: true, title: item?.line === data.line ? item.title : `line ${data.line}`, alreadyDone } };
  },
});
