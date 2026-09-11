import { expect, test } from 'vitest';
import svgpath from 'svgpath';
import { svgPathBbox } from 'svg-path-bbox';
import { sampleClip } from '#ir/sample.ts';
import { clips, getRig } from './index.ts';

test('the loading star stays inside the canvas for its complete rotation', () => {
  const clip = clips.find(c => c.name === 'spinner')!;
  const rig = getRig(clip.rig);
  for (let frame = 0; frame <= 240; frame++) {
    const t = clip.duration * frame / 240;
    const star = sampleClip(rig, clip, t).find(p => p.name === 'star')!;
    const [left, top, right, bottom] = svgPathBbox(svgpath(star.d).matrix(star.matrix).toString());
    expect(left, `left at ${t}`).toBeGreaterThanOrEqual(0);
    expect(top, `top at ${t}`).toBeGreaterThanOrEqual(0);
    expect(right, `right at ${t}`).toBeLessThanOrEqual(rig.artboard.width);
    expect(bottom, `bottom at ${t}`).toBeLessThanOrEqual(rig.artboard.height);
  }
});
