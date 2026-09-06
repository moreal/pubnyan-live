import { readFile } from 'node:fs/promises';
import type { Renderer } from '#render/renderer.ts';

const RIVE_CANVAS_JS = new URL('../../../node_modules/@rive-app/canvas/rive.js', import.meta.url).pathname;
const RIVE_CANVAS_WASM = new URL('../../../node_modules/@rive-app/canvas/rive.wasm', import.meta.url).pathname;

export interface RiveCheckResult {
  artboardNames: string[];
}

/**
 * Loads `.riv` bytes with the real `@rive-app/canvas` runtime in headless Chrome and reads back
 * the file's artboard names, so the check exercises the bytes the writer produced rather than the
 * JS object graph that built them.
 */
export async function checkRiveFile(renderer: Renderer, bytes: Buffer): Promise<RiveCheckResult> {
  const script = await readFile(RIVE_CANVAS_JS, 'utf8');
  const wasmDataUrl = `data:application/wasm;base64,${(await readFile(RIVE_CANVAS_WASM)).toString('base64')}`;
  const bytesBase64 = bytes.toString('base64');
  const html = [
    '<canvas id="c" width="100" height="100"></canvas>',
    `<script>${script}</script>`,
    '<script>',
    '  rive.RuntimeLoader.setWasmUrl(' + JSON.stringify(wasmDataUrl) + ');',
    '  function b64ToBytes(b64) {',
    '    const bin = atob(b64);',
    '    const bytes = new Uint8Array(bin.length);',
    '    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);',
    '    return bytes;',
    '  }',
    '  try {',
    `    const buffer = b64ToBytes(${JSON.stringify(bytesBase64)}).buffer;`,
    '    const r = new rive.Rive({',
    "      canvas: document.getElementById('c'),",
    '      buffer,',
    '      autoplay: false,',
    '      onLoad: () => {',
    '        window.__result = { artboardNames: (r.contents?.artboards ?? []).map((a) => a.name) };',
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
  return renderer.evaluate<RiveCheckResult>(html);
}
