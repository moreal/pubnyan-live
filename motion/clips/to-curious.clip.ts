import { clip, key, track } from '#ir/clip.ts';
import { sourceEyeTransition } from './expression-motion.ts';

/** A brief closed blink preserves the source curious contours during the topology change. */
const EYE_DELAY = 2 / 60;

const mouth = track('mouth', 'shape', [key(0, 'normal'), key(0.4, 'curious', 'easeInOut')]);
const morph = (part: string) => track(part, 'shape', [key(EYE_DELAY, 'normal'), key(0.4, 'curious', 'easeInOut')]);

export default clip('to-curious', { rig: 'pubnyan', duration: 0.4, fps: 60, loop: false }, [
  mouth,
  ...sourceEyeTransition('normal', 'curious'),
  morph('nose'),

  // head accent: tilts and returns to rest by the last key
  track('head', 'rotation', [key(0, 0), key(0.2, -3, 'easeOut'), key(0.4, 0, 'outCubic')]),
]);
