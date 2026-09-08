import { clip, key, track } from '#ir/clip.ts';
import { blink } from './expression-motion.ts';

/** A conspiratorial wink: lean into the closed eye, hold, and softly release. */
export default clip('wink', { rig: 'pubnyan', duration: 0.9, fps: 60, loop: false }, [
  ...blink(0.9, 0.14, 'right'),
  track('head', 'rotation', [
    key(0, 0), key(0.09, 0.5, 'inOutCubic'), key(0.25, -3, 'outCubic'),
    key(0.38, -3), key(0.65, 0.3, 'inOutCubic'), key(0.9, 0, 'inOutSine'),
  ]),
  track('head', 'position', [
    key(0, [0, 0]), key(0.09, [0, 0]), key(0.25, [0, 1.5], 'outCubic'),
    key(0.38, [0, 1.5]), key(0.9, [0, 0], 'inOutSine'),
  ]),
]);
