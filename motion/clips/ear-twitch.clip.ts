import { clip, key, track } from '#ir/clip.ts';

/**
 * Ear twitch, 0.3 s, non-loop. The fused silhouette has no separate ears, so
 * this stands in with a quick, tiny body scale-x squash.
 */
export default clip('ear-twitch', { rig: 'pubnyan', duration: 0.3, fps: 30, loop: false }, [
  track('body', 'scale', [
    key(0, [1, 1]),
    key(0.12, [0.98, 1], 'easeIn'),
    key(0.3, [1, 1], 'easeOut'),
  ]),
]);
