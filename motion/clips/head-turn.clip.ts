import { clip, key, track } from '#ir/clip.ts';
import { orbit } from './ring-motion.ts';
import { blink } from './expression-motion.ts';

/** Notice off-screen: eye dart, head arc, attentive hold, blink and trailing ears. */
export default clip('head-turn', { rig: 'pubnyan', duration: 1.4, fps: 60, loop: false }, [
  ...['eye-l.pupil', 'eye-r.pupil'].map((part) => track(part, 'position', [
    key(0, [0, 0]), key(0.03, [0, 0]), key(0.12, [3, -0.6], 'outCubic'),
    key(0.76, [3, -0.6]), key(0.93, [0, 0], 'inOutCubic'), key(1.4, [0, 0]),
  ])),
  track('head', 'rotation', [
    key(0, 0), key(0.09, 0), key(0.16, 0.5, 'inOutCubic'),
    key(0.36, -3.8, 'outCubic'), key(0.49, -3.3, 'inOutSine'),
    key(0.76, -3.3), key(1.13, 0.5, 'inOutCubic'), key(1.4, 0, 'inOutSine'),
  ]),
  track('head', 'position', [
    key(0, [0, 0]), key(0.09, [0, 0]), key(0.17, [-0.8, -0.8], 'inOutCubic'),
    key(0.34, [4, 0.2], 'outCubic'), key(0.46, [3.5, 1.2], 'inOutSine'),
    key(0.76, [3.5, 1.2]), key(1.15, [-0.5, -0.3], 'inOutCubic'),
    key(1.4, [0, 0], 'inOutSine'),
  ]),
  track('ear-r', 'rotation', [
    key(0, 0), key(0.13, 0), key(0.3, -3.5, 'outCubic'),
    key(0.46, 1, 'inOutCubic'), key(0.62, -0.5, 'inOutSine'),
    key(0.79, -0.5), key(1.17, 0.7, 'inOutCubic'), key(1.4, 0, 'inOutSine'),
  ]),
  track('ear-l', 'rotation', [
    key(0, 0), key(0.23, 0), key(0.43, 2.5, 'outCubic'),
    key(0.62, 0.6, 'inOutSine'), key(0.79, 0.6),
    key(1.2, -0.5, 'inOutCubic'), key(1.4, 0, 'inOutSine'),
  ]),
  ...blink(1.4, 0.8),
  ...orbit('rotation', [key(0, 0), key(0.22, 0), key(0.52, 1.6, 'outCubic'), key(0.83, 1.6), key(1.18, -0.35, 'inOutCubic'), key(1.4, 0, 'inOutSine')]),
]);
