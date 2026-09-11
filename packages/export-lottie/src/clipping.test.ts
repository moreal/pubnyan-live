import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { clip, key, track } from '#ir/clip.ts';
import type { Rig } from '#ir/types.ts';
import { exportLottie } from '#export-lottie/index.ts';
import { Renderer } from '#render/renderer.ts';
import { compareFrames } from '#verify/parity.ts';

let renderer: Renderer;
let runtime: string;
beforeAll(async () => {
  renderer = await Renderer.launch();
  runtime = await readFile(new URL('../../../node_modules/lottie-web/build/player/lottie.min.js', import.meta.url), 'utf8');
});
afterAll(async () => { await renderer?.close(); });
const rect = (x: number, y: number, w: number, h: number) => `M${x} ${y}L${x+w} ${y}L${x+w} ${y+h}L${x} ${y+h}Z`;
const rig: Rig = {
  name: 'mask', artboard: { width: 100, height: 100 },
  parts: [
    { name: 'face', fill: '#4488cc', pivot: [0,0], path: rect(0,0,100,100) },
    { name: 'eye', parent: 'face', fill: '#ffffff', pivot: [50,50], path: rect(30,40,40,20) },
    { name: 'pupil', parent: 'face', clipTo: 'eye', fill: '#ff2200', pivot: [50,50], path: rect(40,20,20,60) },
    { name: 'child', parent: 'pupil', fill: '#00ff00', pivot: [0,0], path: rect(5,5,10,10) },
  ],
  expressions: { normal: {}, small: { eye: rect(40,45,20,10) }, triangle: { eye: 'M30 30L70 30L50 70Z' }, hidden: { eye: null } },
};

