import { clip, key, track } from '#ir/clip.ts';

/**
 * Transition into curious, 0.4 s at 60 fps, non-loop. The mouth leads the change; the eyes,
 * pupils, and nose morph starting 2 frames (0.033 s) later. The head tilts slightly and
 * returns to rest by the last key.
 */
const EYE_DELAY = 2 / 60;

const mouth = track('mouth', 'shape', [key(0, 'normal'), key(0.4, 'curious', 'easeInOut')]);
const morph = (part: string) => track(part, 'shape', [key(EYE_DELAY, 'normal'), key(0.4, 'curious', 'easeInOut')]);

export default clip('to-curious', { rig: 'pubnyan', duration: 0.4, fps: 60, loop: false }, [
  mouth,
  morph('eye-l.white'),
  morph('eye-r.white'),
  morph('eye-l.pupil'),
  morph('eye-r.pupil'),
  morph('nose'),

  // head accent: tilts and returns to rest by the last key
  track('head', 'rotation', [key(0, 0), key(0.2, -3, 'easeOut'), key(0.4, 0, 'outCubic')]),
]);
