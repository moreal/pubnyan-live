import { clip, key, track } from '#ir/clip.ts';

/**
 * Idle loop, 6 s, the flagship loop. Four layers are phase-shifted so no two
 * tracks turn at the same instant:
 *  - body breath: scale swells at the midpoint, position rises a quarter
 *    cycle earlier so the rise reads as an inhale rather than a pulse.
 *  - head follow-through: rotation and position lag the body's swell by
 *    ~0.35 s and settle back with inOutSine (matches the body/ring's
 *    zero-velocity seam so the loop restarts without a jerk).
 *  - a double blink at 3.2 s and a shorter one at 3.55 s.
 *  - the ring gaps alternating on inOutSine over the full loop.
 */
const blink = (part: string, closedY: number) =>
  track(part, 'scale', [
    key(0, [1, 1]),
    key(3.13, [1, 1]),
    key(3.2, [1, closedY], 'easeIn'),
    key(3.36, [1, 1], 'outCubic'),
    key(3.48, [1, 1]),
    key(3.55, [1, closedY], 'easeIn'),
    key(3.71, [1, 1], 'outCubic'),
    key(6, [1, 1]),
  ]);

export default clip('idle', { rig: 'pubnyan', duration: 6, fps: 60, loop: true }, [
  // body breath
  track('body', 'scale', [key(0, [1, 1]), key(3, [1.008, 1.018], 'inOutSine'), key(6, [1, 1], 'inOutSine')]),
  track('body', 'position', [key(0, [0, 0]), key(1.5, [0, -2], 'inOutSine'), key(6, [0, 0], 'inOutSine')]),

  // head follow-through, lagging the body's swell by ~0.35 s
  track('head', 'rotation', [key(0, 0), key(3.35, 1.2, 'inOutSine'), key(6, 0, 'inOutSine')]),
  track('head', 'position', [key(0, [0, 0]), key(3.35, [2, 1.5], 'inOutSine'), key(6, [0, 0], 'inOutSine')]),

  // double blink
  blink('eye-l.white', 0.08),
  blink('eye-r.white', 0.08),
  blink('eye-l.pupil', 0.12),
  blink('eye-r.pupil', 0.12),

  // ring gaps alternating, on inOutSine over the full 6 s
  track('ring-gap-l', 'scale', [key(0, [1, 1]), key(3, [0.85, 1], 'inOutSine'), key(6, [1, 1], 'inOutSine')]),
  track('ring-gap-r', 'scale', [key(0, [0.85, 1]), key(3, [1, 1], 'inOutSine'), key(6, [0.85, 1], 'inOutSine')]),
]);
