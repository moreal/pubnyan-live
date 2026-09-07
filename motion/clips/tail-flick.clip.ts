import { clip, key, track } from '#ir/clip.ts';

/**
 * Tail flick, 0.45 s, non-loop. Pubnyan has no tail, so this stands in with a
 * quick scale flick of the ring-gap-r sliver: fast out, slow back.
 */
export default clip('tail-flick', { rig: 'pubnyan', duration: 0.45, fps: 60, loop: false }, [
  track('ring-gap-r', 'scale', [
    key(0, [1, 1]),
    key(0.12, [0.8, 1], 'easeIn'),
    key(0.45, [1, 1], 'outCubic'),
  ]),
]);
