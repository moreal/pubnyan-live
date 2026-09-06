import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { clips, getRig, machine } from '#motion/index.ts';
import { exportRiveMachine } from '#export-rive/machine.ts';
import { Renderer } from '#verify/renderer.ts';

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
  await renderer.close();
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
