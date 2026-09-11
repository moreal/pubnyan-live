import { clip, key, track } from '#ir/clip.ts';

/** A soft blink conceals the topology change into the tear-filled source eyes. */
const EYE_DELAY = 2 / 60;

const mouth = track('mouth', 'shape', [key(0, 'normal'), key(0.4, 'cry', 'easeInOut')]);
const morph = (part: string) => track(part, 'shape', [key(EYE_DELAY, 'normal'), key(0.4, 'cry', 'easeInOut')]);
const eyes = ['eye-l.white', 'eye-r.white', 'eye-l.pupil', 'eye-r.pupil'];

export default clip('to-cry', { rig: 'pubnyan', duration: 0.4, fps: 60, loop: false }, [
  mouth,
  // Normal and cry eye paths have different topology. Their short crossfade
  // happens only during the closed hold; pupils disappear before it starts.
  ...eyes.flatMap(part => [
    track(part, 'shape', [key(0, 'normal'), key(0.1, 'normal'),
      key(0.15, 'cry', 'inOutCubic'), key(0.4, 'cry')]),
    ...(!part.endsWith('.white') ? [] : [track(part, 'scale', [key(0, [1, 1]), key(1 / 60, [1, 1]),
      key(0.1, [1, 0.08], 'easeIn'), key(0.15, [1, 0.08]),
      key(1 / 3, [1, 1], 'inOutSine'), key(0.4, [1, 1])])]),
  ]),
  ...eyes.filter(part => part.endsWith('.pupil')).map(part => track(part, 'opacity', [
    key(0, 1), key(0.085, 1), key(0.1, 0, 'inOutSine'),
    key(0.15, 0), key(1 / 6, 1, 'inOutSine'), key(0.4, 1),
  ])),
  morph('tear-l'),
  morph('tear-r'),
  morph('nose'),

  // head accent: dips down and tilts, returning to rest by the last key
  track('head', 'position', [key(0, [0, 0]), key(0.2, [0, 3], 'easeOut'), key(0.4, [0, 0], 'outCubic')]),
  track('head', 'rotation', [key(0, 0), key(0.2, 1.5, 'easeOut'), key(0.4, 0, 'outCubic')]),
]);
