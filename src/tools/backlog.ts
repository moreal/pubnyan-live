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
  async run({ data, harness }): Promise<{ output: JsonValue }> {
    const md = await harness.sandbox.readFile(BACKLOG_PATH);
    const item = findItem(md, data.title);
    if (!item) return { output: { ok: false, error: `no backlog item titled "${data.title}"` } };
    const alreadyDone = item.state === 'done';
    if (!alreadyDone) await harness.sandbox.writeFile(BACKLOG_PATH, setState(md, data.title, 'done'));
    return { output: { ok: true, title: item.title, alreadyDone } };
  },
});
