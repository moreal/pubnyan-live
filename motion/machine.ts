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
    reactNod: { type: 'trigger' },
    reactTilt: { type: 'trigger' },
    reactEarTwitch: { type: 'trigger' },
    reactTailFlick: { type: 'trigger' },
    loading: { type: 'bool', default: false },
  },
  layers: {
    idle: {
      entry: 'idle',
      states: { idle: { clip: 'idle', mode: 'loop' } },
      transitions: [],
    },
    expression: {
      // "normal" is the rig's default pose, so it needs no clip of its own. Entering another
      // expression plays that expression's dedicated 0.4 s `to-<expr>` morph/crossfade clip
      // (non-looping, so the runtime holds its last frame, i.e. the fully-expressed pose,
      // until the input changes again) instead of a bare generic crossfade, so the eyes,
      // mouth, nose, and tears actually morph. `motion/clips/from-<expr>.clip.ts` author the
      // reverse morphs for parity/export on their own; the state-machine derivation this
      // layer feeds (`export-lottie`'s dotLottie graph) only supports `from: '*'` transitions,
      // so it cannot pick a specific reverse clip by "which expression were we just in" --
      // leaving back to normal instead uses the layer's own generic crossfade `duration`,
      // timed to match the `to-*` clips.
      entry: 'normal',
      states: {
        normal: { clip: null, mode: 'loop' },
        angry: { clip: 'to-angry', mode: 'once' },
        curious: { clip: 'to-curious', mode: 'once' },
        cry: { clip: 'to-cry', mode: 'once' },
        shy: { clip: 'to-shy', mode: 'once' },
      },
      transitions: [
        { from: '*', to: 'normal', when: { input: 'expression', equals: 'normal' }, duration: 0.4 },
        { from: '*', to: 'angry', when: { input: 'expression', equals: 'angry' }, duration: 0 },
        { from: '*', to: 'curious', when: { input: 'expression', equals: 'curious' }, duration: 0 },
        { from: '*', to: 'cry', when: { input: 'expression', equals: 'cry' }, duration: 0 },
        { from: '*', to: 'shy', when: { input: 'expression', equals: 'shy' }, duration: 0 },
      ],
    },
    reaction: {
      // One-shot reactions, each fired by its own trigger input. All return to `none`
      // by playing out their clip fully (mode: 'once'), which then holds the rest pose.
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
