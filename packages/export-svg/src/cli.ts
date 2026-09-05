import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { exportSvg } from '#export-svg/index.ts';
import { ATTRIBUTION } from '#ir/svg.ts';
import { clips, getRig } from '#motion/index.ts';

const ROOT = new URL('../../../', import.meta.url).pathname;
const OUT = join(ROOT, 'dist', 'svg');

await mkdir(OUT, { recursive: true });
const manifest: Record<string, unknown>[] = [];
for (const clip of clips) {
  const file = `${clip.name}.svg`;
  await writeFile(join(OUT, file), exportSvg(getRig(clip.rig), clip));
  manifest.push({ name: clip.name, rig: clip.rig, duration: clip.duration, fps: clip.fps, loop: clip.loop, file });
  console.log(`wrote dist/svg/${file}`);
}
await writeFile(join(OUT, 'manifest.json'), JSON.stringify({ attribution: ATTRIBUTION, clips: manifest }, null, 2) + '\n');
