import { expect, test } from 'vitest';
import { clips, getRig } from './index.ts';
import { sampleClip } from '#ir/sample.ts';
import { sampleTimes } from '#verify/parity.ts';
import svgpath from 'svgpath';
import { svgPathBbox } from 'svg-path-bbox';

test('every pupil uses its animated white aperture independently of artwork color', () => {
  const rig = structuredClone(getRig('pubnyan'));
  for (const part of rig.parts) {
    if (part.name.endsWith('.pupil')) {
      part.fill = '#ff2200';
      expect(part.clipTo).toBe(part.name.replace('.pupil', '.white'));
    }
    if (part.name === 'head') part.fill = '#4488cc';
  }
  for (const clip of clips.filter(c => c.rig === rig.name)) {
    for (const t of sampleTimes(clip)) {
      const parts = sampleClip(rig, clip, t);
      for (const pupil of parts.filter(p => p.name.endsWith('.pupil'))) {
        const white = parts.filter(p => p.name === pupil.name.replace('.pupil', '.white'));
        expect(pupil.clipPaths, `${clip.name} ${pupil.name} at ${t}`).toEqual(
          white.map(p => ({ d: p.d, matrix: p.matrix })),
        );
      }
    }
  }
});

test('a reopening blink restores pupils before the eyes become broad white ovals', async () => {
  const { blink } = await import('./clips/expression-motion.ts');
  const { sampleNumeric, sampleVec2 } = await import('#ir/sample.ts');
  const tracks = blink(1, 0.1);
  const lid = tracks.find(t => t.part === 'eye-l.white' && t.property === 'scale')!;
  const pupil = tracks.find(t => t.part === 'eye-l.pupil' && t.property === 'opacity')!;
  for (let t = 0.22; t <= 0.4; t += 1 / 240) {
    const height = sampleVec2(lid as import('#ir/types.ts').Track<'scale'>, t)[1];
    if (height >= 0.5) expect(sampleNumeric(pupil as import('#ir/types.ts').Track<'opacity'>, t), `blank eye at ${t}`).toBeGreaterThanOrEqual(0.8);
  }
});

test('wink closes toward the lower lid and preserves the other eye', () => {
  const rig = getRig('pubnyan');
  const wink = clips.find(c => c.name === 'wink')!;
  const eyesOnly = { ...wink, tracks: wink.tracks.filter(t => t.part.startsWith('eye-')) };
  const rest = sampleClip(rig, eyesOnly, 0);
  const held = sampleClip(rig, eyesOnly, 0.3);
  const bounds = (parts: typeof rest, name: string) => {
    const part = parts.find(p => p.name === name)!;
    return svgPathBbox(svgpath(part.d).matrix(part.matrix).toString());
  };
  const open = bounds(rest, 'eye-r.white');
  const closed = bounds(held, 'eye-r.white');
  expect((closed[1] + closed[3] - open[1] - open[3]) / 2).toBeGreaterThan(3);
  expect(closed[3] - closed[1]).toBeLessThan(4);
  expect(bounds(held, 'eye-l.white')).toEqual(bounds(rest, 'eye-l.white'));
});

test('blink reopening leaves the closed hold gently without a one-frame pop', async () => {
  const { blink } = await import('./clips/expression-motion.ts');
  const { sampleVec2 } = await import('#ir/sample.ts');
  const lid = blink(1, 0.1).find(t => t.part === 'eye-l.white' && t.property === 'scale')! as import('#ir/types.ts').Track<'scale'>;
  const closed = sampleVec2(lid, 0.22)[1];
  expect(sampleVec2(lid, 0.22 + 1 / 60)[1] - closed).toBeLessThan(0.08);
});

test('pupils retain their dimensions while lids blink or smile', () => {
  const rig = getRig('pubnyan');
  for (const clip of clips.filter(c => c.rig === rig.name && !/^(to|from)-/.test(c.name))) {
    // Remove parent acting to measure the pupil itself, rather than torso breath.
    const eyesOnly = { ...clip, tracks: clip.tracks.filter(t => t.part.startsWith('eye-')) };
    const baseline = sampleClip(rig, eyesOnly, 0);
    for (let frame = 0; frame <= Math.ceil(clip.duration * 120); frame++) {
      const t = Math.min(frame / 120, clip.duration);
      for (const pupil of sampleClip(rig, eyesOnly, t).filter(p => p.name.endsWith('.pupil') && p.opacity > 0.05)) {
        const rest = baseline.find(p => p.name === pupil.name)!;
        const a = svgPathBbox(svgpath(rest.d).matrix(rest.matrix).toString());
        const b = svgPathBbox(svgpath(pupil.d).matrix(pupil.matrix).toString());
        expect(b[2] - b[0], `${clip.name} ${pupil.name} width at ${t}`).toBeCloseTo(a[2] - a[0], 6);
        expect(b[3] - b[1], `${clip.name} ${pupil.name} height at ${t}`).toBeCloseTo(a[3] - a[1], 6);
      }
    }
  }
});


test('expression transitions do not compress pupils during the hidden contour swap', async () => {
  const { groupTracks, sampleVec2 } = await import('#ir/sample.ts');
  for (const clip of clips.filter(c => /^(to|from)-/.test(c.name))) {
    for (const side of ['l', 'r']) {
      const scale = groupTracks(clip).get(`eye-${side}.pupil`)?.scale;
      for (let frame = 0; frame <= 48; frame++) {
        expect(scale ? sampleVec2(scale, frame / 120) : [1, 1], `${clip.name} pupil scale`).toEqual([1, 1]);
      }
    }
  }
});
