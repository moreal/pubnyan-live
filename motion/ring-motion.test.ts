import { expect, test } from 'vitest';
import { clips, machine } from './index.ts';

// The two depth layers are one physical object, never independently waving gaps.
test('orbital gestures animate both halves as one rigid ring', () => {
  for (const name of ['idle', 'ring-wobble', 'celebrate', 'tail-flick']) {
    const clip = clips.find(c => c.name === name);
    expect(clip, name).toBeDefined();
    const back = clip!.tracks.filter(t => t.part === 'ring-back');
    const front = clip!.tracks.filter(t => t.part === 'ring-front');
    expect(back.length, `${name}: missing orbital motion`).toBeGreaterThan(0);
    expect(front.map(({ part, ...rest }) => rest)).toEqual(back.map(({ part, ...rest }) => rest));
    expect(clip!.tracks.some(t => t.part.startsWith('ring-gap'))).toBe(false);
  }
});

test('ring and celebration reactions can be triggered in the exported machine', () => {
  for (const [input, name] of [['reactRingWobble', 'ring-wobble'], ['reactCelebrate', 'celebrate']]) {
    expect(machine.inputs[input]).toEqual({ type: 'trigger' });
    const layer = Object.values(machine.layers).find(layer => layer.states[name]?.clip === name);
    expect(layer, `missing layer for ${name}`).toBeDefined();
    expect(layer!.transitions.some(t => t.to === name && t.when.input === input)).toBe(true);
  }
});

test('full-face celebration does not make ordinary reactions reset the expression', () => {
  // The Rive exporter treats a whole layer as partial only when none of its
  // clips author shapes. A smile in this layer would reset even an angry nod.
  const reaction = machine.layers.reaction;
  for (const state of Object.values(reaction.states)) {
    if (!state.clip) continue;
    const clip = clips.find(c => c.name === state.clip)!;
    expect(clip.tracks.some(t => t.property === 'shape'), `${state.clip} resets the reaction layer`).toBe(false);
  }
  expect(machine.layers.celebration.states.celebrate.clip).toBe('celebrate');
  expect(machine.layers.celebration.states[machine.layers.celebration.entry].clip).toBeNull();
  expect(clips.find(c => c.name === 'celebrate')!.tracks.some(t => t.property === 'shape')).toBe(true);
});
