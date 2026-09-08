import { expect, test } from 'vitest';
import { clips, machine } from './index.ts';
import { groupTracks, sampleNumeric, sampleVec2 } from '#ir/sample.ts';

test('expression states sustain movement instead of freezing on an entrance frame', () => {
  for (const state of Object.values(machine.layers.expression!.states)) {
    const clip = clips.find((clip) => clip.name === state.clip)!;
    expect(state.mode).toBe('loop');
    expect(clip.loop).toBe(true);
    expect(clip.tracks.some((track) => track.property !== 'shape'
      && track.keys.some((key) => JSON.stringify(key.v) !== JSON.stringify(track.keys[0].v)))).toBe(true);
  }
  // Normal's blink must not run underneath already-closed expression eyes.
  expect(machine.layers.idle).toBeUndefined();
});

test('falling tears never visibly travel back up the face', () => {
  const crying = clips.find((clip) => clip.name === 'expr-cry')!;
  const tracks = groupTracks(crying);
  for (const part of ['tear-l', 'tear-r']) {
    const { position, opacity } = tracks.get(part)!;
    for (let t = 1 / 240; t < crying.duration; t += 1 / 240) {
      const before = sampleVec2(position!, t - 1 / 240)[1];
      const after = sampleVec2(position!, t)[1];
      if (after < before) expect(sampleNumeric(opacity!, t)).toBeLessThan(1e-9);
    }
  }
});

test('blink closes quickly, holds shut, and gives reopening more time', () => {
  const idle = clips.find((clip) => clip.name === 'idle')!;
  const tracks = groupTracks(idle);
  for (const side of ['l', 'r']) {
    const white = tracks.get(`eye-${side}.white`)!.scale!;
    const pupil = tracks.get(`eye-${side}.pupil`)!.scale!;
    expect(white.keys).toEqual(pupil.keys);
    const closed = white.keys.filter((key) => key.v[1] === 0.08);
    expect(closed).toHaveLength(2);
    expect(closed[1].t - closed[0].t).toBeGreaterThanOrEqual(0.03);
    const closing = closed[0].t - white.keys[1].t;
    const opening = white.keys[4].t - closed[1].t;
    expect(opening).toBeGreaterThan(closing);
  }
});
