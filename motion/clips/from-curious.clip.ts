import { clip, key, track } from '#ir/clip.ts';
import { sourceEyeTransition } from './expression-motion.ts';

/** A brief closed blink preserves the source curious contours during the topology change. */
const EYE_DELAY = 2 / 60;

const mouth = track('mouth', 'shape', [key(0, 'curious'), key(0.4, 'normal', 'easeInOut')]);
const morph = (part: string) => track(part, 'shape', [key(EYE_DELAY, 'curious'), key(0.4, 'normal', 'easeInOut')]);

export default clip('from-curious', { rig: 'pubnyan', duration: 0.4, fps: 60, loop: false }, [
  mouth,
  ...sourceEyeTransition('curious', 'normal'),
  morph('nose'),

  // head accent: mirrors to-curious's tilt, back to rest on inOutCubic
  track('head', 'rotation', [key(0, -3), key(0.4, 0, 'inOutCubic')]),
]);
