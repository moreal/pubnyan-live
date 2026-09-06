import { describe, expect, test } from 'vitest';
import { frameTimes } from '#export-video/index.ts';
import { clip, key, track } from '#ir/clip.ts';

describe('frameTimes', () => {
  test('spaces frames evenly over one period for a looping clip', () => {
    const c = clip('c', { rig: 'r', duration: 2, fps: 2 }, [track('a', 'rotation', [key(0, 0), key(2, 90)])]);
    expect(frameTimes(c)).toEqual([0, 0.5, 1, 1.5]);
  });

  test('holds the final pose with one extra frame for a non-looping clip', () => {
    const c = clip('c', { rig: 'r', duration: 1, fps: 4, loop: false }, [track('a', 'rotation', [key(0, 0), key(1, 90)])]);
    expect(frameTimes(c)).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  test('never produces zero frames for a very short clip', () => {
    const c = clip('c', { rig: 'r', duration: 0.01, fps: 1 }, [track('a', 'rotation', [key(0, 0), key(0.01, 90)])]);
    expect(frameTimes(c)).toEqual([0]);
  });
});
