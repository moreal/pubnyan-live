import { clip, key, track } from '#ir/clip.ts';
import { orbit } from './ring-motion.ts';

/** Curious thought: the eyes ask first, the head cocks, one ear keeps listening. */
export default clip('tilt', { rig: 'pubnyan', duration: 1.2, fps: 60, loop: false }, [
  ...['eye-l.pupil', 'eye-r.pupil'].map((part) => track(part, 'position', [
    key(0, [0, 0]), key(0.1, [-1.8, -1], 'outCubic'), key(0.68, [-1.8, -1]),
    key(0.85, [0, 0], 'inOutCubic'), key(1.2, [0, 0]),
  ])),
  track('head', 'rotation', [
    key(0, 0), key(0.11, 0.9, 'inOutCubic'), key(0.32, -4.7, 'outCubic'),
    key(0.44, -4.1, 'inOutSine'), key(0.7, -4.1),
    key(0.97, 0.6, 'inOutCubic'), key(1.2, 0, 'inOutSine'),
  ]),
  track('head', 'position', [
    key(0, [0, 0]), key(0.11, [0.4, -0.5], 'inOutCubic'),
    key(0.35, [-1.8, 1.5], 'outCubic'), key(0.7, [-1.8, 1.5]),
    key(1, [0.25, -0.2], 'inOutCubic'), key(1.2, [0, 0], 'inOutSine'),
  ]),
  track('ear-l', 'rotation', [
    key(0, 0), key(0.2, 0), key(0.39, -3.5, 'outCubic'),
    key(0.55, -2, 'inOutSine'), key(0.75, -2),
    key(1.03, 0.7, 'inOutCubic'), key(1.2, 0, 'inOutSine'),
  ]),
  track('ear-r', 'rotation', [
    key(0, 0), key(0.17, 0), key(0.34, 2.2, 'outCubic'),
    key(0.49, 0.7, 'inOutSine'), key(0.7, 0.7), key(1.2, 0, 'inOutSine'),
  ]),
  ...orbit('rotation', [key(0, 0), key(0.2, 0), key(0.47, 2, 'outCubic'), key(0.74, 2), key(1.02, -0.4, 'inOutCubic'), key(1.2, 0, 'inOutSine')]),
]);
