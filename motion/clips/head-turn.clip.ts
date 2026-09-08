import { clip, key, track } from '#ir/clip.ts';
import { blink } from './expression-motion.ts';

/** Notice off-screen: eyes lead, head follows on an arc, blink releases the look. */
export default clip('head-turn', { rig: 'pubnyan', duration: 1.4, fps: 60, loop: false }, [
  ...['eye-l.pupil', 'eye-r.pupil'].map((part) => track(part, 'position', [
    key(0, [0, 0]), key(0.14, [3, -0.5], 'outCubic'), key(0.72, [3, -0.5]),
    key(0.91, [0, 0], 'inOutCubic'), key(1.4, [0, 0]),
  ])),
  track('head', 'rotation', [
    key(0, 0), key(0.1, 0), key(0.38, -2.8, 'outCubic'),
    key(0.72, -2.8), key(1.1, 0.3, 'inOutCubic'), key(1.4, 0, 'inOutSine'),
  ]),
  track('head', 'position', [
    key(0, [0, 0]), key(0.1, [0, 0]), key(0.36, [3, 0.8], 'outCubic'),
    key(0.72, [3, 0.8]), key(1.12, [-0.3, 0], 'inOutCubic'), key(1.4, [0, 0], 'inOutSine'),
  ]),
  ...blink(1.4, 0.77),
]);
