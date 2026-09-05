import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { exportRive } from '#export-rive/index.ts';
import { clips, getRig } from '#motion/index.ts';

const ROOT = new URL('../../../', import.meta.url).pathname;
const OUT = join(ROOT, 'dist', 'rive');

await mkdir(OUT, { recursive: true });
for (const clip of clips) {
  const file = `${clip.name}.riv`;
  await writeFile(join(OUT, file), exportRive(getRig(clip.rig), clip));
  console.log(`wrote dist/rive/${file}`);
}
