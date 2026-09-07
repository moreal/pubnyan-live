import { clip, key, track } from '#ir/clip.ts';

/**
 * Nod, 0.7 s, non-loop. The head anticipates with a small rise, dips down,
 * and settles with a slight overshoot before returning to rest.
 */
export default clip('nod', { rig: 'pubnyan', duration: 0.7, fps: 60, loop: false }, [
  track('head', 'position', [
    key(0, [0, 0]),
    key(0.12, [0, -1.5], 'inBack'),
    key(0.4, [0, 6], 'outCubic'),
    key(0.58, [0, -1.5], 'outBack'),
    key(0.7, [0, 0], 'outBack'),
  ]),
]);
