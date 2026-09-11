import { expect, test } from 'vitest';
import { PNG } from 'pngjs';
import { clip, key, track } from '#ir/clip.ts';
import type { Rig } from '#ir/types.ts';
import { Renderer } from '#render/renderer.ts';
import { referenceFrame } from '#verify/reference.ts';
import { compareFrames } from '#verify/parity.ts';
import { exportSvg } from './index.ts';

const rig: Rig = {
  name: 'clip-svg', artboard: { width: 100, height: 100 },
  parts: [
    {name:'face',fill:'#224466',pivot:[50,50],path:'M0 0L100 0L100 100L0 100Z'},
    {name:'white',fill:'#ffffff',parent:'face',pivot:[50,50],path:'M20 30L80 30L80 70L20 70Z'},
    {name:'pupil',fill:'#ff0000',parent:'face',pivot:[50,50],path:'M40 10L60 10L60 90L40 90Z',clipTo:'white'},
    {name:'child',fill:'#00ff00',parent:'pupil',pivot:[0,0],path:'M82 82L88 82L88 88L82 88Z'},
  ],
  expressions:{ normal:{}, round:{white:'M65 50C65 65 35 65 35 50C35 35 65 35 65 50Z'}, shut:{white:null} },
};

test('SVG clips a colored pupil independently, including contour swaps and null geometry', async () => {
  const c=clip('test',{rig:rig.name,duration:1,fps:60,loop:false},[
    track('face','position',[key(0,[0,0]),key(1,[4,2])]),
    track('white','scale',[key(0,[1,1]),key(.5,[1,.2]),key(1,[1,1])]),
    track('white','opacity',[key(0,0)]), // geometry still clips despite transparent source
    track('white','shape',[key(0,'normal'),key(.25,'normal'),key(.5,'round'),key(.75,'shut'),key(1,'shut')]),
    track('pupil','position',[key(0,[0,0]),key(1,[2,0])]),
  ]);
  const r=await Renderer.launch();try{
    const svg=exportSvg(rig,c);
    for(const t of [0,.1,.25,.2501,.3,.5,.6,.7499,.75,1]) {
      const actual=await r.renderSvg(svg,100,100,t*1000);
      const reference=await referenceFrame(r,rig,c,t);
      expect(compareFrames(actual,reference).ratio,`t=${t}`).toBeLessThanOrEqual(.001);
    }
    const png=PNG.sync.read(await r.renderSvg(svg,100,100,0));
    const pixel=(x:number,y:number)=>[...png.data.subarray((y*100+x)*4,(y*100+x)*4+4)];
    expect(pixel(50,15)).toEqual([34,68,102,255]);
    expect(pixel(50,50)).toEqual([255,0,0,255]);
    expect(pixel(85,85)).toEqual([0,255,0,255]); // own drawing only; child is not clipped
  }finally{await r.close();}
});

test('a later null key does not turn an earlier compatible aperture morph into a union', async () => {
  const mixed: Rig = {...rig,expressions:{...rig.expressions,narrow:{white:'M40 40L60 40L60 60L40 60Z'}}};
  const c=clip('mixed',{rig:rig.name,duration:1,fps:60,loop:false},[
    track('white','shape',[key(0,'normal'),key(.5,'narrow'),key(1,'shut')]),
    track('white','opacity',[key(0,0)]),
  ]);
  const r=await Renderer.launch();try{
    const actual=await r.renderSvg(exportSvg(mixed,c),100,100,250);
    const expected=await referenceFrame(r,mixed,c,.25);
    expect(compareFrames(actual,expected).ratio).toBeLessThanOrEqual(.001);
  }finally{await r.close();}
});

test('source opacity multiplies each overlapping contour before compositing', async () => {
  const mixed: Rig = {...rig,expressions:{...rig.expressions,narrow:{white:'M30 35L70 35L70 65L30 65Z'}}};
  const c=clip('mixed-opacity',{rig:rig.name,duration:1,fps:60,loop:false},[
    track('white','shape',[key(0,'normal'),key(.4,'narrow'),key(1,'round')]),
    track('white','opacity',[key(0,.6)]),
    track('pupil','opacity',[key(0,0)]),
  ]);
  const r=await Renderer.launch();try{
    const actual=PNG.sync.read(await r.renderSvg(exportSvg(mixed,c),100,100,700));
    const expected=PNG.sync.read(await referenceFrame(r,mixed,c,.7));
    const center=(50*100+50)*4;
    expect([...actual.data.subarray(center,center+4)]).toEqual([...expected.data.subarray(center,center+4)]);
  }finally{await r.close();}
});
