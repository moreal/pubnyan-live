import { clip, key, track } from '#ir/clip.ts';
import { sourceEyeTransition } from './expression-motion.ts';

/** A brief closed blink preserves the source angry contours during the topology change. */
const EYE_DELAY = 2 / 60;

const mouth = track('mouth', 'shape', [key(0, 'angry'), key(0.4, 'normal', 'easeInOut')]);
const morph = (part: string) => track(part, 'shape', [key(EYE_DELAY, 'angry'), key(0.4, 'normal', 'easeInOut')]);

export default clip('from-angry', { rig: 'pubnyan', duration: 0.4, fps: 60, loop: false }, [
  mouth,
  ...sourceEyeTransition('angry', 'normal'),
  morph('nose'),

  // head accent: mirrors to-angry's dip, back to rest on inOutCubic
  track('head', 'position', [key(0, [0, -2]), key(0.4, [0, 0], 'inOutCubic')]),
]);
