import { clip, key, track } from '#ir/clip.ts';

/** Loading spinner: the star turns once per cycle and breathes; the ring holds still. */
export default clip('spinner', { rig: 'starorbit', duration: 2, fps: 30, loop: true }, [
  track('star', 'rotation', [key(0, 0), key(2, 360)]),
  track('star', 'scale', [key(0, [1, 1]), key(1, [1.12, 1.12], 'inOutSine'), key(2, [1, 1], 'inOutSine')]),
]);
