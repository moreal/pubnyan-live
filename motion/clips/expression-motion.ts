import { key, track } from '#ir/clip.ts';
import type { Track } from '#ir/types.ts';

/** Shared vocabulary, with timing authored separately for each emotion. */
export function expressionShapes(expression: string): Track[] {
  return ['eye-l.white', 'eye-r.white', 'eye-l.pupil', 'eye-r.pupil',
    'nose', 'mouth', 'tear-l', 'tear-r'].map((part) => track(part, 'shape', [key(0, expression)]));
}

export function breath(duration: number, height = 0.008): Track[] {
  return [track('torso', 'scale', [
    key(0, [1, 1]), key(duration * 0.42, [1.003, 1 + height], 'inOutSine'),
    key(duration, [1, 1], 'inOutSine'),
  ])];
}

/** Fast closure, a readable closed hold, then a softer reopening.
 * Ease out of the closed hold instead of opening a quarter-eye in one frame.
 * Only the white aperture compresses. The unscaled black pupil merges into
 * the opaque black head outside it; conceal it only at the closed-lid seam.
 */
export function blink(duration: number, start: number, side: 'both' | 'right' = 'both'): Track[] {
  const parts = side === 'right' ? ['eye-r.white', 'eye-r.pupil']
    : ['eye-l.white', 'eye-l.pupil', 'eye-r.white', 'eye-r.pupil'];
  return [...parts.filter(part => part.endsWith('.white')).map((part) => track(part, 'scale', [
    key(0, [1, 1]), key(start, [1, 1]),
    key(start + 0.08, [1, 0.08], 'easeIn'),
    key(start + 0.12, [1, 0.08]),
    key(start + 0.3, [1, 1], 'inOutSine'), key(duration, [1, 1]),
  ])), ...parts.filter((part) => part.endsWith('.pupil')).map((part) => track(part, 'opacity', [
    key(0, 1), key(start, 1), key(start + 0.065, 1), key(start + 0.08, 0, 'inOutSine'),
    key(start + 0.12, 0), key(start + 0.135, 1, 'inOutSine'), key(duration, 1),
  ]))];
}

/** Conceal incompatible source eye contours in a closed blink, as in the cry transitions. */
export function sourceEyeTransition(from: string, to: string): Track[] {
  const eyes = ['eye-l.white', 'eye-r.white', 'eye-l.pupil', 'eye-r.pupil'];
  return [
    ...eyes.flatMap(part => [
      // Keep one normal pupil path and fade it only on the normal side of the blink.
      // The source expression has no separate pupil; no empty crossfade layer is needed.
      track(part, 'shape', part.endsWith('.pupil') ? [key(0, 'normal')] : [
        key(0, from), key(0.1, from), key(0.15, to, 'inOutCubic'), key(0.4, to)]),
      ...(!part.endsWith('.white') ? [] : [track(part, 'scale', [key(0, [1, 1]), key(1 / 60, [1, 1]),
        key(0.1, [1, 0.08], 'easeIn'), key(0.15, [1, 0.08]),
        key(1 / 3, [1, 1], 'inOutSine'), key(0.4, [1, 1])])]),
    ]),
    ...eyes.filter(part => part.endsWith('.pupil')).map(part => track(part, 'opacity', [
      key(0, from === 'normal' ? 1 : 0), key(0.085, from === 'normal' ? 1 : 0),
      key(0.1, 0, 'inOutSine'), key(0.15, 0),
      key(1 / 6, to === 'normal' ? 1 : 0, 'inOutSine'), key(0.4, to === 'normal' ? 1 : 0),
    ])),
  ];
}
