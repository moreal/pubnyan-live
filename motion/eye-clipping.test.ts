import { expect, test } from 'vitest';
import { rm } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { clips, getRig } from './index.ts';
import { Renderer } from '#render/renderer.ts';
import { referenceFrame } from '#verify/reference.ts';
import { compareFrames } from '#verify/parity.ts';
import { TARGETS } from '#verify/targets/index.ts';

// The normal artwork can hide missing clipping against black fur. Contrasting
// colors make leakage visible in the actual target runtimes instead.
test('all exporters clip real pupils on a contrasting face during eye interactions', async () => {
  const rig = structuredClone(getRig('pubnyan'));
  for (const part of rig.parts) {
    if (part.name.endsWith('.pupil')) part.fill = '#ff2200';
    if (part.name === 'head') part.fill = '#4488cc';
  }
  const renderer = await Renderer.launch();
  const generated = new Set<string>();
  try {
    for (const [name, times] of [
      ['wink', [.19, .23, .3925]], ['idle', [3.2075, 3.2925]],
      ['celebrate', [.2333, .275, .65]], ['to-cry', [.0925, .1833]],
      ['from-cry', [.1583, .25]], ['expr-cry', [0]],
    ] as const) {
      const clip = {...clips.find(c => c.name === name)!, name: `fixture-colored-${name}`};
      generated.add(clip.name);
      for (const t of times) {
        const reference = await referenceFrame(renderer, rig, clip, t);
        for (const target of TARGETS) {
          const actual = await target.renderFrame(renderer, rig, clip, t);
          const expectedPixels = PNG.sync.read(reference), pixels = PNG.sync.read(actual);
          let redOutside = 0;
          for (let i = 0; i < pixels.data.length; i += 4) {
            if (pixels.data[i]! > 220 && pixels.data[i + 1]! < 65 && pixels.data[i + 2]! < 45
              && !(expectedPixels.data[i]! > 170 && expectedPixels.data[i + 1]! < 110 && expectedPixels.data[i + 2]! < 90)) redOutside++;
          }
          expect(redOutside, `${name}/${target.name}@${t}: pupil leakage`).toBeLessThanOrEqual(10);
          expect(compareFrames(actual, reference).ratio, `${name}/${target.name}@${t}`).toBeLessThanOrEqual(.002);
        }
      }
    }
  } finally {
    await renderer.close();
    await Promise.all([...generated].map(name => rm(new URL(`../dist/svg/${name}.svg`, import.meta.url), { force: true })));
  }
});
