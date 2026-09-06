import { clip, key, track } from '#ir/clip.ts';

/** Transition into angry, 0.4 s, non-loop. Eyes, pupils, nose, and mouth crossfade/morph from normal. */
const morph = (part: string) => track(part, 'shape', [key(0, 'normal'), key(0.4, 'angry', 'easeInOut')]);

export default clip('to-angry', { rig: 'pubnyan', duration: 0.4, fps: 30, loop: false }, [
  morph('eye-l.white'),
  morph('eye-r.white'),
  morph('eye-l.pupil'),
  morph('eye-r.pupil'),
  morph('nose'),
  morph('mouth'),
]);
