import { clip, key, track } from '#ir/clip.ts';

/**
 * Nod, 0.6 s, non-loop. A small down-and-back dip of the whole body.
 */
export default clip('nod', { rig: 'pubnyan', duration: 0.6, fps: 30, loop: false }, [
  track('body', 'position', [
    key(0, [0, 0]),
    key(0.25, [0, 6], 'easeOut'),
    key(0.6, [0, 0], 'inOutSine'),
  ]),
]);
