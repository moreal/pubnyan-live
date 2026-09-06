import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { exportRive } from '#export-rive/index.ts';
import type { Target } from '#verify/parity.ts';

const RIVE_CANVAS_JS = new URL('../../../../node_modules/@rive-app/canvas/rive.js', import.meta.url).pathname;
const RIVE_CANVAS_WASM = new URL('../../../../node_modules/@rive-app/canvas/rive.wasm', import.meta.url).pathname;

export const riveTarget: Target = {
  name: 'rive',
  async export(rig, clip, outDir) {
    await mkdir(outDir, { recursive: true });
    const file = join(outDir, `${clip.name}.riv`);
    await writeFile(file, exportRive(rig, clip));
    return [file];
  },
  async renderFrame(renderer, rig, clip, t) {
    const script = await readFile(RIVE_CANVAS_JS, 'utf8');
    const wasmDataUrl = `data:application/wasm;base64,${(await readFile(RIVE_CANVAS_WASM)).toString('base64')}`;
    const bytes = exportRive(rig, clip);
    const bytesBase64 = bytes.toString('base64');
    const { width, height } = rig.artboard;
    const html = [
      `<canvas id="c" width="${width}" height="${height}"></canvas>`,
      `<script>${script}</script>`,
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
      // `autoplay: true`, not a manual `drawFrame()` from inside `onLoad`: the Wasm layer only
      // computes each object's world transform while the runtime's own render loop calls
      // `Artboard::advance`, so a `drawFrame()` before that first advance draws every shape at
      // its uninitialized (zero) transform, i.e. a blank canvas. Two rAF ticks guarantee at
      // least one full advance-and-draw has happened before `r.scrub()` runs.',
      '      autoplay: true,',
      '      onLoad: () => {',
      '        requestAnimationFrame(() => requestAnimationFrame(() => {',
      // `r.scrub()` only records the target time on the animation instance (`scrubTo`); the
      // instance isn't actually advanced and applied to the artboard until the runtime's own
      // still-running (`autoplay`) render loop next ticks — `r.drawFrame()` right after `scrub()`
      // is a no-op here since a frame is already scheduled. Calling `r.pause()` in the same turn
      // stops future ticks but not this pending one, so one more rAF is needed before pausing:
      // otherwise `pause()` freezes the artboard at its pre-scrub (rest) pose, one tick too early.
      '          try {',
      `            r.scrub(${JSON.stringify(clip.name)}, ${t});`,
      '          } catch (e) { /* no such animation yet: the rest pose is already drawn */ }',
      '          requestAnimationFrame(() => {',
      '            r.pause();',
      '            window.__ready = true;',
      '          });',
      '        }));',
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
    return renderer.renderHtmlWhenReady(html, width, height);
  },
};
