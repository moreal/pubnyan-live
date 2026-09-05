import { clip, key, track } from '#ir/clip.ts';

/** Held curious expression: eyes, pupils, nose, and mouth switch to their curious shapes. */
export default clip('expr-curious', { rig: 'pubnyan', duration: 0.1, fps: 30, loop: true }, [
  track('eye-l.white', 'shape', [key(0, 'curious')]),
  track('eye-r.white', 'shape', [key(0, 'curious')]),
  track('eye-l.pupil', 'shape', [key(0, 'curious')]),
  track('eye-r.pupil', 'shape', [key(0, 'curious')]),
  track('nose', 'shape', [key(0, 'curious')]),
  track('mouth', 'shape', [key(0, 'curious')]),
]);
