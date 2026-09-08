import { clip, key, track } from '#ir/clip.ts';
import { expressionShapes } from './expression-motion.ts';

/** One indignant inhale, a crisp huff, and a held sideways challenge. */
export default clip('expr-angry', { rig: 'pubnyan', duration: 4.6, fps: 60, loop: true }, [
  ...expressionShapes('angry'),
  track('body', 'scale', [key(0, [1, 1]), key(0.55, [1, 1]), key(1.15, [0.994, 1.018], 'inOutSine'), key(1.3, [0.994, 1.018]), key(1.51, [1.016, 0.987], 'outCubic'), key(1.82, [1.007, 0.996], 'outCubic'), key(2.6, [1.007, 0.996]), key(3.65, [1, 1], 'inOutSine'), key(4.6, [1, 1])]),
  track('head', 'position', [key(0, [0, 0]), key(0.6, [0, 0]), key(1.14, [-0.6, -2.5], 'inOutSine'), key(1.3, [-0.6, -2.5]), key(1.49, [1, 3.2], 'outCubic'), key(1.83, [0.5, 1.6], 'outCubic'), key(2.65, [0.5, 1.6]), key(3.75, [0, 0], 'inOutSine'), key(4.6, [0, 0])]),
  track('head', 'rotation', [key(0, 0), key(0.65, 0), key(1.15, -1.3, 'inOutSine'), key(1.3, -1.3), key(1.56, 2.7, 'outCubic'), key(1.94, 1.8, 'inOutSine'), key(2.65, 1.8), key(3.85, 0, 'inOutSine'), key(4.6, 0)]),
  track('body', 'rotation', [key(0, 0), key(1.29, 0), key(1.59, 0.8, 'outCubic'), key(2.58, 0.8), key(3.7, 0, 'inOutSine'), key(4.6, 0)]),
]);
