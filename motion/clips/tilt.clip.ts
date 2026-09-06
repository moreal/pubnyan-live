import { clip, key, track } from '#ir/clip.ts';

/**
 * Tilt, 0.8 s, non-loop. A curious head tilt: the whole body rotates a few
 * degrees and returns.
 */
export default clip('tilt', { rig: 'pubnyan', duration: 0.8, fps: 30, loop: false }, [
  track('body', 'rotation', [
    key(0, 0),
    key(0.35, 6, 'easeOut'),
    key(0.8, 0, 'inOutSine'),
  ]),
]);
