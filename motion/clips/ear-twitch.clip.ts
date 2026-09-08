import { clip, key, track } from '#ir/clip.ts';

/** One ear catches a sound; the other answers late with a smaller flick. */
export default clip('ear-twitch', { rig: 'pubnyan', duration: 0.65, fps: 60, loop: false }, [
  track('ear-r', 'rotation', [
    key(0, 0), key(0.06, 0.8, 'inOutCubic'), key(0.14, -6, 'outCubic'),
    key(0.25, 1.6, 'inOutCubic'), key(0.43, -0.5, 'inOutSine'), key(0.65, 0, 'inOutSine'),
  ]),
  track('ear-l', 'rotation', [
    key(0, 0), key(0.14, 0), key(0.24, 2.5, 'outCubic'),
    key(0.39, -0.6, 'inOutCubic'), key(0.65, 0, 'inOutSine'),
  ]),
]);
