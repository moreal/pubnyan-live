import { describe, expect, test } from 'vitest';
import type { Rig } from '#ir/types.ts';
import { assertValid, validateRig } from '#ir/validate.ts';

const good: Rig = {
  name: 'test',
  artboard: { width: 100, height: 100 },
  parts: [
    { name: 'body', fill: '#000000', pivot: [50, 100], path: 'M0 0L100 0L100 100L0 100Z' },
    { name: 'eye', fill: '#ffffff', pivot: [30, 30], parent: 'body', path: 'M20 20L40 20L40 40Z' },
    { name: 'tear', fill: '#ffffff', pivot: [0, 0], parent: 'body', path: null },
  ],
  expressions: { normal: {}, cry: { tear: 'M0 0L1 0L1 1Z', eye: null } },
};

describe('validateRig', () => {
  test('accepts a well-formed rig', () => {
    expect(validateRig(good)).toEqual([]);
  });

  test('rejects duplicate names, bad fills, unknown parents, parent declared later', () => {
    const bad: Rig = {
      ...good,
      parts: [
        { name: 'eye', fill: '#fff', pivot: [0, 0], parent: 'body', path: null },
        { name: 'body', fill: '#000000', pivot: [0, 0], path: 'M0 0Z' },
        { name: 'body', fill: '#000000', pivot: [0, 0], parent: 'ghost', path: 'M0 0Z' },
      ],
    };
    const errors = validateRig(bad);
    expect(errors.some((e) => e.includes('duplicate'))).toBe(true);
    expect(errors.some((e) => e.includes('#rrggbb'))).toBe(true);
    expect(errors.some((e) => e.includes('"ghost"'))).toBe(true);
    expect(errors.some((e) => e.includes('"body" must be declared before'))).toBe(true);
  });

  test('rejects expressions naming unknown parts or relative path data', () => {
    const errors = validateRig({ ...good, expressions: { x: { nope: null, eye: 'm 1 2 l 3 4' } } });
    expect(errors).toHaveLength(2);
  });

  test('assertValid throws with all messages', () => {
    expect(() => assertValid(['a', 'b'], 'rig test')).toThrow(/rig test.*\n- a\n- b/s);
    expect(() => assertValid([], 'ok')).not.toThrow();
  });
});
