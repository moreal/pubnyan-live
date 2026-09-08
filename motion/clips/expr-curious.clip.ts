import { clip, key, track } from '#ir/clip.ts';
import { blink, expressionShapes } from './expression-motion.ts';

/** Eyes notice first; a tiny recoil prepares a lifted, held inquisitive tilt. */
export default clip('expr-curious', { rig: 'pubnyan', duration: 5.4, fps: 60, loop: true }, [
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
  track('body', 'scale', [key(0, [1, 1]), key(0.56, [1, 1]), key(0.76, [1.007, 0.993], 'inOutCubic'), key(1.13, [0.997, 1.012], 'outCubic'), key(1.5, [1, 1.008], 'inOutSine'), key(3.3, [1, 1.008]), key(4.35, [1, 1], 'inOutSine'), key(5.4, [1, 1])]),
  track('body', 'rotation', [key(0, 0), key(0.7, 0), key(1.2, -1.4, 'outCubic'), key(3.3, -1.4), key(4.4, 0, 'inOutSine'), key(5.4, 0)]),
  track('head', 'position', [key(0, [0, 0]), key(0.57, [0, 0]), key(0.76, [-0.6, 0.8], 'inOutCubic'), key(1.1, [1.7, -3.2], 'outCubic'), key(1.42, [1.5, -2.6], 'inOutSine'), key(3.28, [1.5, -2.6]), key(4.34, [0, 0], 'inOutSine'), key(5.4, [0, 0])]),
  track('head', 'rotation', [key(0, 0), key(0.61, 0), key(0.78, 0.7, 'inOutCubic'), key(1.2, -3.4, 'outCubic'), key(1.52, -2.8, 'inOutSine'), key(2.3, -2.8), key(2.65, -3.4, 'inOutSine'), key(3.3, -3.4), key(4.5, 0, 'inOutSine'), key(5.4, 0)]),
]);
