import { describe, expect, test } from 'vitest';
import { clip, key, track } from '#ir/clip.ts';
import { apply } from '#ir/matrix.ts';
import { locate, sampleClip } from '#ir/sample.ts';
import type { Rig } from '#ir/types.ts';

const rig: Rig = {
  name: 'r',
  artboard: { width: 100, height: 100 },
  parts: [
    { name: 'body', fill: '#000000', pivot: [50, 50], path: 'M0 0L100 0L100 100L0 100Z' },
    { name: 'eye', fill: '#ffffff', pivot: [30, 30], parent: 'body', path: 'M20 20L40 20L40 40Z' },
    { name: 'tear', fill: '#ffffff', pivot: [0, 0], parent: 'body', path: null },
  ],
  expressions: {
    normal: {},
    wide: { eye: 'M10 20L50 20L50 40Z' },
    cry: { eye: 'M20 20C1 1 2 2 3 3Z', tear: 'M0 0L1 0L1 1Z' },
  },
};

describe('locate', () => {
  const keys = [key(1, 0), key(3, 10, 'easeInOut')];
  test('holds before the first and after the last key', () => {
    expect(locate(keys, 0)).toMatchObject({ from: keys[0], to: keys[0], p: 0 });
    expect(locate(keys, 9)).toMatchObject({ from: keys[1], to: keys[1], p: 0 });
  });
  test('eases into the target key', () => {
    expect(locate(keys, 2).p).toBeCloseTo(0.5, 4);
    expect(locate(keys, 1.5).p).toBeLessThan(0.25);
  });
});

describe('sampleClip', () => {
  test('rest pose is identity with default paths, hidden parts omitted', () => {
    const c = clip('c', { rig: 'r', duration: 1 }, [track('body', 'opacity', [key(0, 1)])]);
    const parts = sampleClip(rig, c, 0);
    expect(parts.map((p) => p.name)).toEqual(['body', 'eye']);
    expect(parts[0].matrix).toEqual([1, 0, 0, 1, 0, 0]);
    expect(parts[1].d).toBe('M20 20L40 20L40 40Z');
  });

  test('children inherit the parent transform', () => {
    const c = clip('c', { rig: 'r', duration: 2 }, [track('body', 'rotation', [key(0, 0), key(2, 180)])]);
    const eye = sampleClip(rig, c, 1).find((p) => p.name === 'eye')!;
    const [x, y] = apply(eye.matrix, [30, 30]); // body pivot 50,50 rotated 90deg: (30,30) -> (70,30)
    expect(x).toBeCloseTo(70, 6);
    expect(y).toBeCloseTo(30, 6);
  });

  test('loop wraps time, non-loop clamps', () => {
    const tracks = [track('body', 'opacity', [key(0, 0), key(1, 1)])];
    expect(sampleClip(rig, clip('l', { rig: 'r', duration: 1 }, tracks), 1.25)[0].opacity).toBeCloseTo(0.25, 6);
    expect(sampleClip(rig, clip('o', { rig: 'r', duration: 1, loop: false }, tracks), 5)[0].opacity).toBe(1);
  });

  test('compatible shapes morph, incompatible ones crossfade', () => {
    const morph = clip('m', { rig: 'r', duration: 1 }, [track('eye', 'shape', [key(0, 'normal'), key(1, 'wide')])]);
    expect(sampleClip(rig, morph, 0.5).find((p) => p.name === 'eye')!.d).toBe('M15 20L45 20L45 40Z');

    const fade = clip('f', { rig: 'r', duration: 1 }, [track('eye', 'shape', [key(0, 'normal'), key(1, 'cry')])]);
    const eyes = sampleClip(rig, fade, 0.25).filter((p) => p.name === 'eye');
    expect(eyes.map((p) => p.opacity)).toEqual([0.75, 0.25]);
  });

  test('hidden-by-default parts appear when an expression provides a path', () => {
    const c = clip('t', { rig: 'r', duration: 1 }, [track('tear', 'shape', [key(0, 'normal'), key(1, 'cry')])]);
    expect(sampleClip(rig, c, 0).some((p) => p.name === 'tear')).toBe(false);
    const tear = sampleClip(rig, c, 0.5).find((p) => p.name === 'tear')!;
    expect(tear.opacity).toBeCloseTo(0.5, 6);
  });

  test('part opacity multiplies crossfade opacity', () => {
    const c = clip('t', { rig: 'r', duration: 1 }, [
      track('eye', 'shape', [key(0, 'normal'), key(1, 'cry')]),
      track('eye', 'opacity', [key(0, 0.5)]),
    ]);
    expect(sampleClip(rig, c, 0.5).filter((p) => p.name === 'eye').map((p) => p.opacity)).toEqual([0.25, 0.25]);
  });
});
