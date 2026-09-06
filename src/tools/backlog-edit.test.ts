import { describe, expect, test } from 'vitest';
import { applyOps } from './backlog-edit.ts';

const md = `# Backlog

Intro.

## Phase A

- [x] **Old.** Finished.
- [ ] **One.** First open. Done when: one.
- [~] **Busy.** Claimed by the worker. Done when: busy.

## Maintenance

- [!] **Broken.** Failed once. Done when: fixed.
  - failed 2026-09-01: reviewer never passed
- [ ] **Two.** Second open. Done when: two.
`;

const ok = (r: ReturnType<typeof applyOps>) => {
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.md;
};

describe('insert', () => {
  test('at the end of a section', () => {
    const out = ok(applyOps(md, [{ op: 'insert', title: 'Three.', text: 'Third. Done when: three.', section: 'Maintenance' }], []));
    expect(out.split('\n').slice(-3)).toEqual(['- [ ] **Two.** Second open. Done when: two.', '- [ ] **Three.** Third. Done when: three.', '']);
  });

  test('after a named item, even a protected one', () => {
    const out = ok(applyOps(md, [{ op: 'insert', title: 'One-b.', text: 'Between. Done when: b.', section: 'Phase A', after: 'Busy.' }], ['Busy.']));
    const lines = out.split('\n');
    expect(lines[8]).toBe('- [~] **Busy.** Claimed by the worker. Done when: busy.');
    expect(lines[9]).toBe('- [ ] **One-b.** Between. Done when: b.');
    expect(lines[10]).toBe('');
  });

  test('refuses an unknown section, a missing Done when, and a duplicate title', () => {
    expect(applyOps(md, [{ op: 'insert', title: 'X.', text: 'x. Done when: x.', section: 'Nope' }], [])).toEqual({ ok: false, errors: ['insert "X.": no section "Nope"'] });
    expect(applyOps(md, [{ op: 'insert', title: 'X.', text: 'no criteria', section: 'Phase A' }], [])).toEqual({ ok: false, errors: ['insert "X.": text must contain a "Done when:" sentence'] });
    expect(applyOps(md, [{ op: 'insert', title: 'One.', text: 'dup. Done when: d.', section: 'Phase A' }], [])).toEqual({ ok: false, errors: ['insert "One.": an item with that title already exists'] });
  });
});

describe('replace / remove / reopen', () => {
  test('replace keeps the marker and rewrites the body', () => {
    const out = ok(applyOps(md, [{ op: 'replace', title: 'One.', text: 'Rewritten. Done when: new.' }], []));
    expect(out).toContain('- [ ] **One.** Rewritten. Done when: new.\n');
  });

  test('remove drops the line and its reason bullets', () => {
    const out = ok(applyOps(md, [{ op: 'remove', title: 'Broken.' }], []));
    expect(out).not.toContain('Broken.');
    expect(out).not.toContain('failed 2026-09-01');
  });

  test('reopen turns a failed item back into an open one', () => {
    const out = ok(applyOps(md, [{ op: 'reopen', title: 'Broken.' }], []));
    expect(out).toContain('- [ ] **Broken.** Failed once. Done when: fixed.\n- [ ] **Two.**');
  });

  test('refuses to touch claimed, done, or protected items, or unknown titles', () => {
    expect(applyOps(md, [{ op: 'replace', title: 'Busy.', text: 'x. Done when: x.' }], [])).toEqual({ ok: false, errors: ['replace "Busy.": item is claimed by the worker; leave it alone'] });
    expect(applyOps(md, [{ op: 'remove', title: 'Old.' }], [])).toEqual({ ok: false, errors: ['remove "Old.": item is done; done items are history'] });
    expect(applyOps(md, [{ op: 'remove', title: 'One.' }], ['One.'])).toEqual({ ok: false, errors: ['remove "One.": item is claimed by the worker; leave it alone'] });
    expect(applyOps(md, [{ op: 'reopen', title: 'One.' }], [])).toEqual({ ok: false, errors: ['reopen "One.": item is not failed'] });
    expect(applyOps(md, [{ op: 'remove', title: 'Ghost.' }], [])).toEqual({ ok: false, errors: ['remove "Ghost.": no such item'] });
  });

  test('a reorder is remove + insert, applied in order, and nothing is written on any error', () => {
    const out = ok(applyOps(md, [
      { op: 'remove', title: 'Two.' },
      { op: 'insert', title: 'Two.', text: 'Second open. Done when: two.', section: 'Phase A', after: 'Old.' },
    ], []));
    const lines = out.split('\n');
    expect(lines[6]).toBe('- [x] **Old.** Finished.');
    expect(lines[7]).toBe('- [ ] **Two.** Second open. Done when: two.');
    const bad = applyOps(md, [{ op: 'remove', title: 'Two.' }, { op: 'remove', title: 'Busy.' }], []);
    expect(bad.ok).toBe(false);
  });
});
