import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { clips, getRig, machine } from '#motion/index.ts';
import { exportRiveMachine } from '#export-rive/machine.ts';
import { Renderer } from '#render/renderer.ts';
import { compareFrames } from '#verify/parity.ts';
import { referenceFrame } from '#verify/reference.ts';
import { renderRiveStateSequence } from '#verify/rive-machine-check.ts';

const RIVE_CANVAS_JS = new URL('../../../node_modules/@rive-app/canvas/rive.js', import.meta.url).pathname;
const RIVE_CANVAS_WASM = new URL('../../../node_modules/@rive-app/canvas/rive.wasm', import.meta.url).pathname;

interface CheckResult {
  inputNames: string[];
}

let renderer: Renderer;
beforeAll(async () => {
  renderer = await Renderer.launch();
});
afterAll(async () => {
  await renderer?.close();
});

test.each([
  ['expr-curious', 1], ['expr-shy', 1], ['expr-angry', 1], ['expr-cry', 1],
  ['to-angry', 0.2], ['from-shy', 0.2], ['to-cry', 0.2], ['from-cry', 0.2167],
] as const)('combined artboard renders %s at %ss, including pupils and tears', async (name, time) => {
  const rig = getRig(machine.rig);
  const clip = clips.find((clip) => clip.name === name)!;
  const bytes = exportRiveMachine(rig, clips, machine);
  const js = await readFile(RIVE_CANVAS_JS, 'utf8');
  const wasm = 'data:application/wasm;base64,' + (await readFile(RIVE_CANVAS_WASM)).toString('base64');
  const { width, height } = rig.artboard;
  const actual = await renderer.renderHtmlWhenReady(`<canvas id="c" width="${width}" height="${height}"></canvas>
    <script>${js}</script><script>{
      window.__ready=false; window.__error=undefined;
      rive.RuntimeLoader.setWasmUrl(${JSON.stringify(wasm)});
      const buffer = Uint8Array.from(atob(${JSON.stringify(bytes.toString('base64'))}), c=>c.charCodeAt(0)).buffer;
      const player = new rive.Rive({ canvas:document.getElementById('c'), buffer,
        animations:${JSON.stringify(name)}, autoplay:true,
        onLoad:()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
          player.scrub(${JSON.stringify(name)},${time});
          requestAnimationFrame(()=>{player.pause();window.__ready=true;});
        })), onLoadError:e=>{window.__error=String(e);}
      });
    }</script>`, width, height);
  const reference = await referenceFrame(renderer, rig, clip, time);
  expect(compareFrames(actual, reference).ratio).toBeLessThanOrEqual(0.002);
});

test('real expression inputs change faces and returning to normal clears tears and stale transforms', async () => {
  const rig = getRig(machine.rig);
  const states = [0, 3, 2, 4, 1, 0];
  const names = ['idle', 'expr-cry', 'expr-curious', 'expr-shy', 'expr-angry', 'idle'];
  const frames = await renderRiveStateSequence(renderer, rig, exportRiveMachine(rig, clips, machine), states.map((expression) => ({expression, seconds:1})));
  for (const [i, name] of names.entries()) {
    const expected = await referenceFrame(renderer, rig, clips.find((clip) => clip.name === name)!, i === 0 ? 1 : 0.6);
    expect(compareFrames(frames[i]!, expected).ratio, name).toBeLessThanOrEqual(0.002);
  }
});

test('a completed reaction releases its channels back to the continuing expression', async () => {
  const rig = getRig(machine.rig);
  const bytes = exportRiveMachine(rig, clips, machine);
  const baseline = await renderRiveStateSequence(renderer, rig, bytes, [{expression:4,seconds:1},{seconds:1.2}]);
  const reacted = await renderRiveStateSequence(renderer, rig, bytes, [{expression:4,seconds:1},{trigger:'reactNod',seconds:1.2}]);
  expect(compareFrames(baseline[1]!, reacted[1]!).ratio).toBeLessThanOrEqual(0.0005);
});

test('the exported state machine loads and its inputs match motion/machine.ts', async () => {
  const rig = getRig(machine.rig);
  const bytes = exportRiveMachine(rig, clips, machine);
  const jsSource = await readFile(RIVE_CANVAS_JS, 'utf8');
  const wasmDataUrl = `data:application/wasm;base64,${(await readFile(RIVE_CANVAS_WASM)).toString('base64')}`;
  const bytesBase64 = bytes.toString('base64');
  const { width, height } = rig.artboard;
  const html = [
    `<canvas id="c" width="${width}" height="${height}"></canvas>`,
    `<script>${jsSource}</script>`,
    '<script>',
    '  rive.RuntimeLoader.setWasmUrl(' + JSON.stringify(wasmDataUrl) + ');',
    '  function b64ToBytes(b64) {',
    '    const bin = atob(b64);',
    '    const out = new Uint8Array(bin.length);',
    '    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);',
    '    return out;',
    '  }',
    '  try {',
    `    const buffer = b64ToBytes(${JSON.stringify(bytesBase64)}).buffer;`,
    '    const r = new rive.Rive({',
    "      canvas: document.getElementById('c'),",
    '      buffer,',
    "      stateMachines: 'main',",
    '      autoplay: false,',
    '      onLoad: () => {',
    "        window.__result = { inputNames: r.stateMachineInputs('main').map((i) => i.name) };",
    '        window.__done = true;',
    '      },',
    '      onLoadError: (e) => {',
    '        window.__error = e && e.message ? e.message : String(e);',
    '      },',
    '    });',
    '  } catch (e) {',
    '    window.__error = e && e.message ? e.message : String(e);',
    '  }',
    '</script>',
  ].join('\n');
  const result = await renderer.evaluate<CheckResult>(html);

  const gotInputNames = new Set(result.inputNames);
  const wantInputNames = new Set(Object.keys(machine.inputs));
  expect(gotInputNames).toEqual(wantInputNames);
});
