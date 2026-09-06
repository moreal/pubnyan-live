import { clip, key, track } from '#ir/clip.ts';

/** Transition out of shy back to normal, 0.4 s, non-loop. */
const morph = (part: string) => track(part, 'shape', [key(0, 'shy'), key(0.4, 'normal', 'easeInOut')]);

export default clip('from-shy', { rig: 'pubnyan', duration: 0.4, fps: 30, loop: false }, [
  morph('eye-l.white'),
  morph('eye-r.white'),
  morph('eye-l.pupil'),
  morph('eye-r.pupil'),
  morph('nose'),
  morph('mouth'),
]);
