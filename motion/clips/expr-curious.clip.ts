import { clip, key, track } from '#ir/clip.ts';
import { orbit } from './ring-motion.ts';
import { blink, expressionShapes } from './expression-motion.ts';

/** Eyes notice first; a tiny recoil prepares a lifted, held inquisitive tilt. */
export default clip('expr-curious', { rig: 'pubnyan', duration: 5.4, fps: 60, loop: true }, [
  // The near ear pricks on the question; the far ear catches up after the head.
  track('ear-r', 'rotation', [key(0, 0), key(0.56, 0), key(0.74, 1.2, 'inOutCubic'), key(1.15, -5.8, 'outCubic'), key(1.47, -3.2, 'inOutSine'), key(2.26, -3.2), key(2.69, -5.2, 'outCubic'), key(3.36, -5.2), key(4.62, 0, 'inOutSine'), key(5.4, 0)]),
  track('ear-l', 'rotation', [key(0, 0), key(0.88, 0), key(1.3, 3.8, 'outCubic'), key(1.65, 2, 'inOutSine'), key(3.45, 2), key(4.72, 0, 'inOutSine'), key(5.4, 0)]),
  ...expressionShapes('curious'), ...blink(5.4, 3.66),
  ...['eye-l.pupil', 'eye-r.pupil'].map((part) => track(part, 'position', [
    key(0, [0, 0]), key(0.38, [0, 0]), key(0.53, [2, -1], 'outCubic'),
    key(2.04, [2, -1]), key(2.2, [1.2, -0.6], 'outCubic'),
    key(3.68, [1.2, -0.6]), key(3.83, [0, 0], 'inOutCubic'), key(5.4, [0, 0]),
  ])),
  ...['eye-l.white', 'eye-r.white'].map((part) => track(part, 'position', [
    key(0, [0, 0]), key(0.43, [0, 0]), key(0.63, [0.8, -0.4], 'outCubic'),
    key(2.04, [0.8, -0.4]), key(2.24, [0.48, -0.24], 'outCubic'),
    key(3.68, [0.48, -0.24]), key(3.9, [0, 0], 'inOutCubic'), key(5.4, [0, 0]),
  ])),
  track('torso', 'scale', [key(0, [1, 1]), key(0.56, [1, 1]), key(0.76, [1.007, 0.993], 'inOutCubic'), key(1.13, [0.997, 1.012], 'outCubic'), key(1.5, [1, 1.008], 'inOutSine'), key(3.3, [1, 1.008]), key(4.35, [1, 1], 'inOutSine'), key(5.4, [1, 1])]),
  track('torso', 'rotation', [key(0, 0), key(0.7, 0), key(1.2, -1.4, 'outCubic'), key(3.3, -1.4), key(4.4, 0, 'inOutSine'), key(5.4, 0)]),
  track('head', 'position', [key(0, [0, 0]), key(0.57, [0, 0]), key(0.76, [-0.6, 0.8], 'inOutCubic'), key(1.03, [2.3, -4.2], 'outCubic'), key(1.42, [1.9, -3.3], 'inOutSine'), key(3.28, [1.9, -3.3]), key(4.34, [0, 0], 'inOutSine'), key(5.4, [0, 0])]),
  track('head', 'rotation', [key(0, 0), key(0.61, 0), key(0.78, 0.7, 'inOutCubic'), key(1.08, -4.6, 'outCubic'), key(1.52, -3.6, 'inOutSine'), key(2.3, -3.6), key(2.56, -4.8, 'inOutSine'), key(3.3, -4.8), key(4.5, 0, 'inOutSine'), key(5.4, 0)]),
  // A slight opposing orbit makes the held question read as a lean inside a floating ring.
  ...orbit('rotation', [key(0, 0), key(0.86, 0), key(1.41, 1.8, 'outCubic'),
    key(1.94, 1.1, 'inOutSine'), key(2.44, 1.1), key(2.9, 1.65, 'inOutSine'),
    key(3.42, 1.65), key(4.78, 0, 'inOutSine'), key(5.4, 0)]),
  ...orbit('position', [key(0, [0, 0]), key(0.86, [0, 0]),
    key(1.4, [0.5, -1.2], 'outCubic'), key(1.94, [0.3, -0.8], 'inOutSine'),
    key(3.42, [0.3, -0.8]), key(4.68, [0, 0], 'inOutSine'), key(5.4, [0, 0])]),
]);
