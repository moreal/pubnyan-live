import { describe, expect, test } from 'vitest';
import { clip, key, track } from '#ir/clip.ts';
import type { Rig } from '#ir/types.ts';
import { exportLottie, type LottieShapeGroup } from '#export-lottie/index.ts';

const rig: Rig = {
  name: 'r',
  artboard: { width: 100, height: 100 },
  parts: [
    { name: 'a', fill: '#ff0000', pivot: [5, 5], path: 'M0 0L10 0L10 10Z' },
    { name: 'b', fill: '#00ff00', pivot: [2, 2], parent: 'a', path: 'M0 0L4 0L4 4Z' },
    { name: 'ghost', fill: '#0000ff', pivot: [0, 0], parent: 'a', path: null },
  ],
  expressions: { normal: {} },
};

describe('exportLottie', () => {
  test('one shape layer per part, parent by index, anchor = pivot', () => {
    const out = exportLottie(rig, clip('c', { rig: 'r', duration: 1, fps: 30 }, [track('a', 'rotation', [key(0, 0), key(1, 90)])]));
    expect(out.w).toBe(100);
    expect(out.h).toBe(100);
    expect(out.fr).toBe(30);
    expect(out.layers).toHaveLength(3);

    const byName = new Map(out.layers.map((l) => [l.nm, l]));
    const a = byName.get('a')!;
    const b = byName.get('b')!;
    const ghost = byName.get('ghost')!;

    expect(a.ind).not.toBe(b.ind);
    expect(b.parent).toBe(a.ind);
    expect(ghost.parent).toBe(a.ind);
    expect(b.ks.a.k).toEqual([2, 2, 0]);
    expect(b.ks.p.k).toEqual([2, 2, 0]);
    expect(ghost.shapes).toHaveLength(0);
  });

  test('builds a single sh path with a fill from the part path', () => {
    const out = exportLottie(rig, clip('c', { rig: 'r', duration: 1 }, []));
    const a = out.layers.find((l) => l.nm === 'a')!;
    const group = a.shapes[0]!;
    const sh = group.it.find((it) => it.ty === 'sh') as Extract<LottieShapeGroup['it'][number], { ty: 'sh' }>;
    const fl = group.it.find((it) => it.ty === 'fl') as Extract<LottieShapeGroup['it'][number], { ty: 'fl' }>;
    if (sh.ks.a !== 0) throw new Error('expected a static shape');
    expect(sh.ks.k.v).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
    ]);
    expect(sh.ks.k.c).toBe(true);
    expect(fl.c.k).toEqual([1, 0, 0, 1]);
  });
});
