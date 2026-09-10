import { clip, key, track } from '#ir/clip.ts';
import { sourceEyeTransition } from './expression-motion.ts';

/** A brief closed blink preserves the source angry contours during the topology change. */
const EYE_DELAY = 2 / 60;

const mouth = track('mouth', 'shape', [key(0, 'normal'), key(0.4, 'angry', 'easeInOut')]);
const morph = (part: string) => track(part, 'shape', [key(EYE_DELAY, 'normal'), key(0.4, 'angry', 'easeInOut')]);

export default clip('to-angry', { rig: 'pubnyan', duration: 0.4, fps: 60, loop: false }, [
  mouth,
  ...sourceEyeTransition('normal', 'angry'),
  morph('nose'),

  // head accent: dips down and returns to rest by the last key
  track('head', 'position', [key(0, [0, 0]), key(0.2, [0, -2], 'easeOut'), key(0.4, [0, 0], 'outCubic')]),
]);
