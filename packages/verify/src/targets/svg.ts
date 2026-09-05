import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { exportSvg } from '#export-svg/index.ts';
import type { Target } from '#verify/parity.ts';

export const svgTarget: Target = {
  name: 'svg',
  async export(rig, clip, outDir) {
    await mkdir(outDir, { recursive: true });
    const file = join(outDir, `${clip.name}.svg`);
    await writeFile(file, exportSvg(rig, clip));
    return [file];
  },
  renderFrame(renderer, rig, clip, t) {
    return renderer.renderSvg(exportSvg(rig, clip), rig.artboard.width, rig.artboard.height, t * 1000);
  },
};
