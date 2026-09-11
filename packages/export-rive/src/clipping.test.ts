import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { clip, key, track } from '#ir/clip.ts';
import type { Rig } from '#ir/types.ts';
import { exportRiveMachine } from '#export-rive/machine.ts';
import { renderRiveStateSequence } from '#verify/rive-machine-check.ts';
import { exportRive } from '#export-rive/index.ts';
import { Renderer } from '#render/renderer.ts';
import { compareFrames } from '#verify/parity.ts';

let renderer: Renderer;
beforeAll(async () => { renderer = await Renderer.launch(); });
afterAll(async () => { await renderer?.close(); });
const rectangle = (x: number, y: number, w: number, h: number) => `M${x} ${y}L${x+w} ${y}L${x+w} ${y+h}L${x} ${y+h}Z`;
const rig: Rig = {
  name: 'clipping', artboard: {width:100,height:100},
  parts: [
    {name:'face',fill:'#4488cc',pivot:[0,0],path:rectangle(0,0,100,100)},
    {name:'eye',parent:'face',fill:'#ffffff',pivot:[50,50],path:rectangle(30,40,40,20)},
    {name:'pupil',parent:'face',clipTo:'eye',fill:'#ff2200',pivot:[50,50],path:rectangle(40,20,20,60)},
    {name:'child',parent:'pupil',fill:'#00ff00',pivot:[0,0],path:rectangle(5,5,10,10)},
  ],
  expressions:{normal:{},small:{eye:'M45 45L55 45L50 75Z'},hidden:{eye:null}},
};
async function render(bytes: Buffer, name: string, time: number): Promise<Buffer> {
  const root = new URL('../../../node_modules/@rive-app/canvas/', import.meta.url);
  const js = await readFile(new URL('rive.js',root),'utf8');
  const wasm = 'data:application/wasm;base64,'+(await readFile(new URL('rive.wasm',root))).toString('base64');
  const value = await renderer.evaluate<string>(`<canvas id="c" width="100" height="100"></canvas><script>${js}</script><script>
    (async()=>{try {
      rive.RuntimeLoader.setWasmUrl(${JSON.stringify(wasm)});
      const rt=await rive.RuntimeLoader.awaitInstance();
      const file=await rt.load(Uint8Array.from(atob(${JSON.stringify(bytes.toString('base64'))}),c=>c.charCodeAt(0)));
      const board=file.defaultArtboard();const anim=new rt.LinearAnimationInstance(board.animationByName(${JSON.stringify(name)}),board);
      anim.time=${time};anim.apply(1);board.advance(0);
      const canvas=document.getElementById('c'),painter=rt.makeRenderer(canvas);painter.clear();board.draw(painter);rt.resolveAnimationFrame();
      const output=document.createElement('canvas');output.width=100;output.height=100;const ctx=output.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,100,100);ctx.drawImage(canvas,0,0);window.__result=output.toDataURL('image/png').split(',')[1];window.__done=true;
    }catch(e){window.__error=String(e)}})();</script>`);
  return Buffer.from(value,'base64');
}

