import { clip, key, track } from '#ir/clip.ts';
import type { Clip } from '#ir/types.ts';

/**
 * Clips that exist only to give pixel parity the branches the shipped clips never reach:
 * a morphing shape track, a crossfading one with a part that hides, and an opacity track on a
 * parent (whose children must NOT inherit it). They are verified but never exported to `dist/`.
 */
export const fixtureClips: Clip[] = [
  // mouth normal -> shy: both are 3-cubic paths, so this morphs via `d: path()`.
  clip('fixture-morph', { rig: 'pubnyan', duration: 1, loop: false }, [
    track('mouth', 'shape', [key(0, 'normal'), key(1, 'shy', 'easeInOut')]),
  ]),
  // mouth normal -> angry has 3 vs 8 cubics, so it crossfades; the pupil is null in angry, so it hides.
  clip('fixture-crossfade', { rig: 'pubnyan', duration: 1, loop: false }, [
    track('mouth', 'shape', [key(0, 'normal'), key(1, 'angry')]),
    track('eye-l.pupil', 'shape', [key(0, 'normal'), key(1, 'angry')]),
  ]),
  // body is the root part: the silhouette fades, its face and features stay opaque.
  clip('fixture-opacity', { rig: 'pubnyan', duration: 1 }, [
    track('body', 'opacity', [key(0, 1), key(0.5, 0.2), key(1, 1)]),
  ]),
];
