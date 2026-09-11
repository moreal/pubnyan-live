import { clip, key as timedKey, track } from '#ir/clip.ts';
import type { EaseName } from '#ir/types.ts';
import { orbit } from './ring-motion.ts';

// Align sharp direction changes with export frames. Mixed transform tracks are
// baked at the clip frame rate, so an off-frame launch would soften the squash.
const key = <V>(t: number, value: V, ease?: EaseName) => timedKey(Math.round(t * 60) / 60, value, ease);

/** A buoyant little yes! Cat rises through its ring; the ring catches up and settles last. */
export default clip('celebrate', { rig: 'pubnyan', duration: 1.5, fps: 60, loop: false }, [
  track('torso', 'position', [
    key(0, [0, 0]), key(0.16, [0, 3], 'inOutCubic'),
    key(0.36, [0, -8], 'outCubic'), key(0.44, [0, -8], 'inOutSine'),
    key(0.65, [0, 2.5], 'inOutCubic'), key(0.86, [0, -2], 'outCubic'),
    key(1.08, [0, 0.5], 'inOutSine'), key(1.32, [0, 0], 'inOutSine'), key(1.5, [0, 0]),
  ]),
  track('torso', 'scale', [
    key(0, [1, 1]), key(0.16, [1.018, 0.982], 'inOutCubic'),
    key(0.32, [0.985, 1.018], 'outCubic'), key(0.47, [1, 1], 'inOutSine'),
    key(0.65, [1.018, 0.982], 'inOutCubic'), key(0.85, [0.995, 1.006], 'outCubic'),
    key(1.16, [1, 1], 'inOutSine'), key(1.5, [1, 1]),
  ]),
  track('head', 'position', [
    key(0, [0, 0]), key(0.18, [0, 1.5], 'inOutCubic'),
    key(0.39, [0, -1], 'outCubic'), key(0.48, [0, -1]),
    key(0.69, [0, 1.2], 'inOutCubic'), key(0.91, [0, -0.5], 'outCubic'),
    key(1.26, [0, 0], 'inOutSine'), key(1.5, [0, 0]),
  ]),
  track('head', 'rotation', [
    key(0, 0), key(0.16, -0.8, 'inOutCubic'), key(0.4, 2.4, 'outCubic'),
    key(0.5, 2.4), key(0.77, -1.1, 'inOutCubic'), key(1.02, 0.4, 'inOutSine'),
    key(1.3, 0, 'inOutSine'), key(1.5, 0),
  ]),
  ...orbit('position', [
    key(0, [0, 0]), key(0.23, [0, 0]), key(0.49, [0, -3], 'outCubic'),
    key(0.77, [0, 1.5], 'inOutCubic'), key(1.03, [0, -0.6], 'inOutCubic'),
    key(1.43, [0, 0], 'inOutSine'), key(1.5, [0, 0]),
  ]),
  ...orbit('rotation', [
    key(0, 0), key(0.24, 0), key(0.48, -3.8, 'outCubic'),
    key(0.78, 2.4, 'inOutCubic'), key(1.07, -0.8, 'inOutCubic'),
    key(1.43, 0, 'inOutSine'), key(1.5, 0),
  ]),
  ...['ear-l', 'ear-r'].map((part, i) => track(part, 'rotation', [
    key(0, 0), key(0.18 + i * 0.03, i ? 3 : -3, 'inOutCubic'),
    key(0.43 + i * 0.03, i ? -5.4 : 4.8, 'outCubic'),
    key(0.73 + i * 0.03, i ? 2.8 : -2.3, 'inOutCubic'),
    key(1.03 + i * 0.03, i ? -0.7 : 0.6, 'inOutSine'),
    key(1.36, 0, 'inOutSine'), key(1.5, 0),
  ])),
  // An unmistakable happy face holds through the apex, then opens brightly.
  track('mouth', 'shape', [
    key(0, 'default'), key(0.12, 'default'), key(0.28, 'happy', 'outCubic'),
    key(0.86, 'happy'), key(1.24, 'default', 'inOutSine'), key(1.5, 'default'),
  ]),
  // Only lids morph. Pupils retain their round shape and hide behind the closed smile.
  // Hold the joyful arch through the landing, then greet the viewer again.
  ...['eye-l.white', 'eye-r.white'].map(part => track(part, 'shape', [
    key(0, 'default'), key(0.16, 'default'), key(0.28, 'happy', 'inOutCubic'),
    key(0.62, 'happy'), key(0.84, 'default', 'inOutCubic'), key(1.5, 'default'),
  ])),
  ...['eye-l.pupil', 'eye-r.pupil'].map(part => track(part, 'opacity', [
    key(0, 1), key(0.27, 1), key(0.28, 0, 'inOutSine'), key(0.62, 0),
    key(0.62 + 1 / 60, 1, 'inOutSine'), key(1.5, 1),
  ])),
]);
