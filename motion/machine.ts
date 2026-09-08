import { machine } from '#ir/machine.ts';

/**
 * Each expression owns its breathing and eye motion. A separate always-on blink
 * would squash closed expression eyes and fight the emotional performance.
 * - expression: a sustained performance, switched by the `expression` enum input.
 * - reaction: one-shot reactions fired by the `react` trigger.
 */
export default machine({
  rig: 'pubnyan',
  inputs: {
    expression: { type: 'enum', values: ['normal', 'angry', 'curious', 'cry', 'shy'], default: 'normal' },
    react: { type: 'trigger' },
    reactNod: { type: 'trigger' },
    reactTilt: { type: 'trigger' },
    reactEarTwitch: { type: 'trigger' },
    reactTailFlick: { type: 'trigger' },
    loading: { type: 'bool', default: false },
  },
  layers: {
    expression: {
      // Blend from the current performance, including emotion-to-emotion changes.
      // The standalone to/from clips remain available for explicit transition playback.
      entry: 'normal',
      states: {
        normal: { clip: 'idle', mode: 'loop' },
        angry: { clip: 'expr-angry', mode: 'loop' },
        curious: { clip: 'expr-curious', mode: 'loop' },
        cry: { clip: 'expr-cry', mode: 'loop' },
        shy: { clip: 'expr-shy', mode: 'loop' },
      },
      transitions: [
        { from: '*', to: 'normal', when: { input: 'expression', equals: 'normal' }, duration: 0.4 },
        { from: '*', to: 'angry', when: { input: 'expression', equals: 'angry' }, duration: 0.24 },
        { from: '*', to: 'curious', when: { input: 'expression', equals: 'curious' }, duration: 0.3 },
        { from: '*', to: 'cry', when: { input: 'expression', equals: 'cry' }, duration: 0.4 },
        { from: '*', to: 'shy', when: { input: 'expression', equals: 'shy' }, duration: 0.36 },
      ],
    },
    reaction: {
      // One-shot reactions, each fired by its own trigger input. The Rive exporter
      // releases these overlays to the empty entry after completion, so the
      // expression layer regains control of every facial channel.
      entry: 'none',
      states: {
        none: { clip: null, mode: 'once' },
        wink: { clip: 'wink', mode: 'once' },
        nod: { clip: 'nod', mode: 'once' },
        tilt: { clip: 'tilt', mode: 'once' },
        'ear-twitch': { clip: 'ear-twitch', mode: 'once' },
        'tail-flick': { clip: 'tail-flick', mode: 'once' },
      },
      transitions: [
        { from: '*', to: 'wink', when: { input: 'react', fired: true }, duration: 0 },
        { from: '*', to: 'nod', when: { input: 'reactNod', fired: true }, duration: 0 },
        { from: '*', to: 'tilt', when: { input: 'reactTilt', fired: true }, duration: 0 },
        { from: '*', to: 'ear-twitch', when: { input: 'reactEarTwitch', fired: true }, duration: 0 },
        { from: '*', to: 'tail-flick', when: { input: 'reactTailFlick', fired: true }, duration: 0 },
      ],
    },
  },
});
