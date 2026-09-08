import { expect, test } from 'vitest';
import { clips, getRig } from './index.ts';
import { resolvePath, sampleClip } from '#ir/sample.ts';
import { interpolatePath } from '#ir/path.ts';
import { Renderer } from '#render/renderer.ts';
import { sampleTimes } from '#verify/parity.ts';
import svgpath from 'svgpath';
import { svgPathBbox } from 'svg-path-bbox';

test.each(['curious', 'shy', 'angry'])('%s keeps both pupils visible and morphable from normal', (expression) => {
  const rig = getRig('pubnyan');
  for (const side of ['l', 'r']) {
    const pupil = rig.parts.find((p) => p.name === `eye-${side}.pupil`)!;
    const path = resolvePath(rig, pupil, expression);
    expect(path, `${expression}: missing ${pupil.name}`).not.toBeNull();
    expect(interpolatePath(pupil.path!, path!, 0.5)).not.toBeNull();
  }
});

test('pupils stay inside the eyes throughout glances, blinks, and expression morphs', async () => {
  const rig = getRig('pubnyan');
  const selected = clips.filter((clip) => ['idle','wink','nod','head-turn'].includes(clip.name) || /(?:curious|shy|angry)$/.test(clip.name));
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
