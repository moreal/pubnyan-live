import { clip, key, track } from '#ir/clip.ts';
import { orbit } from './ring-motion.ts';
import { blink } from './expression-motion.ts';

/** A decisive yes: lift, quick closed-eye dip, then a smaller buoyant recovery. */
export default clip('nod', { rig: 'pubnyan', duration: 0.85, fps: 60, loop: false }, [
  track('head', 'position', [
    key(0, [0, 0]), key(0.1, [0, -2.2], 'inOutCubic'),
    key(0.24, [0, 6.5], 'inOutCubic'), key(0.3, [0, 6.5]),
    key(0.49, [0, -1.4], 'outCubic'), key(0.63, [0, 0.5], 'inOutSine'),
    key(0.85, [0, 0], 'inOutSine'),
  ]),
  track('torso', 'position', [
    key(0, [0, 0]), key(0.14, [0, -0.4], 'inOutCubic'),
    key(0.29, [0, 1.4], 'inOutCubic'), key(0.54, [0, -0.3], 'outCubic'),
    key(0.85, [0, 0], 'inOutSine'),
  ]),
  ...['ear-l', 'ear-r'].map((part, i) => track(part, 'rotation', [
    key(0, 0), key(0.12 + i * 0.02, i ? -1 : 1, 'inOutCubic'),
    key(0.29 + i * 0.02, i ? 3.8 : -3.2, 'outCubic'),
    key(0.49 + i * 0.02, i ? -1.5 : 1.2, 'inOutCubic'),
    key(0.67 + i * 0.02, i ? 0.4 : -0.3, 'inOutSine'),
    key(0.85, 0, 'inOutSine'),
  ])),
  ...blink(0.85, 0.13),
  ...orbit('rotation', [key(0, 0), key(0.18, 0), key(0.38, 1.8, 'outCubic'), key(0.62, -0.65, 'inOutCubic'), key(0.85, 0, 'inOutSine')]),
]);
