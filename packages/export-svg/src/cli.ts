import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { exportSvg } from '#export-svg/index.ts';
import { writeSvgManifest } from '#export-svg/manifest.ts';
import { clips, getRig } from '#motion/index.ts';

const ROOT = new URL('../../../', import.meta.url).pathname;
const OUT = join(ROOT, 'dist', 'svg');

await mkdir(OUT, { recursive: true });
for (const clip of clips) {
  const file = `${clip.name}.svg`;
  await writeFile(join(OUT, file), exportSvg(getRig(clip.rig), clip));
  console.log(`wrote dist/svg/${file}`);
}
await writeSvgManifest(clips, OUT);
console.log('wrote dist/svg/manifest.json');
