import { expect, test } from 'vitest';
import { PNG } from 'pngjs';
import { clips, getRig, machine } from './index.ts';
import { exportRiveMachine } from '#export-rive/machine.ts';
import { Renderer } from '#render/renderer.ts';
import { renderRiveStateSequence } from '#verify/rive-machine-check.ts';

test('expression topology switches while both eye drawings are closed', async () => {
  const rig = structuredClone(getRig('pubnyan'));
  for (const p of rig.parts) {
    if (p.name.endsWith('.white')) p.fill = '#ff0000';
    if (p.name.endsWith('.pupil')) p.fill = '#000000';
  }
  const bytes = exportRiveMachine(rig, clips, machine);
  const renderer = await Renderer.launch();
  try {
    for (let from = 0; from < 5; from++) for (let to = 0; to < 5; to++) {
      if (from === to) continue;
      const frames = await renderRiveStateSequence(renderer, rig, bytes, [
        { expression: from, seconds: 1 }, { expression: to, seconds: 0.12 },
      ]);
      const {data} = PNG.sync.read(frames[1]!);
      let red = 0;
      for (let i=0;i<data.length;i+=4) if(data[i]!>120&&data[i+1]!<80&&data[i+2]!<80) red++;
      expect(red, `${from}->${to}: opened eye during contour swap`).toBe(0);
    }
  } finally { await renderer.close(); }
});

test('an active reaction cannot reopen an expression contour swap', async () => {
  const rig = structuredClone(getRig('pubnyan'));
  for (const p of rig.parts) if (p.name.endsWith('.white') || p.name.endsWith('.pupil')) p.fill = '#ff0000';
  const renderer = await Renderer.launch();
  try {
    const bytes = exportRiveMachine(rig, clips, machine);
    for (const trigger of ['react', 'reactNod', 'reactRingWobble']) {
      const frames = await renderRiveStateSequence(renderer, rig, bytes, [
        {seconds:1}, {trigger,seconds:0.2}, {expression:3,seconds:0.12},
      ]);
      const {data} = PNG.sync.read(frames[2]!);
      let red=0;
      for(let i=0;i<data.length;i+=4) if(data[i]!>120&&data[i+1]!<80&&data[i+2]!<80)red++;
      expect(red,trigger).toBe(0);
    }
  } finally {await renderer.close();}
});

test('a new expression requested during closure wins after the bridges finish', async () => {
  const {referenceFrame} = await import('#verify/reference.ts');
  const {compareFrames} = await import('#verify/parity.ts');
  const rig = getRig('pubnyan');
  const renderer = await Renderer.launch();
  try {
    const bytes = exportRiveMachine(rig, clips, machine);
    for (const expression of [0, 2, 4]) {
      const frames = await renderRiveStateSequence(renderer, rig, bytes, [
        {seconds:1}, {expression:3,seconds:0.05}, {expression,seconds:1.15},
      ]);
      // Close/open cry (0.4s), then the latest requested expression (0.4s),
      // then play that loop for the remaining 0.4s.
      const name = ['idle','expr-angry','expr-curious','expr-cry','expr-shy'][expression]!;
      const expected = await referenceFrame(renderer,rig,clips.find(c=>c.name===name)!,0.4);
      expect(compareFrames(frames[2]!,expected).ratio).toBeLessThanOrEqual(0.0005);
    }
  } finally {await renderer.close();}
});
