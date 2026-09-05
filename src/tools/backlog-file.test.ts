import { describe, expect, test } from 'vitest';
import { countItems, firstOpenItem, markDone } from './backlog-file.ts';

const md = `# Backlog

Intro text.

## Phase 4: Lottie

- [x] **Done thing.** Already finished.
- [ ] **export-lottie: static frame.** Build the first exporter. Parity on \`spinner\` passes.
- [ ] **Second item.** Later.

## Maintenance

- [ ] **Tidy.** Something small.
`;

describe('backlog-file', () => {
  test('firstOpenItem returns the first unchecked item with its section, title, and 1-based line', () => {
    expect(firstOpenItem(md)).toEqual({
      line: 8,
      title: 'export-lottie: static frame.',
      text: '**export-lottie: static frame.** Build the first exporter. Parity on `spinner` passes.',
      section: 'Phase 4: Lottie',
    });
  });

  test('firstOpenItem returns null when nothing is open', () => {
    expect(firstOpenItem('- [x] **All.** done')).toBeNull();
  });

  test('countItems counts open and done', () => {
    expect(countItems(md)).toEqual({ open: 3, done: 1 });
  });

  test('markDone flips exactly that line and refuses other lines', () => {
    const next = markDone(md, 8);
    expect(next.split('\n')[7]).toBe('- [x] **export-lottie: static frame.** Build the first exporter. Parity on `spinner` passes.');
    expect(countItems(next)).toEqual({ open: 2, done: 2 });
    expect(() => markDone(md, 7)).toThrow(/not an open backlog item/);
    expect(() => markDone(md, 99)).toThrow(/not an open backlog item/);
  });
});
