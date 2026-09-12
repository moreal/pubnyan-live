import { expect, test } from 'vitest';
import { clips, getRig, machine } from './index.ts';
import { exportRiveMachine } from '#export-rive/machine.ts';
import { Renderer } from '#render/renderer.ts';
import { renderRiveStateSequence } from '#verify/rive-machine-check.ts';
import { compareFrames } from '#verify/parity.ts';

const triggers = ['react', 'reactNod', 'reactTilt', 'reactEarTwitch', 'reactRingWobble', 'reactTailFlick', 'reactCelebrate'];
// Independent expected behavior, including the deprecated ring alias.
const allowed = [triggers, ['reactEarTwitch'], ['reactNod', 'reactTilt', 'reactEarTwitch', 'reactRingWobble', 'reactTailFlick'], ['reactEarTwitch'], ['react', 'reactNod', 'reactEarTwitch']];

test('Rive enforces every emotion/reaction pair even when triggers bypass the UI', async () => {
  const rig = getRig('pubnyan');
  const bytes = exportRiveMachine(rig, clips, machine);
  const renderer = await Renderer.launch();
  try {
    for (let expression = 0; expression < allowed.length; expression++) {
      const baseline = await renderRiveStateSequence(renderer, rig, bytes, [{ expression, seconds: 1 }, { seconds: 0.3 }, { seconds: 2 }]);
      for (const trigger of triggers) {
        const frames = await renderRiveStateSequence(renderer, rig, bytes, [{ expression, seconds: 1 }, { trigger, seconds: 0.3 }, { seconds: 2 }]);
        const diff = compareFrames(frames[1]!, baseline[1]!).diffPixels;
        if (allowed[expression]!.includes(trigger)) expect(diff, `${expression}/${trigger} should play`).toBeGreaterThan(0);
        else expect(diff, `${expression}/${trigger} should be ignored`).toBe(0);
        expect(compareFrames(frames[2]!, baseline[2]!).ratio, `${expression}/${trigger} should release`).toBeLessThanOrEqual(0.0005);
      }
    }
  } finally { await renderer.close(); }
});

test('incompatible active reactions release on emotion changes without replaying rejected triggers', async () => {
  const rig = getRig('pubnyan');
  const bytes = exportRiveMachine(rig, clips, machine);
  const renderer = await Renderer.launch();
  try {
    for (const trigger of triggers.filter(t => t !== 'reactEarTwitch')) {
      const baseline = await renderRiveStateSequence(renderer, rig, bytes, [{ seconds: 1 }, { seconds: 0.3 }, { expression: 3, seconds: 0.7 }]);
      const actual = await renderRiveStateSequence(renderer, rig, bytes, [{ seconds: 1 }, { trigger, seconds: 0.3 }, { expression: 3, seconds: 0 }, { seconds: 0.7 }]);
      expect(compareFrames(actual[1]!, actual[2]!).ratio, `${trigger} cancellation boundary`).toBeLessThanOrEqual(0.00001);
      expect(compareFrames(actual[3]!, baseline[2]!).ratio, `${trigger} cancels`).toBeLessThanOrEqual(0.0005);
    }
    const baseline = await renderRiveStateSequence(renderer, rig, bytes, [{ expression: 3, seconds: 1 }, { seconds: 0.1 }, { expression: 0, seconds: 0.5 }]);
    const actual = await renderRiveStateSequence(renderer, rig, bytes, [{ expression: 3, seconds: 1 }, { trigger: 'reactCelebrate', seconds: 0.1 }, { expression: 0, seconds: 0.5 }]);
    expect(compareFrames(actual[2]!, baseline[2]!).diffPixels).toBe(0);
  } finally { await renderer.close(); }
});

test('compatible active reactions continue across expression changes', async () => {
  const rig = getRig('pubnyan');
  const bytes = exportRiveMachine(rig, clips, machine);
  const renderer = await Renderer.launch();
  try {
    for (const [trigger, expression] of [['react', 4], ['reactEarTwitch', 3]] as const) {
      const baseline = await renderRiveStateSequence(renderer, rig, bytes, [{seconds:1}, {seconds:0.1}, {expression,seconds:0.2}]);
      const actual = await renderRiveStateSequence(renderer, rig, bytes, [{seconds:1}, {trigger,seconds:0.1}, {expression,seconds:0.2}]);
      expect(compareFrames(actual[2]!, baseline[2]!).diffPixels, `${trigger} must continue`).toBeGreaterThan(0);
    }
  } finally { await renderer.close(); }
});
