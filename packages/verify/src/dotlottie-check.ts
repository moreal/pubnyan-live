import { readFile } from 'node:fs/promises';
import type { Clip, Machine } from '#ir/types.ts';
import type { Renderer } from '#verify/renderer.ts';

const DOTLOTTIE_WEB_JS = new URL('../../../node_modules/@lottiefiles/dotlottie-web/dist/index.js', import.meta.url).pathname;
const DOTLOTTIE_WEB_WASM = new URL('../../../node_modules/@lottiefiles/dotlottie-web/dist/dotlottie-player.wasm', import.meta.url).pathname;

export interface DotlottieCheckResult {
  animationIds: string[];
  stateMachineIds: string[];
  stateMachineInputs: string[];
}

/**
 * Loads a `.lottie` bundle with the real `@lottiefiles/dotlottie-web` runtime in headless Chrome
 * and reads back its manifest and state machine inputs, so the check exercises the bytes the
 * bundle actually contains rather than the JS objects that built them.
 */
export async function checkDotlottieBundle(renderer: Renderer, bundle: Buffer, machineId: string): Promise<DotlottieCheckResult> {
  const script = await readFile(DOTLOTTIE_WEB_JS, 'utf8');
  const wasmDataUrl = `data:application/wasm;base64,${(await readFile(DOTLOTTIE_WEB_WASM)).toString('base64')}`;
  const bundleBase64 = bundle.toString('base64');
  const machineIdJson = JSON.stringify(machineId);
  const html = [
    '<canvas id="c" width="100" height="100"></canvas>',
    '<script type="module">',
    `  const moduleUrl = URL.createObjectURL(new Blob([${JSON.stringify(script)}], { type: 'text/javascript' }));`,
    '  const { DotLottie } = await import(moduleUrl);',
    `  DotLottie.setWasmUrl(${JSON.stringify(wasmDataUrl)});`,
    '  function b64ToBytes(b64) {',
    '    const bin = atob(b64);',
    '    const bytes = new Uint8Array(bin.length);',
    '    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);',
    '    return bytes;',
    '  }',
    '  try {',
    `    const data = b64ToBytes(${JSON.stringify(bundleBase64)}).buffer;`, // must be an ArrayBuffer: a Uint8Array is treated as parsed Lottie JSON
    "    const dotlottie = new DotLottie({ canvas: document.getElementById('c'), data, autoplay: false });",
    '    await new Promise((resolve, reject) => {',
    "      dotlottie.addEventListener('load', resolve);",
    "      dotlottie.addEventListener('loadError', (e) => reject(new Error(JSON.stringify(e))));",
    '    });',
    `    const machineId = ${machineIdJson};`,
    '    const loaded = dotlottie.stateMachineLoad(machineId);',
    "    if (!loaded) throw new Error('stateMachineLoad(' + machineId + ') returned false');",
    '    window.__result = {',
    '      animationIds: (dotlottie.manifest?.animations ?? []).map((a) => a.id),',
    '      stateMachineIds: (dotlottie.manifest?.stateMachines ?? []).map((s) => s.id),',
    '      stateMachineInputs: dotlottie.stateMachineGetInputs(),',
    '    };',
    '    window.__done = true;',
    '  } catch (e) {',
    '    window.__error = e && e.message ? e.message : String(e);',
    '  }',
    '</script>',
  ].join('\n');
  return renderer.evaluate<DotlottieCheckResult>(html);
}

/** Every input name `motion/machine.ts` declares, for comparing against `stateMachineGetInputs()`. */
export function machineInputNames(machine: Machine): string[] {
  return Object.keys(machine.inputs);
}

/** Every clip name that should show up as a manifest animation for the bundle's rig. */
export function bundledClipNames(clips: Clip[], rig: string): string[] {
  return clips.filter((c) => c.rig === rig).map((c) => c.name);
}
