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
