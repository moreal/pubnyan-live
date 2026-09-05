import { clip, key, track } from '#ir/clip.ts';

/**
 * Wink, 1 s, non-loop. The right eye squashes shut and reopens; nothing else moves.
 */
const wink = (part: string) =>
  track(part, 'scale', [key(0, [1, 1]), key(0.35, [1, 0.08], 'easeIn'), key(0.55, [1, 1], 'easeOut')]);

export default clip('wink', { rig: 'pubnyan', duration: 1, fps: 30, loop: false }, [
  wink('eye-r.white'),
  wink('eye-r.pupil'),
]);
