import { clip, key, track } from '#ir/clip.ts';

/**
 * Tail flick, 0.4 s, non-loop. Pubnyan has no tail, so this stands in with a
 * quick scale flick of the ring-gap-r sliver to suggest the ring flicking.
 */
export default clip('tail-flick', { rig: 'pubnyan', duration: 0.4, fps: 30, loop: false }, [
  track('ring-gap-r', 'scale', [
    key(0, [1, 1]),
    key(0.15, [0.8, 1], 'easeOut'),
    key(0.4, [1, 1], 'inOutSine'),
  ]),
]);
