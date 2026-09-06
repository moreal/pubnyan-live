import { duplicateTitles, findItem, hasDoneWhen, setState, type BacklogItem } from './backlog-file.ts';

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
  return { ok: true, md: text };
}
