import { clip, key, track } from '#ir/clip.ts';

/**
 * Transition out of shy back to normal, 0.4 s at 60 fps, non-loop. The mouth leads the
 * change; the eyes, pupils, and nose morph starting 2 frames (0.033 s) later. The head's
 * accent mirrors `to-shy`'s tilt and shift back to zero on `inOutCubic`.
 */
const EYE_DELAY = 2 / 60;

const mouth = track('mouth', 'shape', [key(0, 'shy'), key(0.4, 'normal', 'easeInOut')]);
const morph = (part: string) => track(part, 'shape', [key(EYE_DELAY, 'shy'), key(0.4, 'normal', 'easeInOut')]);

export default clip('from-shy', { rig: 'pubnyan', duration: 0.4, fps: 60, loop: false }, [
  mouth,
  morph('eye-l.white'),
  morph('eye-r.white'),
  morph('eye-l.pupil'),
  morph('eye-r.pupil'),
  morph('nose'),

  // head accent: mirrors to-shy's tilt and shift, back to rest on inOutCubic
  track('head', 'rotation', [key(0, -2), key(0.4, 0, 'inOutCubic')]),
  track('head', 'position', [key(0, [-2, 1]), key(0.4, [0, 0], 'inOutCubic')]),
]);