test.each([0,1/120,0.5,1-1/120,1,1+1/120,1.5,2])('native mask clips colored pupils and excludes inactive source geometry at %s', async (time) => {
  const animation = clip('aperture',{rig:rig.name,duration:2},[
    track('eye','shape',[key(0,'normal'),key(1,'small'),key(2,'hidden')]),
    track('eye','opacity',[key(0,0)]),
  ]);
  const actual = await render(exportRive(rig,animation),animation.name,time);
  const shapes = time===0 ? rectangle(30,40,40,20) : time<1 ? `${rectangle(30,40,40,20)} M45 45L55 45L50 75Z` : time<2 ? 'M45 45L55 45L50 75Z' : '';
  const expected = await renderer.renderHtml(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><defs><clipPath id="eye"><path d="${shapes}"/></clipPath></defs><path fill="#4488cc" d="${rectangle(0,0,100,100)}"/><path fill="#ff2200" clip-path="url(#eye)" d="${rectangle(40,20,20,60)}"/><path fill="#00ff00" d="${rectangle(5,5,10,10)}"/></svg>`,100,100);
  expect(compareFrames(actual,expected).ratio).toBeLessThanOrEqual(0.002);
});


test('combined state changes replace incompatible apertures and restore the source geometry', async () => {
  const names = ['normal','small','hidden'];
  const clips = names.map((name) => clip(name,{rig:rig.name,duration:1},[
    track('eye','shape',[key(0,name)]), track('eye','opacity',[key(0,0)]),
  ]));
  const bytes = exportRiveMachine(rig,clips,{
    rig:rig.name,inputs:{expression:{type:'enum',values:names,default:'normal'}},
    layers:{face:{entry:'normal',states:Object.fromEntries(names.map((name)=>[name,{clip:name,mode:'loop' as const}])),
      transitions:names.map((name)=>({from:'*',to:name,duration:0,when:{input:'expression',equals:name}}))}},
  });
  const states=[0,1,2,0];
  const frames=await renderRiveStateSequence(renderer,rig,bytes,states.map((expression)=>({expression,seconds:0.25})));
  for (const [i,state] of states.entries()) {
    const expected=await render(exportRive(rig,clips[state]!),names[state]!,0);
    expect(compareFrames(frames[i]!,expected).ratio).toBeLessThanOrEqual(0.002);
  }
});

test('source transform moves the aperture independently of the undistorted pupil', async () => {
  const animation=clip('moving',{rig:rig.name,duration:1},[
    track('eye','scale',[key(0,[1,0.5])]),track('eye','position',[key(0,[0,5])]),
    track('pupil','position',[key(0,[10,0])]),
  ]);
  const actual=await render(exportRive(rig,animation),animation.name,0);
  const expected=await renderer.renderHtml(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><path fill="#4488cc" d="${rectangle(0,0,100,100)}"/><path fill="#ffffff" d="${rectangle(30,50,40,10)}"/><path fill="#ff2200" d="${rectangle(50,50,20,10)}"/><path fill="#00ff00" d="${rectangle(15,5,10,10)}"/></svg>`,100,100);
  expect(compareFrames(actual,expected).ratio).toBeLessThanOrEqual(0.002);
});

test('compatible aperture morphs clip pupils at the interpolated boundary', async () => {
  const morphRig: Rig={...rig,expressions:{normal:{},narrow:{eye:rectangle(40,45,20,10)}}};
  const animation=clip('morph',{rig:rig.name,duration:1},[
    track('eye','shape',[key(0,'normal'),key(1,'narrow')]),
  ]);
  const actual=await render(exportRive(morphRig,animation),animation.name,0.5);
  const expected=await renderer.renderHtml(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><path fill="#4488cc" d="${rectangle(0,0,100,100)}"/><path fill="#ffffff" d="${rectangle(35,42.5,30,15)}"/><path fill="#ff2200" d="${rectangle(40,42.5,20,15)}"/><path fill="#00ff00" d="${rectangle(5,5,10,10)}"/></svg>`,100,100);
  expect(compareFrames(actual,expected).ratio).toBeLessThanOrEqual(0.002);
});

test('an always-null aperture remains empty without an expression shape', async () => {
  const emptyRig: Rig={...rig,parts:rig.parts.map((part)=>part.name==='eye'?{...part,path:null}:part)};
  const animation=clip('empty',{rig:rig.name,duration:1},[]);
  const actual=await render(exportRive(emptyRig,animation),animation.name,0);
  const expected=await renderer.renderHtml(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><path fill="#4488cc" d="${rectangle(0,0,100,100)}"/><path fill="#00ff00" d="${rectangle(5,5,10,10)}"/></svg>`,100,100);
  expect(compareFrames(actual,expected).ratio).toBeLessThanOrEqual(0.002);
});

