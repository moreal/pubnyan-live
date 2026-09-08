import { clip, key, track } from '#ir/clip.ts';
import { expressionShapes } from './expression-motion.ts';

/** Look away, tuck into the shoulders, then risk one timid peek before relaxing. */
export default clip('expr-shy', { rig: 'pubnyan', duration: 5.6, fps: 60, loop: true }, [
  ...expressionShapes('shy'),
  // Ears settle after the head tucks, then tentatively rise with the peek.
  ...(['ear-l', 'ear-r'] as const).map((part, i) => {
    const angle = i === 0 ? -4 : 3;
    const delay = i * 0.08;
    return track(part, 'rotation', [
      key(0, 0), key(0.72 + delay, 0), key(1.28 + delay, angle, 'outCubic'),
      key(2.65 + delay, angle), key(3.12 + delay, angle * 0.2, 'outCubic'),
      key(3.4 + delay, angle * 0.2), key(3.98 + delay, angle * 0.7, 'inOutSine'),
      key(5.05, 0, 'inOutSine'), key(5.6, 0),
    ]);
  }),
  ...['eye-l.pupil', 'eye-r.pupil'].map((part) => track(part, 'position', [
    key(0, [0, 0]), key(0.32, [0, 0]), key(0.49, [-1, 0.5], 'outCubic'),
    key(2.48, [-1, 0.5]), key(2.68, [0, 0], 'outCubic'),
    key(3.32, [0, 0]), key(3.48, [-0.6, 0.3], 'outCubic'),
    key(4.25, [-0.6, 0.3]), key(4.72, [0, 0], 'inOutSine'), key(5.6, [0, 0]),
  ])),
  track('head', 'position', [key(0, [0, 0]), key(0.5, [0, 0]), key(0.97, [-2.3, 3.5], 'outCubic'), key(1.24, [-2, 3], 'inOutSine'), key(2.6, [-2, 3]), key(2.98, [-0.8, 1.6], 'outCubic'), key(3.4, [-0.8, 1.6]), key(3.72, [-1.5, 2.5], 'inOutSine'), key(4.08, [-1.5, 2.5]), key(4.9, [0, 0], 'inOutSine'), key(5.6, [0, 0])]),
  track('head', 'rotation', [key(0, 0), key(0.54, 0), key(1.13, 3.2, 'outCubic'), key(2.62, 3.2), key(3.03, 1.6, 'outCubic'), key(3.4, 1.6), key(3.83, 2.4, 'inOutSine'), key(4.08, 2.4), key(5, 0, 'inOutSine'), key(5.6, 0)]),
  track('body', 'rotation', [key(0, 0), key(0.64, 0), key(1.26, 1.5, 'outCubic'), key(3.9, 1.5), key(4.85, 0, 'inOutSine'), key(5.6, 0)]),
  track('body', 'scale', [key(0, [1, 1]), key(0.56, [1, 1]), key(1.1, [1.01, 0.99], 'outCubic'), key(2.58, [1.01, 0.99]), key(3, [1.004, 0.997], 'inOutSine'), key(3.45, [1.004, 0.997]), key(3.86, [1.008, 0.993], 'inOutSine'), key(4.95, [1, 1], 'inOutSine'), key(5.6, [1, 1])]),
]);
