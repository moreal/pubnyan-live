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

test('sampleTimes spans the clip without the seam for loops, with the end for one-shots', () => {
  const tracks = [track('a', 'opacity', [key(0, 1)])];
  expect(sampleTimes(clip('l', { rig: 'r', duration: 2 }, tracks), 4)).toEqual([0, 0.5, 1, 1.5]);
  expect(sampleTimes(clip('o', { rig: 'r', duration: 3, loop: false }, tracks), 4)).toEqual([0, 1, 2, 3]);
});
