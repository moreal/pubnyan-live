import { machine } from '#ir/machine.ts';

/**
 * The pubnyan state machine: three parallel layers.
 * - idle: the always-on breathing/blink loop.
 * - expression: which face pubnyan is making, switched by the `expression` enum input.
 * - reaction: one-shot reactions fired by the `react` trigger.
 */
export default machine({
  rig: 'pubnyan',
  inputs: {
    expression: { type: 'enum', values: ['normal', 'angry', 'curious', 'cry', 'shy'], default: 'normal' },
    react: { type: 'trigger' },
    loading: { type: 'bool', default: false },
  },
  layers: {
    idle: {
      entry: 'idle',
      states: { idle: { clip: 'idle', mode: 'loop' } },
      transitions: [],
    },
    expression: {
      // "normal" is the rig's default pose, so it needs no clip of its own.
      entry: 'normal',
      states: {
        normal: { clip: null, mode: 'loop' },
        angry: { clip: 'expr-angry', mode: 'loop' },
        curious: { clip: 'expr-curious', mode: 'loop' },
        cry: { clip: 'expr-cry', mode: 'loop' },
        shy: { clip: 'expr-shy', mode: 'loop' },
      },
      transitions: [
        { from: '*', to: 'normal', when: { input: 'expression', equals: 'normal' }, duration: 0.2 },
        { from: '*', to: 'angry', when: { input: 'expression', equals: 'angry' }, duration: 0.2 },
        { from: '*', to: 'curious', when: { input: 'expression', equals: 'curious' }, duration: 0.2 },
        { from: '*', to: 'cry', when: { input: 'expression', equals: 'cry' }, duration: 0.2 },
        { from: '*', to: 'shy', when: { input: 'expression', equals: 'shy' }, duration: 0.2 },
      ],
    },
    reaction: {
      // `wink` is the only one-shot clip that exists so far; the dedicated reaction
      // clips (nod, tilt, ear-twitch, tail-flick) are a separate backlog item.
      entry: 'none',
      states: {
        none: { clip: null, mode: 'once' },
        wink: { clip: 'wink', mode: 'once' },
      },
      transitions: [{ from: '*', to: 'wink', when: { input: 'react', fired: true }, duration: 0 }],
    },
  },
});
