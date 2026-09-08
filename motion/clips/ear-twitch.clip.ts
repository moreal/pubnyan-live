import { clip, key, track } from '#ir/clip.ts';

/** A sound catches the right ear; the smaller left answer and gaze locate it. */
export default clip('ear-twitch', { rig: 'pubnyan', duration: 0.75, fps: 60, loop: false }, [
  track('ear-r', 'rotation', [
    key(0, 0), key(0.06, 1.2, 'inOutCubic'), key(0.13, -6, 'outCubic'),
    key(0.18, -6), key(0.29, 2, 'inOutCubic'),
    key(0.44, -0.8, 'inOutSine'), key(0.6, 0.2, 'inOutSine'), key(0.75, 0, 'inOutSine'),
  ]),
  track('ear-l', 'rotation', [
    key(0, 0), key(0.15, 0), key(0.24, 3.2, 'outCubic'),
    key(0.37, -1, 'inOutCubic'), key(0.55, 0.35, 'inOutSine'), key(0.75, 0, 'inOutSine'),
  ]),
  track('head', 'rotation', [
    key(0, 0), key(0.13, 0), key(0.29, -0.9, 'outCubic'),
    key(0.42, -0.9), key(0.63, 0.15, 'inOutCubic'), key(0.75, 0, 'inOutSine'),
  ]),
  ...['eye-l.pupil', 'eye-r.pupil'].map((part) => track(part, 'position', [
    key(0, [0, 0]), key(0.09, [0, 0]), key(0.2, [1.6, -0.6], 'outCubic'),
    key(0.42, [1.6, -0.6]), key(0.66, [0, 0], 'inOutCubic'), key(0.75, [0, 0]),
  ])),
]);
