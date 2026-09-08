import { clip, key, track } from '#ir/clip.ts';
import { orbit } from './ring-motion.ts';
import { expressionShapes } from './expression-motion.ts';

/** One indignant inhale, a crisp huff, and a held sideways challenge. */
export default clip('expr-angry', { rig: 'pubnyan', duration: 4.6, fps: 60, loop: true }, [
  ...expressionShapes('angry'),
  // Ears pin on the huff, recoil once, then keep the stubborn silhouette.
  ...(['ear-l', 'ear-r'] as const).map((part, i) => {
    const direction = i === 0 ? -1 : 1;
    const delay = i * 0.07;
    return track(part, 'rotation', [key(0, 0), key(0.65 + delay, 0),
      key(1.16 + delay, direction * -1.5, 'inOutSine'), key(1.32 + delay, direction * -1.5),
      key(1.62 + delay, direction * 5.8, 'outCubic'), key(1.93 + delay, direction * 3.4, 'inOutSine'),
      key(2.68 + delay, direction * 3.4), key(3.96 + delay, 0, 'inOutSine'), key(4.6, 0)]);
  }),
  track('torso', 'scale', [key(0, [1, 1]), key(0.55, [1, 1]), key(1.15, [0.994, 1.018], 'inOutSine'), key(1.3, [0.994, 1.018]), key(1.51, [1.016, 0.987], 'outCubic'), key(1.82, [1.007, 0.996], 'outCubic'), key(2.6, [1.007, 0.996]), key(3.65, [1, 1], 'inOutSine'), key(4.6, [1, 1])]),
  track('head', 'position', [key(0, [0, 0]), key(0.6, [0, 0]), key(1.14, [-1, -3.5], 'inOutSine'), key(1.3, [-1, -3.5]), key(1.49, [1.8, 5.2], 'outCubic'), key(1.83, [0.5, 1.6], 'outCubic'), key(2.65, [0.5, 1.6]), key(3.75, [0, 0], 'inOutSine'), key(4.6, [0, 0])]),
  track('head', 'rotation', [key(0, 0), key(0.65, 0), key(1.15, -1.3, 'inOutSine'), key(1.3, -1.3), key(1.53, 4.2, 'outCubic'), key(1.94, 2.6, 'inOutSine'), key(2.65, 2.6), key(3.85, 0, 'inOutSine'), key(4.6, 0)]),
  track('torso', 'rotation', [key(0, 0), key(1.29, 0), key(1.59, 0.8, 'outCubic'), key(2.58, 0.8), key(3.7, 0, 'inOutSine'), key(4.6, 0)]),
  // The huff nudges the orbit after the cat; one restrained recoil preserves its weight.
  ...orbit('rotation', [key(0, 0), key(1.37, 0), key(1.76, 1.8, 'outCubic'),
    key(2.2, -0.55, 'inOutSine'), key(2.66, 0.3, 'inOutSine'),
    key(3.35, 0, 'inOutSine'), key(4.6, 0)]),
  ...orbit('position', [key(0, [0, 0]), key(0.75, [0, 0]),
    key(1.3, [0, -0.6], 'inOutSine'), key(1.76, [0, 1.4], 'outCubic'),
    key(2.3, [0, -0.3], 'inOutSine'), key(3.25, [0, 0], 'inOutSine'), key(4.6, [0, 0])]),
]);
