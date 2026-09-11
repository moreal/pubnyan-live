import { expect, test } from 'vitest';
import { clips, getRig } from './index.ts';
import { groupTracks, sampleNumeric, sampleShape, sampleVec2 } from '#ir/sample.ts';

test('source expression transitions conceal incompatible eye crossfades behind a closed blink', () => {
  const rig = getRig('pubnyan');
  for (const clip of clips.filter(c => ['to-cry', 'from-cry', 'to-curious', 'from-curious', 'to-angry', 'from-angry', 'to-shy', 'from-shy'].includes(c.name))) {
    const tracks = groupTracks(clip);
    for (const part of rig.parts.filter(p => p.name.startsWith('eye-'))) {
      const channels = tracks.get(part.name)!;
      for (let frame = 1; frame < 96; frame++) {
        const time = clip.duration * frame / 96;
        const paths = sampleShape(rig, part, channels.shape, time).filter(p => p.opacity > 0.001);
        if (paths.length > 1) {
          if (part.name.endsWith('.pupil')) {
            expect(sampleNumeric(channels.opacity!, time)).toBe(0);
            continue;
          }
          expect(channels.scale, `${clip.name} ${part.name} ${time}`).toBeDefined();
          expect(sampleVec2(channels.scale!, time)[1]).toBeLessThanOrEqual(0.081);
        }
      }
    }
  }
});
