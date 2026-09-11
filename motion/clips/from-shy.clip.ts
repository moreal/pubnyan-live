import { clip, key, track } from '#ir/clip.ts';
import { sourceEyeTransition } from './expression-motion.ts';

/** A brief closed blink preserves the source shy contours during the topology change. */
const EYE_DELAY = 2 / 60;

const mouth = track('mouth', 'shape', [key(0, 'shy'), key(0.4, 'normal', 'easeInOut')]);
const morph = (part: string) => track(part, 'shape', [key(EYE_DELAY, 'shy'), key(0.4, 'normal', 'easeInOut')]);

export default clip('from-shy', { rig: 'pubnyan', duration: 0.4, fps: 60, loop: false }, [
  mouth,
  ...sourceEyeTransition('shy', 'normal'),
  morph('nose'),

  // Ease into a small release accent from the expression's resting pose.
  track('head', 'rotation', [key(0, 0), key(0.15, -1, 'inOutCubic'), key(0.4, 0, 'inOutCubic')]),
  track('head', 'position', [key(0, [0, 0]), key(0.15, [-1, 0.5], 'inOutCubic'), key(0.4, [0, 0], 'inOutCubic')]),
]);
