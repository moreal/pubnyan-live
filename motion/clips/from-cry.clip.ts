import { clip, key, track } from '#ir/clip.ts';

/** A soft blink conceals the topology change back from the tear-filled source eyes. */
const EYE_DELAY = 2 / 60;

const mouth = track('mouth', 'shape', [key(0, 'cry'), key(0.4, 'normal', 'easeInOut')]);
const morph = (part: string) => track(part, 'shape', [key(EYE_DELAY, 'cry'), key(0.4, 'normal', 'easeInOut')]);
const eyes = ['eye-l.white', 'eye-r.white', 'eye-l.pupil', 'eye-r.pupil'];

export default clip('from-cry', { rig: 'pubnyan', duration: 0.4, fps: 60, loop: false }, [
  mouth,
  // Normal and cry eye paths have different topology. Their short crossfade
  // happens only during the closed hold; pupils disappear before it starts.
  ...eyes.flatMap(part => [
    track(part, 'shape', [key(0, 'cry'), key(0.1, 'cry'),
      key(0.15, 'normal', 'inOutCubic'), key(0.4, 'normal')]),
    track(part, 'scale', [key(0, [1, 1]), key(1 / 60, [1, 1]),
      key(0.1, [1, 0.08], 'easeIn'), key(0.15, [1, 0.08]),
      key(1 / 3, [1, 1], 'outCubic'), key(0.4, [1, 1])]),
  ]),
  ...eyes.filter(part => part.endsWith('.pupil')).map(part => track(part, 'opacity', [
    key(0, 1), key(1 / 30, 1), key(1 / 12, 0, 'easeIn'),
    key(1 / 6, 0), key(0.2, 1, 'outCubic'), key(0.4, 1),
  ])),
  morph('tear-l'),
  morph('tear-r'),
  morph('nose'),

  // Start at the sustained expression's neutral pose; a tiny exhale follows the blink.
  track('head', 'position', [key(0, [0, 0]), key(0.15, [0, 1.5], 'inOutCubic'), key(0.4, [0, 0], 'outCubic')]),
  track('head', 'rotation', [key(0, 0), key(0.15, 0.6, 'inOutCubic'), key(0.4, 0, 'outCubic')]),
]);
