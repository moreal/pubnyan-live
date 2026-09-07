import { clip, key, track } from '#ir/clip.ts';

/**
 * Ear twitch, 0.35 s, non-loop. The fused silhouette has no separate ears, so
 * this stands in with a quick body scale-x squash plus a 1-frame head
 * position kick that recovers on outQuint.
 */
export default clip('ear-twitch', { rig: 'pubnyan', duration: 0.35, fps: 60, loop: false }, [
  track('body', 'scale', [
    key(0, [1, 1]),
    key(0.14, [0.98, 1], 'easeIn'),
    key(0.35, [1, 1], 'easeOut'),
  ]),
  track('head', 'position', [
    key(0, [0, 0]),
    key(1 / 60, [1, -1], 'easeIn'),
    key(0.35, [0, 0], 'outQuint'),
  ]),
]);
