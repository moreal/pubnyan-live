import { describe, expect, test } from 'vitest';
import { countItems, duplicateTitles, findItem, firstItem, hasDoneWhen, parseItems, setState } from './backlog-file.ts';

const md = `# Backlog

Intro text.

## Phase 4: Lottie

- [x] **Done thing.** Already finished.
- [ ] **export-lottie: static frame.** Build the first exporter. Done when: parity on \`spinner\` passes.
- [~] **Claimed item.** Being worked on. Done when: it is.

## Maintenance

- [!] **Broken item.** Something small. Done when: fixed.
  - failed 2026-09-01: reviewer never passed
- [ ] **Tidy.** Something small. Done when: tidy.
`;

describe('parseItems', () => {
  test('reads every state with its section, title, text, and 1-based line', () => {
    expect(parseItems(md)).toEqual([
      { line: 7, state: 'done', title: 'Done thing.', text: '**Done thing.** Already finished.', section: 'Phase 4: Lottie' },
      { line: 8, state: 'open', title: 'export-lottie: static frame.', text: '**export-lottie: static frame.** Build the first exporter. Done when: parity on `spinner` passes.', section: 'Phase 4: Lottie' },
      { line: 9, state: 'claimed', title: 'Claimed item.', text: '**Claimed item.** Being worked on. Done when: it is.', section: 'Phase 4: Lottie' },
      { line: 13, state: 'failed', title: 'Broken item.', text: '**Broken item.** Something small. Done when: fixed.', section: 'Maintenance' },
      { line: 15, state: 'open', title: 'Tidy.', text: '**Tidy.** Something small. Done when: tidy.', section: 'Maintenance' },
    ]);
  });

  test('an item without a bold title uses the first 60 characters as its title', () => {
    expect(parseItems('- [ ] plain text item')[0].title).toBe('plain text item');
  });
});

describe('lookups', () => {
  test('findItem matches the title exactly', () => {
    expect(findItem(md, 'Tidy.')?.line).toBe(15);
    expect(findItem(md, 'Tidy')).toBeNull();
  });

  test('firstItem returns the first item in the given state or null', () => {
    expect(firstItem(md, 'open')?.title).toBe('export-lottie: static frame.');
    expect(firstItem(md, 'claimed')?.title).toBe('Claimed item.');
    expect(firstItem('- [x] **All.** done', 'open')).toBeNull();
  });

  test('countItems counts every state', () => {
    expect(countItems(md)).toEqual({ open: 2, claimed: 1, done: 1, failed: 1 });
  });
});

describe('setState', () => {
  test('open -> claimed flips only the marker', () => {
    const next = setState(md, 'Tidy.', 'claimed');
    expect(next.split('\n')[14]).toBe('- [~] **Tidy.** Something small. Done when: tidy.');
    expect(countItems(next)).toEqual({ open: 1, claimed: 2, done: 1, failed: 1 });
  });

  test('claimed -> done', () => {
    expect(findItem(setState(md, 'Claimed item.', 'done'), 'Claimed item.')?.state).toBe('done');
  });

  test('-> failed inserts the reason bullet under the item', () => {
    const next = setState(md, 'Tidy.', 'failed', { reason: 'check suite red', date: '2026-09-06' });
    const lines = next.split('\n');
    expect(lines[14]).toBe('- [!] **Tidy.** Something small. Done when: tidy.');
    expect(lines[15]).toBe('  - failed 2026-09-06: check suite red');
  });

  test('failed -> open removes the reason bullets', () => {
    const next = setState(md, 'Broken item.', 'open');
    const lines = next.split('\n');
    expect(lines[12]).toBe('- [ ] **Broken item.** Something small. Done when: fixed.');
    expect(lines[13]).toBe('- [ ] **Tidy.** Something small. Done when: tidy.');
  });

  test('is idempotent when the item is already in that state', () => {
    expect(setState(md, 'Done thing.', 'done')).toBe(md);
  });

  test('throws when the title does not exist', () => {
    expect(() => setState(md, 'Nope.', 'done')).toThrow(/no backlog item titled "Nope."/);
  });
});

describe('validation helpers', () => {
  test('duplicateTitles ignores done items', () => {
    const dup = `- [x] **A.** x\n- [ ] **A.** y\n- [ ] **B.** z\n- [!] **B.** w\n`;
    expect(duplicateTitles(dup)).toEqual(['B.']);
  });

  test('hasDoneWhen requires the sentence with content', () => {
    expect(hasDoneWhen('**T.** Do it. Done when: `npm test` passes.')).toBe(true);
    expect(hasDoneWhen('**T.** Do it. Done when:')).toBe(false);
    expect(hasDoneWhen('**T.** Do it.')).toBe(false);
  });
});
