import { clip, key, track } from '#ir/clip.ts';
import { blink, breath } from './expression-motion.ts';
import { orbit } from './ring-motion.ts';

/** Hear something, look, listen harder, then blink the thought away. */
export default clip('idle', { rig: 'pubnyan', duration: 6, fps: 60, loop: true }, [
  ...breath(6, 0.011),
  // A listening pose starts in the chest, not a floating cut-out head.
  // The torso follows the eyes; the ring counterbalances after the lean.
  track('torso', 'rotation', [
    key(0, 0), key(1.18, 0), key(1.35, 0.45, 'inOutCubic'),
    key(1.78, -1.8, 'outCubic'), key(2.1, -1.4, 'inOutSine'),
    key(2.45, -1.4), key(2.84, -2.2, 'inOutCubic'), key(3.18, -2.2),
    key(3.85, 0.4, 'inOutCubic'), key(4.4, 0, 'inOutSine'), key(6, 0),
  ]),
  track('torso', 'position', [
    key(0, [0, 0]), key(1.22, [0, 0]), key(1.4, [-0.5, 0.6], 'inOutCubic'),
    key(1.86, [1.8, -1.8], 'outCubic'), key(2.2, [1.4, -1.3], 'inOutSine'),
    key(3.2, [1.4, -1.3]), key(3.9, [-0.3, 0.3], 'inOutCubic'),
    key(4.5, [0, 0], 'inOutSine'), key(6, [0, 0]),
  ]),
  track('head', 'position', [
    key(0, [0, 0]), key(1.18, [0, 0]), key(1.32, [-0.5, 0.7], 'inOutCubic'),
    key(1.62, [2.6, -2.4], 'outCubic'), key(1.88, [2.2, -1.8], 'inOutSine'),
    key(2.42, [2.2, -1.8]), key(2.7, [2.7, -2.5], 'inOutCubic'),
    key(3.12, [2.7, -2.5]), key(3.51, [-0.3, 0.7], 'inOutCubic'),
    key(3.92, [0, 0], 'inOutSine'), key(6, [0, 0]),
  ]),
  track('head', 'rotation', [
    key(0, 0), key(1.22, 0), key(1.35, 0.7, 'inOutCubic'),
    key(1.68, -3.6, 'outCubic'), key(1.97, -2.8, 'inOutSine'),
    key(2.43, -2.8), key(2.76, -3.8, 'inOutCubic'), key(3.12, -3.8),
    key(3.64, 0.5, 'inOutCubic'), key(4.06, 0, 'inOutSine'), key(6, 0),
  ]),
  ...['eye-l.pupil', 'eye-r.pupil'].map((part) => track(part, 'position', [
    key(0, [0, 0]), key(1.04, [0, 0]), key(1.18, [2.5, -0.6], 'outCubic'),
    key(2.36, [2.5, -0.6]), key(2.48, [1.5, -1], 'outCubic'),
    key(3.15, [1.5, -1]), key(3.3, [0, 0], 'inOutCubic'), key(6, [0, 0]),
  ])),
  ...blink(6, 3.15),
  track('ear-r', 'rotation', [
    key(0, 0), key(0.92, 0), key(1.08, -4.8, 'outCubic'),
    key(1.34, 0.8, 'inOutCubic'), key(1.75, -2.3, 'outCubic'),
    key(2.48, -2.3), key(2.87, -3.8, 'outCubic'), key(3.18, -3.8),
    key(3.8, 0.6, 'inOutCubic'), key(4.18, 0, 'inOutSine'), key(6, 0),
  ]),
  track('ear-l', 'rotation', [
    key(0, 0), key(1.38, 0), key(1.79, 2.8, 'outCubic'),
    key(2.06, 1.5, 'inOutSine'), key(3.27, 1.5),
    key(3.86, -0.5, 'inOutCubic'), key(4.25, 0, 'inOutSine'), key(6, 0),
  ]),
  // The cat leans first; the complete ring answers gently, then rests.
  ...orbit('rotation', [
    key(0, 0), key(1.42, 0), key(1.96, 2.6, 'inOutSine'),
    key(2.5, 1.8, 'inOutSine'), key(2.94, 2.8, 'inOutSine'),
    key(3.25, 2.8), key(3.96, -0.8, 'inOutCubic'),
    key(4.62, 0, 'inOutSine'), key(6, 0),
  ]),
  ...orbit('position', [
    key(0, [0, 0]), key(1.5, [0, 0]), key(2.14, [0, -1], 'inOutSine'),
    key(3.25, [0, -1]), key(4.15, [0, 0.3], 'inOutSine'),
    key(4.8, [0, 0], 'inOutSine'), key(6, [0, 0]),
  ]),
]);
