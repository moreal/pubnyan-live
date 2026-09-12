import { clip, key, track } from '#ir/clip.ts';
import type { Clip } from '#ir/types.ts';

/** Rive bridges are internal transitions, not additional public reactions. */
export const expressionBridges: Record<string, Record<string, Clip>> = {};
const expressions = ['normal', 'angry', 'curious', 'cry', 'shy'];
for (const from of expressions) {
  expressionBridges[from] = {};
  for (const to of expressions) {
    if (from === to) continue;
    expressionBridges[from][to] = clip(`bridge-${from}-${to}`, {
      rig: 'pubnyan', duration: 0.4, fps: 60, loop: false,
    }, [
      ...['eye-l.white', 'eye-r.white', 'eye-l.pupil', 'eye-r.pupil', 'nose', 'mouth', 'tear-l', 'tear-r'].map(part =>
        track(part, 'shape', [key(0, from), key(1 / 15, from), key(0.1, 'closed'),
          key(2 / 15, 'closed'), key(0.2, to), key(0.4, to)])),
      ...['eye-l.white', 'eye-r.white'].map(part => track(part, 'scale', [
        key(0, [1, 1]), key(0.1, [1, 0], 'inOutCubic'), key(2 / 15, [1, 0]),
        key(0.4, [1, 1], 'inOutSine'),
      ])),
      ...['eye-l.pupil', 'eye-r.pupil', 'mouth', 'tear-l', 'tear-r'].map(part => track(part, 'opacity', [
        key(0, 1), key(1 / 15, 1), key(0.1, 0, 'inOutSine'), key(2 / 15, 0),
        key(0.2, 1, 'inOutSine'), key(0.4, 1),
      ])),
    ]);
  }
}
