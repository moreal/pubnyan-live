import { expect, test } from 'vitest';
import { clips, getRig, machine } from './index.ts';
import { exportRiveMachine } from '#export-rive/machine.ts';
import { Renderer } from '#render/renderer.ts';
import { renderRiveStateSequence } from '#verify/rive-machine-check.ts';
import { compareFrames } from '#verify/parity.ts';
import { referenceFrame } from '#verify/reference.ts';
import type { Machine } from '#ir/types.ts';

function withoutCelebration(): Machine {
  const result = structuredClone(machine);
  for (const layer of Object.values(result.layers)) {
    delete layer.states.celebrate;
    layer.transitions = layer.transitions.filter(t => t.to !== 'celebrate');
  }
  return result;
}

test('adding the happy reaction preserves angry and crying faces during a nod', async () => {
  const rig = getRig('pubnyan');
  const before = exportRiveMachine(rig, clips, withoutCelebration());
  const after = exportRiveMachine(rig, clips, machine);
  const renderer = await Renderer.launch();
  try {
    for (const expression of [1, 3]) {
      const steps = [{ expression, seconds: 1 }, { trigger: 'reactNod', seconds: 0.5 }];
      const baseline = await renderRiveStateSequence(renderer, rig, before, steps);
      const actual = await renderRiveStateSequence(renderer, rig, after, steps);
      expect(compareFrames(actual[1]!, baseline[1]!).ratio, `expression=${expression}`).toBeLessThanOrEqual(0.0005);
    }
  } finally { await renderer.close(); }
});

test('celebration releases its full-face performance back to the continuing emotion', async () => {
  const rig = getRig('pubnyan');
  const bytes = exportRiveMachine(rig, clips, machine);
  const renderer = await Renderer.launch();
  try {
    const baseline = await renderRiveStateSequence(renderer, rig, bytes, [{ expression: 3, seconds: 1 }, { seconds: 1.8 }]);
    const actual = await renderRiveStateSequence(renderer, rig, bytes, [{ expression: 3, seconds: 1 }, { trigger: 'reactCelebrate', seconds: 0.4 }, { seconds: 1.4 }]);
    const happy = await referenceFrame(renderer, rig, clips.find(c => c.name === 'celebrate')!, 0.4);
    expect(compareFrames(actual[1]!, happy).ratio).toBeLessThanOrEqual(0.002);
    // Show that the trigger changed the performance, then that it relinquished every channel.
    expect(compareFrames(actual[1]!, actual[0]!).ratio).toBeGreaterThan(0.002);
    expect(compareFrames(actual[2]!, baseline[1]!).ratio).toBeLessThanOrEqual(0.0005);
  } finally { await renderer.close(); }
});

test('triggering or interrupting a reaction preserves the pose at the transition boundary', async () => {
  const rig = getRig('pubnyan');
  const bytes = exportRiveMachine(rig, clips, machine);
  const renderer = await Renderer.launch();
  try {
    for (const trigger of ['react', 'reactNod', 'reactTilt', 'reactEarTwitch', 'reactTailFlick', 'reactRingWobble', 'reactCelebrate']) {
      const frames = await renderRiveStateSequence(renderer, rig, bytes, [
        { seconds: 2 }, { trigger, seconds: 0 },
        { seconds: 0.3 }, { trigger: trigger === 'reactNod' ? 'reactTilt' : 'reactNod', seconds: 0 },
      ]);
      expect(compareFrames(frames[0]!, frames[1]!).ratio, `${trigger} entry snaps`).toBeLessThanOrEqual(0.00001);
      expect(compareFrames(frames[2]!, frames[3]!).ratio, `${trigger} interruption snaps`).toBeLessThanOrEqual(0.00001);
    }
  } finally { await renderer.close(); }
});

// A shape-less reaction must never resurrect a pupil that an expression hides.
test('reactions preserve absent expression pupils and crying pupil geometry', async () => {
  const { PNG } = await import('pngjs');
  const rig = structuredClone(getRig('pubnyan'));
  for (const part of rig.parts) if (part.name.endsWith('.pupil')) part.fill = '#ff0000';
  const bytes = exportRiveMachine(rig, clips, machine);
  const renderer = await Renderer.launch();
  try {
    for (const expression of [1, 2, 4]) {
      for (const trigger of ['react', 'reactNod', 'reactTilt', 'reactEarTwitch', 'reactTailFlick', 'reactRingWobble']) {
        const frames = await renderRiveStateSequence(renderer, rig, bytes, [
          { expression, seconds: 1 }, { trigger, seconds: 0.1 }, { seconds: 0.4 }, { seconds: 0.1 },
        ]);
        for (const frame of frames) {
          const { data } = PNG.sync.read(frame);
          let red = 0;
          for (let i = 0; i < data.length; i += 4) if (data[i]! > 150 && data[i + 1]! < 80 && data[i + 2]! < 80) red++;
          expect(red, `${expression}/${trigger}: invented pupil`).toBe(0);
        }
      }
    }
    // At these fully reopened poses, omitting opacity only must not change the face.
    const control = structuredClone(clips);
    for (const c of control) if (['wink','nod','ring-wobble','tail-flick'].includes(c.name)) {
      c.tracks = c.tracks.filter(t => !(t.part.endsWith('.pupil') && t.property === 'opacity'));
    }
    const controlBytes = exportRiveMachine(rig, control, machine);
    for (const trigger of ['react', 'reactNod', 'reactTailFlick', 'reactRingWobble']) {
      const steps = [{ expression: 3, seconds: 1 }, { trigger, seconds: 0.6 }];
      const actual = await renderRiveStateSequence(renderer, rig, bytes, steps);
      const expected = await renderRiveStateSequence(renderer, rig, controlBytes, steps);
      expect(compareFrames(actual[1]!, expected[1]!).diffPixels, `${trigger}: changed cry pupil`).toBe(0);
    }
  } finally { await renderer.close(); }
});
