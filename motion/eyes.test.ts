import { expect, test } from 'vitest';
import { clips, getRig } from './index.ts';
import { sampleClip } from '#ir/sample.ts';
import { Renderer } from '#render/renderer.ts';
import { sampleTimes } from '#verify/parity.ts';
import svgpath from 'svgpath';
import { svgPathBbox } from 'svg-path-bbox';

test('pupils stay inside the eyes throughout glances, blinks, and expression morphs', async () => {
  const rig = getRig('pubnyan');
  const selected = clips.filter((clip) => ['idle','wink','nod','head-turn','tilt','ear-twitch','ring-wobble','celebrate','to-cry','from-cry'].includes(clip.name) || /(?:curious|shy|angry)$/.test(clip.name));
  const samples = selected.flatMap((clip) => sampleTimes(clip).map((t) => {
    const parts = sampleClip(rig, clip, t).filter((p) => p.name.startsWith('eye-'));
    // Bound the scan from the transformed geometry, not old canvas coordinates.
    // This covers every possible pupil pixel without scanning empty canvas.
    const bounds = parts.map((p) => svgPathBbox(svgpath(p.d).matrix(p.matrix).toString()));
    return { name:`${clip.name}@${t}`, parts, bounds:[
      Math.floor(Math.min(...bounds.map(b => b[0]))), Math.floor(Math.min(...bounds.map(b => b[1]))),
      Math.ceil(Math.max(...bounds.map(b => b[2]))), Math.ceil(Math.max(...bounds.map(b => b[3]))),
    ] };
  }));
  const renderer = await Renderer.launch();
  try {
    const overflow = await renderer.evaluate<string[]>(`<script>
      window.__done=false;window.__error=undefined;
      {const context=document.createElement('canvas').getContext('2d'), failures=[];
      for(const sample of ${JSON.stringify(samples)}) {
        for(const side of ['l','r']) {
          const pathFor=(suffix)=>{const path=new Path2D();for(const p of sample.parts.filter(p=>p.name==='eye-'+side+suffix && p.opacity>0.05))path.addPath(new Path2D(p.d),new DOMMatrix(p.matrix));return path;};
          const white=pathFor('.white'), pupil=pathFor('.pupil');
          let outside=0,inside=0;
          for(let y=sample.bounds[1]+0.5;y<sample.bounds[3];y++)for(let x=sample.bounds[0]+0.5;x<sample.bounds[2];x++) {
            if(context.isPointInPath(pupil,x,y)){inside++;if(!context.isPointInPath(white,x,y))outside++;}
          }
          if(outside>Math.max(1,inside*0.01))failures.push(sample.name+' eye-'+side+': '+outside+'/'+inside+' pupil pixels outside');
        }
      }
      window.__result=failures;window.__done=true;}
    </script>`);
    expect(overflow).toEqual([]);
  } finally { await renderer.close(); }
});

test('a reopening blink restores pupils before the eyes become broad white ovals', async () => {
  const { blink } = await import('./clips/expression-motion.ts');
  const { sampleNumeric, sampleVec2 } = await import('#ir/sample.ts');
  const tracks = blink(1, 0.1);
  const lid = tracks.find(t => t.part === 'eye-l.white' && t.property === 'scale')!;
  const pupil = tracks.find(t => t.part === 'eye-l.pupil' && t.property === 'opacity')!;
  for (let t = 0.22; t <= 0.4; t += 1 / 240) {
    const height = sampleVec2(lid as import('#ir/types.ts').Track<'scale'>, t)[1];
    if (height >= 0.5) expect(sampleNumeric(pupil as import('#ir/types.ts').Track<'opacity'>, t), `blank eye at ${t}`).toBeGreaterThanOrEqual(0.8);
  }
});
