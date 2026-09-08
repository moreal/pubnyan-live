import { clip, key, track } from '#ir/clip.ts';
import { expressionShapes } from './expression-motion.ts';

/** A caught breath, two unequal sobs, then a long tired exhale. */
export default clip('expr-cry', { rig: 'pubnyan', duration: 4.8, fps: 60, loop: true }, [
  ...expressionShapes('cry'),
  track('body', 'scale', [
    key(0, [1, 1]), key(0.43, [1, 1]), key(0.66, [0.995, 1.012], 'inOutCubic'),
    key(0.83, [1.014, 0.984], 'outCubic'), key(1.16, [0.997, 1.008], 'outCubic'),
    key(1.4, [0.997, 1.008]), key(1.58, [1.009, 0.991], 'outCubic'),
    key(1.92, [1.004, 0.998], 'outCubic'), key(2.45, [1.008, 0.994], 'inOutSine'),
    key(3.85, [1, 1], 'inOutSine'), key(4.8, [1, 1]),
  ]),
  track('head', 'position', [
    key(0, [0, 0]), key(0.45, [0, 0]), key(0.66, [0, -1], 'inOutCubic'),
    key(0.9, [-0.7, 3.8], 'outCubic'), key(1.2, [-0.3, 0.7], 'outCubic'),
    key(1.42, [-0.3, 0.7]), key(1.65, [0.5, 2.7], 'outCubic'),
    key(1.97, [0.2, 1.6], 'outCubic'), key(2.5, [-0.5, 2.4], 'inOutSine'),
    key(3.95, [0, 0], 'inOutSine'), key(4.8, [0, 0]),
  ]),
  track('head', 'rotation', [key(0, 0), key(0.65, 0), key(0.97, -1.5, 'outCubic'), key(1.27, -0.8, 'inOutSine'), key(1.45, -0.8), key(1.74, 0.8, 'outCubic'), key(2.48, -1, 'inOutSine'), key(3.95, 0, 'inOutSine'), key(4.8, 0)]),
  ...(['tear-l', 'tear-r'] as const).flatMap((part, i) => {
    const delay = i * 0.43;
    return [
      track(part, 'position', [key(0, [0, 0]), key(0.73 + delay, [0, 0]),
        key(2.03 + delay, [0, 7], 'easeIn'), key(2.2 + delay, [0, 7]),
        key(2.3 + delay, [0, 0]), key(4.8, [0, 0])]),
      track(part, 'opacity', [key(0, 1), key(1.64 + delay, 1),
        key(2.03 + delay, 0, 'inOutSine'), key(2.36 + delay, 0),
        key(3.05 + delay, 1, 'inOutSine'), key(4.8, 1)]),
    ];
  }),
]);
