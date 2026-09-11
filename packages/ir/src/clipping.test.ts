import { expect, test } from 'vitest';
import { PNG } from 'pngjs';
import { clip, key, track } from './clip.ts';
import { sampleClip, staticParts } from './sample.ts';
import { renderStaticSvg } from './svg.ts';
import { isRig, validateRig } from './validate.ts';
import type { Rig } from './types.ts';
import { Renderer } from '#render/renderer.ts';

const rig: Rig = {
  name: 'clipping-test', artboard: { width: 100, height: 100 },
  parts: [
    { name: 'face', fill: '#224466', pivot: [50, 50], path: 'M0 0L100 0L100 100L0 100Z' },
    { name: 'white', fill: '#ffffff', parent: 'face', pivot: [50, 50], path: 'M20 30L80 30L80 70L20 70Z' },
    { name: 'pupil', fill: '#ff0000', parent: 'face', pivot: [50, 50], path: 'M40 10L60 10L60 90L40 90Z', clipTo: 'white' },
  ],
  expressions: { normal: {}, shut: { white: null } },
};
const blink = clip('test', { rig: rig.name, duration: 1, fps: 60, loop: false }, [
  track('white', 'scale', [key(0, [1, 1]), key(0.5, [1, 0.1]), key(1, [1, 1])]),
]);

test('clip sources are validated instead of silently ignored', () => {
  expect(validateRig(rig)).toEqual([]);
  for (const source of ['missing', 'pupil']) {
    const invalid = structuredClone(rig); invalid.parts[2]!.clipTo = source;
    expect(validateRig(invalid).join(' ')).toMatch(/clipTo/);
  }
  const wrongParent = structuredClone(rig); delete wrongParent.parts[2]!.parent;
  expect(validateRig(wrongParent).join(' ')).toMatch(/clipTo/);
  const chained = structuredClone(rig); chained.parts[1]!.clipTo = 'face';
  expect(validateRig(chained).join(' ')).toMatch(/clipTo/);
  const malformed = structuredClone(rig) as unknown as { parts: {clipTo?: unknown}[] };
  malformed.parts[2]!.clipTo = 42;
  expect(isRig(malformed)).toBe(false);
});

test('sampling keeps pupil geometry independent and carries world-space aperture geometry', () => {
  const sampled = sampleClip(rig, blink, 0.5);
  const pupil = sampled.find(p => p.name === 'pupil')!;
  expect(pupil.d).toBe(rig.parts[2]!.path);
  expect(pupil.matrix).toEqual([1, 0, 0, 1, 0, 0]);
  expect(pupil.clipPaths).toEqual([{ d: rig.parts[1]!.path, matrix: [1, 0, 0, 0.1, 0, 45] }]);
  expect(staticParts(rig, 'shut').find(p => p.name === 'pupil')!.clipPaths).toEqual([]);
});

test('a colored pupil is really clipped on a contrasting face, including an empty aperture', async () => {
  const renderer = await Renderer.launch();
  try {
    for (const [parts, expectedCenter] of [
      [sampleClip(rig, blink, 0.5), [255, 0, 0, 255]],
      [staticParts(rig, 'shut'), [34, 68, 102, 255]],
    ] as const) {
      const png = PNG.sync.read(await renderer.renderSvg(renderStaticSvg(parts, rig.artboard), 100, 100));
      const pixel = (x: number, y: number) => [...png.data.subarray((y * 100 + x) * 4, (y * 100 + x) * 4 + 4)];
      expect(pixel(50, 50)).toEqual(expectedCenter);
      expect(pixel(50, 20)).toEqual([34, 68, 102, 255]);
      expect(pixel(50, 80)).toEqual([34, 68, 102, 255]);
    }
  } finally { await renderer.close(); }
});
