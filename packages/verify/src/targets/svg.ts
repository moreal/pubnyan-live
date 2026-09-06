import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { exportSvg } from '#export-svg/index.ts';
import type { Target } from '#verify/parity.ts';

/**
 * Both `export` and `renderFrame` write to this same directory (it is exactly what `cli.ts`
 * passes as `outDir` for the registered clips), so `renderFrame` always renders the bytes that
 * actually sit in `dist/svg` rather than a fresh in-memory string. Fixture clips (never exported
 * by the CLI) still get their file written here on demand, keeping the round trip identical for
 * every clip under test.
 */
const OUT_DIR = new URL('../../../../dist/svg/', import.meta.url).pathname;

async function writeSvgFile(rig: Parameters<typeof exportSvg>[0], clip: Parameters<typeof exportSvg>[1], outDir: string) {
  await mkdir(outDir, { recursive: true });
  const file = join(outDir, `${clip.name}.svg`);
  await writeFile(file, exportSvg(rig, clip));
  return file;
}

export const svgTarget: Target = {
  name: 'svg',
  async export(rig, clip, outDir) {
    const file = await writeSvgFile(rig, clip, outDir);
    return [file];
  },
  async renderFrame(renderer, rig, clip, t) {
    const file = await writeSvgFile(rig, clip, OUT_DIR);
    const svg = await readFile(file, 'utf8');
    return renderer.renderSvg(svg, rig.artboard.width, rig.artboard.height, t * 1000);
  },
};