for (const mode of ['morph', 'crossfade'] as const) {
  test.each([0, 0.25, 0.5, 1, 1.5, 2])(`${mode} native aperture at %s`, async (time) => {
    const animation = clip('mask', { rig: rig.name, duration: 2.1, loop: false, fps: 30 }, [
      track('eye', 'shape', [key(0,'normal'),key(1,mode === 'morph' ? 'small' : 'triangle'),key(2,'hidden')]),
      track('eye', 'scale', [key(0,[1,1]),key(2,[1,0.5])]),
      track('eye', 'opacity', [key(0,0)]),
      track('eye', 'position', [key(0,[0,0]),key(2,[10,0])]),
      track('pupil', 'position', [key(0,[0,0]),key(2,[-10,0])]),
    ]);
    const json = exportLottie(rig, animation);
    const html = `<div id="l" style="width:100px;height:100px"></div><script>${runtime}</script><script>
      window.onerror=(m,s,l,c,e)=>{window.__error=e.stack};window.__ready=false;window.__error=undefined;
      var a=lottie.loadAnimation({container:document.getElementById('l'),renderer:'svg',autoplay:false,loop:false,animationData:${JSON.stringify(json)}});
      a.addEventListener('error',e=>{window.__error=JSON.stringify(e)});
      a.addEventListener('DOMLoaded',()=>{a.goToAndStop(${time*30},true);window.__ready=true});
    </script>`;
    const actual = await renderer.renderHtmlWhenReady(html,100,100);
    const path = time >= 2 ? '' : mode === 'morph'
      ? rect(30+10*Math.min(time,1),40+5*Math.min(time,1),40-20*Math.min(time,1),20-10*Math.min(time,1))
      : (time < 1 ? rect(30,40,40,20) : '') + (time > 0 ? 'M30 30L70 30L50 70Z' : '');
    const expected = await renderer.renderHtml(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><defs><clipPath id="a"><path transform="translate(${time*5} 0) translate(50 50) scale(1 ${1-time*0.25}) translate(-50 -50)" d="${path}"/></clipPath></defs><path fill="#4488cc" d="${rect(0,0,100,100)}"/><g clip-path="url(#a)"><path fill="#ff2200" transform="translate(${-time*5} 0)" d="${rect(40,20,20,60)}"/></g><path fill="#00ff00" transform="translate(${-time*5} 0)" d="${rect(5,5,10,10)}"/></svg>`,100,100);
    expect(compareFrames(actual,expected).ratio).toBeLessThanOrEqual(0.002);
  });
}

// Inner contour reverses the outer winding: the blue face must show through its hole.
test.each([
  { scaleY: 1, opacity: 1 },
  { scaleY: 1, opacity: 0.5 },
  { scaleY: 0, opacity: 1 },
  { scaleY: 0, opacity: 0.5 },
])('compound aperture preserves holes at scaleY=$scaleY, target opacity=$opacity', async ({ scaleY, opacity }) => {
  const aperture = `${rect(25,25,50,50)} M40 40L40 60L60 60L60 40Z`;
  const fixture: Rig = {
    ...rig,
    parts: rig.parts.filter((part) => part.name !== 'child').map((part) => ({
      ...part,
      path: part.name === 'eye' ? aperture : part.name === 'pupil' ? rect(10,10,80,80) : part.path,
    })),
  };
  const animation = clip('compound', { rig: rig.name, duration: 1, loop: false }, [
    track('eye', 'scale', [key(0,[1,scaleY])]),
    track('eye', 'opacity', [key(0,0)]),
    track('pupil', 'opacity', [key(0,opacity)]),
  ]);
  const data = exportLottie(fixture, animation);
  const actual = await renderer.renderHtmlWhenReady(`<div id="l" style="width:100px;height:100px"></div><script>${runtime}</script><script>
    window.__ready=false;window.__error=undefined;
    var a=lottie.loadAnimation({container:document.getElementById('l'),renderer:'svg',autoplay:false,loop:false,animationData:${JSON.stringify(data)}});
    a.addEventListener('error',e=>{window.__error=JSON.stringify(e)});
    a.addEventListener('DOMLoaded',()=>{a.goToAndStop(0,true);window.__ready=true});
  </script>`,100,100);
  const expected = await renderer.renderHtml(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><defs><clipPath id="compound"><path transform="translate(50 50) scale(1 ${scaleY}) translate(-50 -50)" d="${aperture}"/></clipPath></defs><path fill="#4488cc" d="${rect(0,0,100,100)}"/><path fill="#ff2200" opacity="${opacity}" clip-path="url(#compound)" d="${rect(10,10,80,80)}"/></svg>`,100,100);
  expect(compareFrames(actual,expected).ratio).toBeLessThanOrEqual(0.002);
});

test.each([0.5,1,1.5])('mixed topology keeps visible source morph and source opacity at %s', async (time) => {
  const animation = clip('mixed', { rig: rig.name, duration: 2.1, loop: false }, [
    track('eye','shape',[key(0,'normal'),key(1,'small'),key(2,'hidden')]),
    track('eye','opacity',[key(0,0.6)]),
  ]);
  const actual = await renderer.renderHtmlWhenReady(`<div id="l" style="width:100px;height:100px"></div><script>${runtime}</script><script>
    window.__ready=false;window.__error=undefined;
    var a=lottie.loadAnimation({container:document.getElementById('l'),renderer:'svg',autoplay:false,loop:false,animationData:${JSON.stringify(exportLottie(rig,animation))}});
    a.addEventListener('error',e=>{window.__error=JSON.stringify(e)});
    a.addEventListener('DOMLoaded',()=>{a.goToAndStop(${time*30},true);window.__ready=true});
  </script>`,100,100);
  const t = Math.min(time,1);
  const aperture = rect(30+10*t,40+5*t,40-20*t,20-10*t);
  const eyeOpacity = 0.6*(time <= 1 ? 1 : 2-time);
  const expected = await renderer.renderHtml(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><defs><clipPath id="mixed"><path d="${aperture}"/></clipPath></defs><path fill="#4488cc" d="${rect(0,0,100,100)}"/><path fill="#ffffff" opacity="${eyeOpacity}" d="${aperture}"/><path fill="#ff2200" clip-path="url(#mixed)" d="${rect(40,20,20,60)}"/><path fill="#00ff00" d="${rect(5,5,10,10)}"/></svg>`,100,100);
  expect(compareFrames(actual,expected).ratio).toBeLessThanOrEqual(0.002);
});

test('mixed source opacity multiplies each overlapping crossfade contour before compositing', async () => {
  const animation = clip('mixed-overlap', { rig: rig.name, duration: 2.1, loop: false }, [
    track('eye','shape',[key(0,'normal'),key(1,'small'),key(2,'triangle')]),
    track('eye','opacity',[key(0,0.6)]),
  ]);
  // Leave the crossfade overlap visible around a small contrasting pupil.
  const fixture = { ...rig, parts: rig.parts.map((part) => part.name === 'pupil' ? { ...part, path: rect(49,49,2,2) } : part) };
  const actual = await renderer.renderHtmlWhenReady(`<div id="l" style="width:100px;height:100px"></div><script>${runtime}</script><script>
    window.__ready=false;window.__error=undefined;
    var a=lottie.loadAnimation({container:document.getElementById('l'),renderer:'svg',autoplay:false,loop:false,animationData:${JSON.stringify(exportLottie(fixture,animation))}});
    a.addEventListener('error',e=>{window.__error=JSON.stringify(e)});
    a.addEventListener('DOMLoaded',()=>{a.goToAndStop(45,true);window.__ready=true});
  </script>`,100,100);
  const narrow = rect(40,45,20,10);
  const triangle = 'M30 30L70 30L50 70Z';
  const expected = await renderer.renderHtml(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><defs><clipPath id="overlap"><path d="${narrow}"/><path d="${triangle}"/></clipPath></defs><path fill="#4488cc" d="${rect(0,0,100,100)}"/><path fill="#ffffff" opacity="0.3" d="${narrow}"/><path fill="#ffffff" opacity="0.3" d="${triangle}"/><path fill="#ff2200" clip-path="url(#overlap)" d="${rect(49,49,2,2)}"/><path fill="#00ff00" d="${rect(5,5,10,10)}"/></svg>`,100,100);
  expect(compareFrames(actual,expected).ratio).toBeLessThanOrEqual(0.002);
});
