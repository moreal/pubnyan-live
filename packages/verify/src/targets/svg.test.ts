import { afterAll, beforeAll, expect, test } from 'vitest';
import { clips, getRig } from '#motion/index.ts';
import { checkParity } from '#verify/parity.ts';
import { Renderer } from '#verify/renderer.ts';
import { svgTarget } from '#verify/targets/svg.ts';

let renderer: Renderer;
beforeAll(async () => {
  renderer = await Renderer.launch();
});
afterAll(async () => {
  await renderer.close();
});

test('every registered clip matches the reference sampler in the svg target', async () => {
  for (const clip of clips) {
    const result = await checkParity(renderer, getRig(clip.rig), clip, svgTarget);
    expect(result.pass, `${clip.name}: worst frame t=${result.worst.t} ratio=${result.worst.ratio}`).toBe(true);
  }
});
