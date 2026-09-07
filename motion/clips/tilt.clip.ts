import { clip, key, track } from '#ir/clip.ts';

/**
 * Tilt, 0.9 s, non-loop. The head rotates into a curious tilt, holds, and
 * returns through a small counter-swing before settling.
 */
export default clip('tilt', { rig: 'pubnyan', duration: 0.9, fps: 60, loop: false }, [
  track('head', 'rotation', [
    key(0, 0),
    key(0.35, -6, 'inOutCubic'),
    key(0.5, -6),
    key(0.75, 1, 'inOutCubic'),
    key(0.9, 0, 'inOutCubic'),
  ]),
]);
