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
