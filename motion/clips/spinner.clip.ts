import { clip, key, track } from '#ir/clip.ts';

/** Fit the full rotation radius inside the canvas; keep the breathing pulse subtle. */
export default clip('spinner', { rig: 'starorbit', duration: 2, fps: 60, loop: true }, [
  track('star', 'rotation', [key(0, 0), key(2, 360)]),
  track('star', 'scale', [key(0, [0.82, 0.82]), key(1, [0.85, 0.85], 'inOutSine'), key(2, [0.82, 0.82], 'inOutSine')]),
]);
