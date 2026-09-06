import { describe, expect, test } from 'vitest';
import type { Rig } from '#ir/types.ts';
import { assertValid, isRig, loadRig, validateRig } from '#ir/validate.ts';

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

  test('rejects malformed path data such as a lone M with no coordinates', () => {
    const errors = validateRig({
      ...good,
      parts: [{ name: 'body', fill: '#000000', pivot: [0, 0], path: 'M' }],
    });
    expect(errors.some((e) => e.includes('path must be null or absolute'))).toBe(true);
  });

  test('assertValid throws with all messages', () => {
    expect(() => assertValid(['a', 'b'], 'rig test')).toThrow(/rig test.*\n- a\n- b/s);
    expect(() => assertValid([], 'ok')).not.toThrow();
  });
});

describe('isRig', () => {
  test('accepts a well-formed rig', () => {
    expect(isRig(good)).toBe(true);
  });

  test.each([
    ['not an object', 42],
    ['null', null],
    ['missing name', { ...good, name: undefined }],
    ['non-numeric artboard', { ...good, artboard: { width: '100', height: 100 } }],
    ['parts not an array', { ...good, parts: {} }],
    ['part missing fill', { ...good, parts: [{ name: 'body', pivot: [0, 0], path: null }] }],
    ['part with bad pivot', { ...good, parts: [{ name: 'body', fill: '#000000', pivot: [0], path: null }] }],
    ['expressions not an object', { ...good, expressions: null }],
    ['expression path neither null nor string', { ...good, expressions: { x: { body: 1 } } }],
  ])('rejects %s', (_label, data) => {
    expect(isRig(data)).toBe(false);
  });
});

describe('loadRig', () => {
  test('narrows and returns a well-formed rig', () => {
    expect(loadRig(good, 'test')).toEqual(good);
  });

  test('throws for structurally malformed data', () => {
    expect(() => loadRig({ nope: true }, 'test')).toThrow(/not a well-formed rig/);
  });

  test('throws for structurally valid but content-invalid data', () => {
    const bad = { ...good, parts: [{ ...good.parts[0], fill: 'red' }] };
    expect(() => loadRig(bad, 'test')).toThrow(/rig test is invalid/);
  });
});
