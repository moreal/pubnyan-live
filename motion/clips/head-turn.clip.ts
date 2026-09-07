import { clip, key, track } from '#ir/clip.ts';

/**
 * One-shot head turn, 1.2 s, to prove the `head` transform node drives its children.
 * Rotation 0 -> -5 -> 0 and a small position nudge, both inOutSine, returning to rest.
 */
export default clip('head-turn', { rig: 'pubnyan', duration: 1.2, fps: 30, loop: false }, [
  track('head', 'rotation', [key(0, 0), key(0.6, -5, 'inOutSine'), key(1.2, 0, 'inOutSine')]),
  track('head', 'position', [key(0, [0, 0]), key(0.6, [3, 0], 'inOutSine'), key(1.2, [0, 0], 'inOutSine')]),
]);
