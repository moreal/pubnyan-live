import { clip, key, track } from '#ir/clip.ts';

/**
 * Idle loop, 4 s. Breathing on the body (everything inherits it), one blink at 3 s,
 * and the ring gaps narrowing alternately to suggest the ring turning slowly.
 */
const blink = (part: string) =>
  track(part, 'scale', [key(0, [1, 1]), key(3, [1, 1]), key(3.1, [1, 0.08], 'easeIn'), key(3.22, [1, 1], 'easeOut')]);

export default clip('idle', { rig: 'pubnyan', duration: 4, fps: 30, loop: true }, [
  track('body', 'scale', [key(0, [1, 1]), key(2, [1.008, 1.018], 'inOutSine'), key(4, [1, 1], 'inOutSine')]),
  blink('eye-l.white'),
  blink('eye-r.white'),
  blink('eye-l.pupil'),
  blink('eye-r.pupil'),
  track('ring-gap-l', 'scale', [key(0, [1, 1]), key(2, [0.85, 1], 'inOutSine'), key(4, [1, 1], 'inOutSine')]),
  track('ring-gap-r', 'scale', [key(0, [0.85, 1]), key(2, [1, 1], 'inOutSine'), key(4, [0.85, 1], 'inOutSine')]),
]);
