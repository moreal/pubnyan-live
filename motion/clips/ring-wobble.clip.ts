import { clip, key, track } from '#ir/clip.ts';
import { blink } from './expression-motion.ts';
import { orbit } from './ring-motion.ts';

/** Something moved below: look down, follow the ring, blink as it comes to rest. */
export default clip('ring-wobble', { rig: 'pubnyan', duration: 1.8, fps: 60, loop: false }, [
  // Balance the whole cat against the orbital roll. The head follows the
  // glance while the torso counterleans, so the ring has visible weight.
  track('torso', 'rotation', [
    key(0, 0), key(0.18, 0), key(0.34, 0.7, 'inOutCubic'),
    key(0.61, -3.2, 'outCubic'), key(0.76, -2.7, 'inOutSine'),
    key(1.06, 2.1, 'inOutCubic'), key(1.34, -0.7, 'inOutCubic'),
    key(1.63, 0.15, 'inOutSine'), key(1.8, 0, 'inOutSine'),
  ]),
  track('torso', 'position', [
    key(0, [0, 0]), key(0.21, [0, 0]), key(0.35, [-0.6, 0.8], 'inOutCubic'),
    key(0.62, [2.5, -2], 'outCubic'), key(0.78, [2.1, -1.6], 'inOutSine'),
    key(1.09, [-1.7, 1.2], 'inOutCubic'), key(1.38, [0.5, -0.4], 'inOutCubic'),
    key(1.8, [0, 0], 'inOutSine'),
  ]),
  ...orbit('rotation', [
    key(0, 0), key(0.22, 0), key(0.34, -1, 'inOutCubic'),
    key(0.58, 6, 'outCubic'), key(0.75, 5.2, 'inOutSine'),
    key(1.04, -3.8, 'inOutCubic'), key(1.32, 1.3, 'inOutCubic'),
    key(1.58, -0.2, 'inOutSine'), key(1.8, 0, 'inOutSine'),
  ]),
  ...orbit('position', [
    key(0, [0, 0]), key(0.28, [0, 0]), key(0.58, [0, -2], 'outCubic'),
    key(1.02, [0, 1], 'inOutCubic'), key(1.38, [0, -0.3], 'inOutSine'),
    key(1.8, [0, 0], 'inOutSine'),
  ]),
  ...['eye-l.pupil', 'eye-r.pupil'].map(part => track(part, 'position', [
    key(0, [0, 0]), key(0.15, [2, 2], 'outCubic'), key(0.74, [2, 2]),
    key(0.88, [-1.5, 1.5], 'outCubic'), key(1.16, [-1.5, 1.5]),
    key(1.31, [0, 0], 'inOutCubic'), key(1.8, [0, 0]),
  ])),
  track('head', 'position', [
    key(0, [0, 0]), key(0.16, [0, 0]), key(0.4, [1.5, 3], 'outCubic'),
    key(0.77, [1.5, 3]), key(1.11, [-1, 2], 'inOutCubic'),
    key(1.5, [0, -0.3], 'inOutCubic'), key(1.8, [0, 0], 'inOutSine'),
  ]),
  track('head', 'rotation', [
    key(0, 0), key(0.18, 0), key(0.43, -2.8, 'outCubic'), key(0.78, -2.8),
    key(1.12, 2.2, 'inOutCubic'), key(1.5, -0.3, 'inOutCubic'), key(1.8, 0, 'inOutSine'),
  ]),
  track('ear-r', 'rotation', [
    key(0, 0), key(0.3, 0), key(0.55, -3.2, 'outCubic'),
    key(0.84, -1.4, 'inOutSine'), key(1.2, 2, 'inOutCubic'), key(1.8, 0, 'inOutSine'),
  ]),
  track('ear-l', 'rotation', [
    key(0, 0), key(0.38, 0), key(0.66, 2.5, 'outCubic'),
    key(0.87, 1.4, 'inOutSine'), key(1.24, -1.6, 'inOutCubic'),
    key(1.57, 0.4, 'inOutSine'), key(1.8, 0, 'inOutSine'),
  ]),
  ...blink(1.8, 1.18),
]);
