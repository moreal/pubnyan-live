import { clip, key, track } from '#ir/clip.ts';

/**
 * Transition out of cry back to normal, 0.4 s at 60 fps, non-loop. The mouth leads the
 * change; the eyes, pupils, tears, and nose morph starting 2 frames (0.033 s) later. The
 * head's accent mirrors `to-cry`'s dip and tilt back to zero on `inOutCubic`.
 */
const EYE_DELAY = 2 / 60;

const mouth = track('mouth', 'shape', [key(0, 'cry'), key(0.4, 'normal', 'easeInOut')]);
const morph = (part: string) => track(part, 'shape', [key(EYE_DELAY, 'cry'), key(0.4, 'normal', 'easeInOut')]);

export default clip('from-cry', { rig: 'pubnyan', duration: 0.4, fps: 60, loop: false }, [
  mouth,
  morph('eye-l.white'),
  morph('eye-r.white'),
  morph('eye-l.pupil'),
  morph('eye-r.pupil'),
  morph('tear-l'),
  morph('tear-r'),
  morph('nose'),

  // head accent: mirrors to-cry's dip and tilt, back to rest on inOutCubic
  track('head', 'position', [key(0, [0, 3]), key(0.4, [0, 0], 'inOutCubic')]),
  track('head', 'rotation', [key(0, 1.5), key(0.4, 0, 'inOutCubic')]),
]);
