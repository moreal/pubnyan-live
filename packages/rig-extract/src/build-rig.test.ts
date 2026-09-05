import { describe, expect, test } from 'vitest';
import { parsePath } from '#ir/path.ts';
import { validateRig } from '#ir/validate.ts';
import { buildRig } from '#rig-extract/build-rig.ts';
import { selectPath, type PartsMapRig } from '#rig-extract/parts-map.ts';
import type { SourcePath } from '#rig-extract/svg-source.ts';

const square: SourcePath = {
  id: 'p1', fill: '#000000',
  subpaths: [
    { d: 'M0 0L10 0L10 10L0 10Z', bbox: [0, 0, 10, 10] },
    { d: 'M2 2L4 2L4 4Z', bbox: [2, 2, 4, 4] },
  ],
};
const noseA: SourcePath = { id: 'n', fill: '#000000', subpaths: [{ d: 'M4 4L6 4L6 6L4 6Z', bbox: [4, 4, 6, 6] }] };
const noseB: SourcePath = { id: 'n', fill: '#000000', subpaths: [{ d: 'M14 4L16 4L16 6L14 6Z', bbox: [14, 4, 16, 6] }] };
const files = { 'a.svg': [square, noseA], 'b.svg': [square, noseB] };

const def: PartsMapRig = {
  artboard: { width: 20, height: 20 },
  default: 'normal',
  align: { part: 'nose' },
  parts: [
    { name: 'body', fill: '#000000', pivot: [5, 10] },
    { name: 'hole', fill: '#ffffff', parent: 'body' },
    { name: 'nose', fill: '#000000', parent: 'body' },
    { name: 'extra', fill: '#ffffff', parent: 'body' },
  ],
  expressions: {
    normal: { file: 'a.svg', map: { body: 'p1#outer', hole: 'p1#rest', nose: 'n' } },
    shifted: { file: 'b.svg', map: { body: 'p1#outer', nose: 'n', extra: ['p1#1', 'n'] } },
  },
};

describe('selectPath', () => {
  test('outer, rest, index, whole, list', () => {
    expect(selectPath([square], 'p1#outer')).toBe('M0 0L10 0L10 10L0 10Z');
    expect(selectPath([square], 'p1#rest')).toBe('M2 2L4 2L4 4Z');
    expect(selectPath([square], 'p1#1')).toBe('M2 2L4 2L4 4Z');
    expect(selectPath([square], 'p1')).toBe('M0 0L10 0L10 10L0 10ZM2 2L4 2L4 4Z');
    expect(selectPath([square, noseA], ['p1#1', 'n'])).toBe('M2 2L4 2L4 4ZM4 4L6 4L6 6L4 6Z');
  });
  test('errors name the selector', () => {
    expect(() => selectPath([square], 'zzz#outer')).toThrow(/no path with id "zzz"/);
    expect(() => selectPath([square], 'p1#9')).toThrow(/out of range/);
  });
});

describe('buildRig', () => {
  const rig = buildRig('t', def, files);
  test('produces a valid rig with parts in order, default paths, pivots, hierarchy', () => {
    expect(validateRig(rig)).toEqual([]);
    expect(rig.parts.map((p) => p.name)).toEqual(['body', 'hole', 'nose', 'extra']);
    expect(rig.parts[0]).toEqual({ name: 'body', fill: '#000000', pivot: [5, 10], path: 'M0 0L10 0L10 10L0 10Z' });
    expect(rig.parts[1]).toEqual({ name: 'hole', fill: '#ffffff', pivot: [3, 3], parent: 'body', path: 'M2 2L4 2L4 4Z' });
    expect(rig.parts[3].path).toBeNull();
    expect(rig.parts[3].pivot).toEqual([0, 0]);
  });
  test('records every expression fully, aligning on the align part', () => {
    expect(Object.keys(rig.expressions)).toEqual(['normal', 'shifted']);
    expect(rig.expressions.normal.extra).toBeNull();
    expect(rig.expressions.shifted.hole).toBeNull();
    expect(parsePath(rig.expressions.shifted.nose!)[0]).toEqual(['M', 4, 4]); // shifted by -10 to match normal's nose
    expect(parsePath(rig.expressions.shifted.body!)[1]).toEqual(['L', 0, 0]); // whole expression shifted together
    expect(parsePath(rig.expressions.shifted.extra!)).toHaveLength(9); // 4 segments + 5 segments
  });
});