test('nonzero native state transitions retain the full union of incompatible apertures', async () => {
  const unionRig: Rig={...rig,parts:rig.parts.map((part)=>part.name==='pupil'?{...part,path:rectangle(0,0,100,100)}:part)};
  const names=['normal','small'];
  const clips=names.map((name)=>clip(name,{rig:rig.name,duration:1},[
    track('eye','shape',[key(0,name)]),track('eye','opacity',[key(0,0)]),
  ]));
  const bytes=exportRiveMachine(unionRig,clips,{
    rig:rig.name,inputs:{expression:{type:'enum',values:names,default:'normal'}},
    layers:{face:{entry:'normal',states:Object.fromEntries(names.map((name)=>[name,{clip:name,mode:'loop' as const}])),
      transitions:names.map((name)=>({from:'*',to:name,duration:0.4,when:{input:'expression',equals:name}}))}},
  });
  const frames=await renderRiveStateSequence(renderer,unionRig,bytes,[{seconds:0.25},{expression:1,seconds:0.2},{seconds:0.25},{expression:0,seconds:0.2}]);
  const expected=await renderer.renderHtml(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><path fill="#4488cc" d="${rectangle(0,0,100,100)}"/><path fill="#ff2200" d="${rectangle(30,40,40,20)} M45 45L55 45L50 75Z"/><path fill="#00ff00" d="${rectangle(5,5,10,10)}"/></svg>`,100,100);
  expect(compareFrames(frames[1]!,expected).ratio).toBeLessThanOrEqual(0.002);
  expect(compareFrames(frames[3]!,expected).ratio).toBeLessThanOrEqual(0.002);
});

test.each([0,0.08,0.4])('native activation clamp preserves source scale %s with parent transforms', async (scale) => {
  const {referenceFrame}=await import('#verify/reference.ts');
  const animation=clip('nested',{rig:rig.name,duration:1},[
    track('face','scale',[key(0,[1.05,0.8])]),track('face','rotation',[key(0,10)]),
    track('eye','scale',[key(0,[1,scale])]),track('eye','rotation',[key(0,20)]),
    track('eye','opacity',[key(0,0)]),
    track('pupil','opacity',[key(0,0.6)]),
  ]);
  const actual=await render(exportRive(rig,animation),animation.name,0);
  const expected=await referenceFrame(renderer,rig,animation,0);
  expect(compareFrames(actual,expected).ratio).toBeLessThanOrEqual(0.002);
});

test.each([false,true])('compound aperture retains its hole and partially transparent pupil (reversed %s)', async (reversed) => {
  const {referenceFrame}=await import('#verify/reference.ts');
  const holeRig: Rig={...rig,parts:rig.parts.map((part)=>part.name==='eye'?{...part,
    path:reversed ? 'M25 25L25 75L75 75L75 25Z M40 40L60 40L60 60L40 60Z'
      : `${rectangle(25,25,50,50)} M40 40L40 60L60 60L60 40Z`,
  }:part.name==='pupil'?{...part,path:rectangle(0,0,100,100)}:part)};
  const animation=clip('hole',{rig:rig.name,duration:1},[
    track('eye','opacity',[key(0,0)]),track('pupil','opacity',[key(0,0.5)]),
  ]);
  const actual=await render(exportRive(holeRig,animation),animation.name,0);
  const expected=await referenceFrame(renderer,holeRig,animation,0);
  expect(compareFrames(actual,expected).ratio).toBeLessThanOrEqual(0.002);
});

test.each([
  ['clip','triangle','M45 45L50 75L55 45Z'],
  ['machine','triangle','M45 45L50 75L55 45Z'],
  ['clip','cubic','M30 50C30 75 70 75 70 50C70 25 30 25 30 50Z'],
  ['machine','cubic','M30 50C30 75 70 75 70 50C70 25 30 25 30 50Z'],
])('opposite-winding apertures form a union in %s crossfades (%s)', async (target, _shape, path) => {
  const {referenceFrame}=await import('#verify/reference.ts');
  const oppositeRig: Rig={...rig,expressions:{normal:{},small:{eye:path!}},
    parts:rig.parts.map((part)=>part.name==='pupil'?{...part,path:rectangle(0,0,100,100)}:part)};
  const animation=clip('opposite',{rig:rig.name,duration:1},[
    track('eye','shape',[key(0,'normal'),key(1,'small')]),track('eye','opacity',[key(0,0)]),
  ]);
  let actual: Buffer;
  if (target==='clip') actual=await render(exportRive(oppositeRig,animation),animation.name,0.5);
  else {
    const names=['normal','small'];
    const clips=names.map((name)=>clip(name,{rig:rig.name,duration:1},[
      track('eye','shape',[key(0,name)]),track('eye','opacity',[key(0,0)]),
    ]));
    const bytes=exportRiveMachine(oppositeRig,clips,{
      rig:rig.name,inputs:{expression:{type:'enum',values:names,default:'normal'}},
      layers:{face:{entry:'normal',states:Object.fromEntries(names.map((name)=>[name,{clip:name,mode:'loop' as const}])),
        transitions:names.map((name)=>({from:'*',to:name,duration:0.4,when:{input:'expression',equals:name}}))}},
    });
    const frames=await renderRiveStateSequence(renderer,oppositeRig,bytes,[{seconds:0.25},{expression:1,seconds:0.2}]);
    actual=frames[1]!;
  }
  const expected=await referenceFrame(renderer,oppositeRig,animation,0.5);
  expect(compareFrames(actual,expected).ratio).toBeLessThanOrEqual(0.002);
});
