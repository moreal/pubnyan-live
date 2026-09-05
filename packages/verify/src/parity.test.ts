import { PNG } from 'pngjs';
import { expect, test } from 'vitest';
import { clip, key, track } from '#ir/clip.ts';
import { compareFrames, sampleTimes } from '#verify/parity.ts';

function png(width: number, height: number, paint: (x: number, y: number) => number): Buffer {
  const img = new PNG({ width, height });
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    const v = paint(x, y);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  return PNG.sync.write(img);
}

test('compareFrames counts differing pixels', () => {
  const a = png(4, 4, () => 255);
  const b = png(4, 4, (x, y) => (x === 1 && y === 2 ? 0 : 255));
  expect(compareFrames(a, a).diffPixels).toBe(0);
  const r = compareFrames(a, b);
  expect(r.diffPixels).toBe(1);
  expect(r.ratio).toBeCloseTo(1 / 16, 6);
  expect(PNG.sync.read(r.diff).width).toBe(4);
});

test('compareFrames rejects mismatched sizes', () => {
  expect(() => compareFrames(png(4, 4, () => 0), png(5, 4, () => 0))).toThrow(/size/);
});

test('sampleTimes hits every key time, the midpoints between them, and the loop seam', () => {
  const tracks = [
    track('a', 'opacity', [key(0, 1), key(1, 1)]),
    track('b', 'rotation', [key(0, 0), key(0.5, 10), key(2, 0)]),
  ];
  expect(sampleTimes(clip('l', { rig: 'r', duration: 2 }, tracks))).toEqual([0, 0.25, 0.5, 0.75, 1, 1.5, 2]);
  expect(sampleTimes(clip('o', { rig: 'r', duration: 2, loop: false }, tracks))).toEqual([0, 0.25, 0.5, 0.75, 1, 1.5, 2]);
});

test('sampleTimes rounds to 4 decimals and keeps duration even when no key lands on it', () => {
  const c = clip('x', { rig: 'r', duration: 1, loop: false }, [track('a', 'opacity', [key(0, 1), key(1 / 3, 0)])]);
  expect(sampleTimes(c)).toEqual([0, 0.1667, 0.3333, 0.6667, 1]);
});
