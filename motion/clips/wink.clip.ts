import { clip, key, track } from '#ir/clip.ts';
import { orbit } from './ring-motion.ts';

/** A shared joke: counter-pose, held wink, and a delayed ear flourish. */
export default clip('wink', { rig: 'pubnyan', duration: 0.95, fps: 60, loop: false }, [
  // Let the upper lid travel toward the lower lid instead of pinching the eye
  // at its centre. The pupil keeps its shape and gaze while the aperture closes.
  track('eye-r.white', 'scale', [
      key(0, [1, 1]), key(0.13, [1, 1]), key(0.23, [0.92, 0.08], 'inOutCubic'),
      key(0.35, [0.92, 0.08]), key(0.57, [1, 1], 'inOutSine'), key(0.95, [1, 1]),
    ]),
  track('eye-r.white', 'position', [
      key(0, [0, 0]), key(0.13, [0, 0]), key(0.23, [0, 4], 'inOutCubic'),
      key(0.35, [0, 4]), key(0.57, [0, 0], 'inOutSine'), key(0.95, [0, 0]),
    ]),
  track('eye-r.pupil', 'opacity', [
    key(0, 1), key(0.215, 1), key(0.23, 0, 'inOutSine'), key(0.35, 0),
    key(0.365, 1, 'inOutSine'), key(0.95, 1),
  ]),
  track('head', 'rotation', [
    key(0, 0), key(0.1, 0.9, 'inOutCubic'), key(0.25, -4, 'outCubic'),
    key(0.43, -4), key(0.69, 0.55, 'inOutCubic'), key(0.95, 0, 'inOutSine'),
  ]),
  track('head', 'position', [
    key(0, [0, 0]), key(0.1, [-0.5, -0.7], 'inOutCubic'),
    key(0.27, [1.4, 2], 'outCubic'), key(0.43, [1.4, 2]),
    key(0.7, [-0.2, -0.4], 'inOutCubic'), key(0.95, [0, 0], 'inOutSine'),
  ]),
  track('torso', 'rotation', [
    key(0, 0), key(0.12, 0.2, 'inOutCubic'), key(0.3, -0.7, 'outCubic'),
    key(0.45, -0.7), key(0.74, 0.12, 'inOutCubic'), key(0.95, 0, 'inOutSine'),
  ]),
  track('ear-r', 'rotation', [
    key(0, 0), key(0.18, 0), key(0.32, -4.5, 'outCubic'),
    key(0.49, 1.2, 'inOutCubic'), key(0.66, -0.4, 'inOutSine'), key(0.95, 0, 'inOutSine'),
  ]),
  ...orbit('rotation', [key(0, 0), key(0.2, 0), key(0.42, 1.5, 'outCubic'), key(0.53, 1.5), key(0.78, -0.35, 'inOutCubic'), key(0.95, 0, 'inOutSine')]),
]);
