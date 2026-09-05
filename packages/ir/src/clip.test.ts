import { describe, expect, test } from 'vitest';
import { clip, key, track, validateClip } from '#ir/clip.ts';
import type { Rig } from '#ir/types.ts';

const rig: Rig = {
  name: 'r',
  artboard: { width: 10, height: 10 },
  parts: [{ name: 'a', fill: '#000000', pivot: [0, 0], path: 'M0 0L1 0L1 1Z' }],
  expressions: { normal: {}, angry: { a: 'M0 0L2 0L2 2Z' } },
};

describe('clip DSL', () => {
  test('builders fill defaults', () => {
    const c = clip('idle', { rig: 'r', duration: 2 }, [track('a', 'rotation', [key(0, 0), key(2, 360, 'easeOut')])]);
    expect(c).toEqual({
      name: 'idle', rig: 'r', duration: 2, fps: 30, loop: true,
      tracks: [{ part: 'a', property: 'rotation', keys: [{ t: 0, v: 0 }, { t: 2, v: 360, ease: 'easeOut' }] }],
    });
    expect(validateClip(c, rig)).toEqual([]);
  });

  test('rejects wrong rig, unknown part, bad times, bad values, duplicate tracks', () => {
    const c = clip('x', { rig: 'other', duration: 1, fps: 0 }, [
      track('ghost', 'opacity', [key(0, 1)]),
      track('a', 'opacity', [key(0.5, 2), key(0.5, 1)]),
      track('a', 'opacity', [key(0, 1)]),
      track('a', 'scale', [key(0, [1, 1, 1] as unknown as [number, number])]),
      track('a', 'shape', [key(0, 'normal'), key(3, 'sad')]),
      track('a', 'rotation', [key(0, 0, 'bouncy' as never)]),
    ]);
    const errors = validateClip(c, rig);
    for (const needle of ['rig "other"', 'fps', '"ghost"', 'strictly increasing', 'opacity', 'duplicate track', '[x, y]', 'expression "sad"', 'within [0, 1]', 'ease "bouncy"']) {
      expect(errors.join('\n')).toContain(needle);
    }
  });

  test('a looping clip must end where it starts; rotation counts modulo 360', () => {
    const spin = clip('spin', { rig: 'r', duration: 2 }, [
      track('a', 'rotation', [key(0, 0), key(2, 360)]),
      track('a', 'scale', [key(0, [1, 1]), key(1, [1.2, 1.2]), key(2, [1, 1])]),
      track('a', 'shape', [key(0, 'normal'), key(1, 'angry'), key(2, 'normal')]),
    ]);
    expect(validateClip(spin, rig)).toEqual([]);

    const drift = clip('drift', { rig: 'r', duration: 2 }, [track('a', 'opacity', [key(0, 1), key(2, 0.5)])]);
    expect(validateClip(drift, rig)).toEqual([
      'tracks[0] (a.opacity): looping clip must end where it starts (first key 1, last key 0.5)',
    ]);

    const shifted = clip('shifted', { rig: 'r', duration: 2 }, [track('a', 'position', [key(0, [0, 0]), key(2, [0, 5])])]);
    expect(validateClip(shifted, rig).join('\n')).toContain('must end where it starts (first key [0,0], last key [0,5])');

    const once = clip('once', { rig: 'r', duration: 2, loop: false }, [track('a', 'opacity', [key(0, 1), key(2, 0.5)])]);
    expect(validateClip(once, rig)).toEqual([]);
  });

  test('rejects empty tracks and empty keys', () => {
    expect(validateClip(clip('x', { rig: 'r', duration: 1 }, []), rig)).toContain('clip needs at least one track');
    expect(validateClip(clip('x', { rig: 'r', duration: 1 }, [track('a', 'opacity', [])]), rig).join()).toContain('at least one key');
  });
});
