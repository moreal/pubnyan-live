import { clip, key, track } from '#ir/clip.ts';
import { blink } from './expression-motion.ts';

/** Agree: prepare up, accent down with closed eyes, then recover with drag. */
export default clip('nod', { rig: 'pubnyan', duration: 0.8, fps: 60, loop: false }, [
  track('head', 'position', [
    key(0, [0, 0]), key(0.1, [0, -1.5], 'inOutCubic'),
    key(0.27, [0, 5], 'inOutCubic'), key(0.32, [0, 5]),
    key(0.54, [0, -0.7], 'outCubic'), key(0.8, [0, 0], 'inOutSine'),
  ]),
  track('body', 'scale', [
    key(0, [1, 1]), key(0.12, [0.998, 1.004], 'inOutCubic'),
    key(0.3, [1.009, 0.985], 'inOutCubic'),
    key(0.56, [0.998, 1.004], 'outCubic'), key(0.8, [1, 1], 'inOutSine'),
  ]),
  ...blink(0.8, 0.16),
]);
