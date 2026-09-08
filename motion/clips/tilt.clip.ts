import { clip, key, track } from '#ir/clip.ts';

/** A question, with a counter-pose before the lean and a readable held thought. */
export default clip('tilt', { rig: 'pubnyan', duration: 1.1, fps: 60, loop: false }, [
  track('head', 'rotation', [
    key(0, 0), key(0.1, 0.65, 'inOutCubic'),
    key(0.34, -3.8, 'outCubic'), key(0.59, -3.8),
    key(0.86, 0.45, 'inOutCubic'), key(1.1, 0, 'inOutSine'),
  ]),
  track('head', 'position', [
    key(0, [0, 0]), key(0.1, [0, 0]), key(0.37, [-1, 1], 'outCubic'),
    key(0.59, [-1, 1]), key(1.1, [0, 0], 'inOutSine'),
  ]),
]);
