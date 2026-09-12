import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import svgpath from 'svgpath';
import { svgPathBbox } from 'svg-path-bbox';
import { readSourceSvg } from '#rig-extract/svg-source.ts';
import { selectPath } from '#rig-extract/parts-map.ts';
import { resolvePath } from '#ir/sample.ts';
import { getRig, clips } from './index.ts';

const sources = [
  ['curious', 'path27', 'path29', 'path39', 'path41'],
  ['angry', 'path47', 'path43', 'path49', 'path57'],
  ['shy', 'path85', 'path83', 'path89', 'path111'],
];
const center = (d: string) => {
  const [x0, y0, x1, y1] = svgPathBbox(d);
  return [Number(((x0 + x1) / 2).toFixed(2)), Number(((y0 + y1) / 2).toFixed(2))];
};

test.each(sources)('%s preserves the original eye and mouth contours', (expression, left, right, nose, mouth) => {
  const rig = getRig('pubnyan');
  const paths = readSourceSvg(readFileSync(`vendor/visual-identity/exports/pubnyan-${expression}-transparent.svg`, 'utf8'));
  const ref = center(rig.parts.find(p => p.name === 'nose')!.path!);
  const origin = center(selectPath(paths, nose));
  for (const [name, selector] of [['eye-l.white', left], ['eye-r.white', right], ['mouth', mouth]]) {
    const expected = svgpath(selectPath(paths, selector)).translate(ref[0] - origin[0], ref[1] - origin[1]).round(2).toString();
    const actual = resolvePath(rig, rig.parts.find(p => p.name === name)!, expression)!;
    expect(svgpath(actual).round(2).toString()).toBe(expected);
  }
  // These original white contours already encode the gaze / squeezed-shut lids.
  for (const side of ['l', 'r']) expect(resolvePath(rig, rig.parts.find(p => p.name === `eye-${side}.pupil`)!, expression)).toBeNull();
});

test('shy keeps its original squeezed-shut eyes for the entire sustained expression', () => {
  const shy = clips.find(c => c.name === 'expr-shy')!;
  for (const track of shy.tracks.filter(t => t.part.startsWith('eye-') && t.property === 'shape')) {
    expect(track.keys.every(k => k.v === 'shy')).toBe(true);
  }
});

// A separate null pupil crossfade combined with animated opacity can make the
// Lottie player render the entire character blank, even though the sampler works.
test.each(['to-angry', 'from-angry', 'to-curious', 'from-curious', 'to-shy', 'from-shy'])(
  '%s remains visible in Lottie while the source eyes replace normal pupils', async name => {
    const { Renderer } = await import('#render/renderer.ts');
    const { lottieTarget } = await import('#verify/targets/lottie.ts');
    const { checkParity } = await import('#verify/parity.ts');
    const renderer = await Renderer.launch();
    try {
      const clip = clips.find(c => c.name === name)!;
      const result = await checkParity(renderer, getRig('pubnyan'), clip, lottieTarget, [0.1, 0.15, 0.4]);
      expect(result.pass, `${name}: ${result.worst.ratio}`).toBe(true);
    } finally { await renderer.close(); }
  },
);

test('normal keeps the source eye apertures and asymmetric pupils', () => {
  const rig = getRig('pubnyan');
  const paths = readSourceSvg(readFileSync('vendor/visual-identity/exports/pubnyan-normal-transparent.svg', 'utf8'));
  const ref = center(rig.parts.find(p => p.name === 'nose')!.path!);
  const origin = center(selectPath(paths, 'path23'));
  for (const [name, selector] of [['eye-l.white','path11#outer'], ['eye-r.white','path9#outer'], ['eye-l.pupil','path21'], ['eye-r.pupil','path19']]) {
    const expected = svgpath(selectPath(paths, selector)).translate(ref[0]-origin[0],ref[1]-origin[1]).round(2).toString();
    expect(svgpath(rig.parts.find(p => p.name === name)!.path!).round(2).toString()).toBe(expected);
  }
});
