import { clip, key, track } from '#ir/clip.ts';

/** Held cry expression: eyes, pupils, nose, mouth, and tears switch to their cry shapes. */
export default clip('expr-cry', { rig: 'pubnyan', duration: 0.1, fps: 60, loop: true }, [
  track('eye-l.white', 'shape', [key(0, 'cry')]),
  track('eye-r.white', 'shape', [key(0, 'cry')]),
  track('eye-l.pupil', 'shape', [key(0, 'cry')]),
  track('eye-r.pupil', 'shape', [key(0, 'cry')]),
  track('tear-l', 'shape', [key(0, 'cry')]),
  track('tear-r', 'shape', [key(0, 'cry')]),
  track('nose', 'shape', [key(0, 'cry')]),
  track('mouth', 'shape', [key(0, 'cry')]),
]);
