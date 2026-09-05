import { clip, key, track } from '#ir/clip.ts';

/** Held shy expression: eyes, pupils, nose, and mouth switch to their shy shapes. */
export default clip('expr-shy', { rig: 'pubnyan', duration: 0.1, fps: 30, loop: true }, [
  track('eye-l.white', 'shape', [key(0, 'shy')]),
  track('eye-r.white', 'shape', [key(0, 'shy')]),
  track('eye-l.pupil', 'shape', [key(0, 'shy')]),
  track('eye-r.pupil', 'shape', [key(0, 'shy')]),
  track('nose', 'shape', [key(0, 'shy')]),
  track('mouth', 'shape', [key(0, 'shy')]),
]);
