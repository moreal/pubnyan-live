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
 * White and pupil use the same compression to keep the pupil inside the eye.
 */
export function blink(duration: number, start: number, side: 'both' | 'right' = 'both'): Track[] {
  const parts = side === 'right' ? ['eye-r.white', 'eye-r.pupil']
    : ['eye-l.white', 'eye-l.pupil', 'eye-r.white', 'eye-r.pupil'];
  return [...parts.map((part) => track(part, 'scale', [
    key(0, [1, 1]), key(start, [1, 1]),
    key(start + 0.08, [1, 0.08], 'easeIn'),
    key(start + 0.12, [1, 0.08]),
    key(start + 0.3, [1, 1], 'outCubic'), key(duration, [1, 1]),
  ])), ...parts.filter((part) => part.endsWith('.pupil')).map((part) => track(part, 'opacity', [
    key(0, 1), key(start, 1), key(start + 0.04, 1), key(start + 0.07, 0, 'easeIn'),
    key(start + 0.12, 0), key(start + 0.15, 1, 'outCubic'), key(duration, 1),
  ]))];
}
