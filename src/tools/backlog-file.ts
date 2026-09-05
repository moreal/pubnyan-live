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

/**
 * Returns the markdown with the open item at `line` (1-based) checked.
 * Idempotent: if the line is already checked, returns the markdown unchanged.
 * Throws only when the line is neither an open nor a done backlog item.
 */
export function markDone(markdown: string, line: number): string {
  const lines = markdown.split('\n');
  const target = lines[line - 1];
  if (target !== undefined && DONE.test(target)) return markdown;
  if (target === undefined || !OPEN.test(target)) throw new Error(`line ${line} is not a backlog item`);
  lines[line - 1] = target.replace(OPEN, '- [x] ');
  return lines.join('\n');
}
