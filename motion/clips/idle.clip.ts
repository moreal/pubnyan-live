import { clip, key, track } from '#ir/clip.ts';
import { blink, breath } from './expression-motion.ts';

/** Quiet breath between thoughts. A gaze leads the head; a blink releases it. */
export default clip('idle', { rig: 'pubnyan', duration: 6, fps: 60, loop: true }, [
  ...breath(6, 0.011),
  track('head', 'position', [
    key(0, [0, 0]), key(1.2, [0, 0]), key(1.68, [1.6, -0.8], 'inOutCubic'),
    key(2.5, [1.6, -0.8]), key(3.4, [0, 0], 'inOutSine'), key(6, [0, 0]),
  ]),
  track('head', 'rotation', [
    key(0, 0), key(1.25, 0), key(1.8, -1.8, 'inOutCubic'),
    key(2.5, -1.8), key(3.5, 0, 'inOutSine'), key(6, 0),
  ]),
  ...['eye-l.pupil', 'eye-r.pupil'].map((part) => track(part, 'position', [
    key(0, [0, 0]), key(1.1, [0, 0]), key(1.26, [2.5, -0.6], 'outCubic'),
    key(2.5, [2.5, -0.6]), key(3.2, [0, 0], 'inOutCubic'), key(6, [0, 0]),
  ])),
  ...blink(6, 3.1),
  track('ring-gap-l', 'scale', [key(0, [1, 1]), key(3.3, [0.98, 1], 'inOutSine'), key(6, [1, 1], 'inOutSine')]),
  track('ring-gap-r', 'scale', [key(0, [1, 1]), key(2.7, [1.02, 1], 'inOutSine'), key(6, [1, 1], 'inOutSine')]),
]);
