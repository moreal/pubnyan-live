import { clip, key, track } from '#ir/clip.ts';

/**
 * Transition into angry, 0.4 s at 60 fps, non-loop. The mouth leads the change; the eyes,
 * pupils, and nose morph starting 2 frames (0.033 s) later so the shift reads as one gesture.
 * The head dips slightly and returns to rest by the last key.
 */
const EYE_DELAY = 2 / 60;

const mouth = track('mouth', 'shape', [key(0, 'normal'), key(0.4, 'angry', 'easeInOut')]);
const morph = (part: string) => track(part, 'shape', [key(EYE_DELAY, 'normal'), key(0.4, 'angry', 'easeInOut')]);

export default clip('to-angry', { rig: 'pubnyan', duration: 0.4, fps: 60, loop: false }, [
  mouth,
  morph('eye-l.white'),
  morph('eye-r.white'),
  morph('eye-l.pupil'),
  morph('eye-r.pupil'),
  morph('nose'),

  // head accent: dips down and returns to rest by the last key
  track('head', 'position', [key(0, [0, 0]), key(0.2, [0, -2], 'easeOut'), key(0.4, [0, 0], 'outCubic')]),
]);
