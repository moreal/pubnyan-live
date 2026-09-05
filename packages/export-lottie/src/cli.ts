import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { exportLottie } from '#export-lottie/index.ts';
import { exportLottieBundle } from '#export-lottie/bundle.ts';
import { clips, getRig, machine } from '#motion/index.ts';

const ROOT = new URL('../../../', import.meta.url).pathname;
const OUT = join(ROOT, 'dist', 'lottie');

await mkdir(OUT, { recursive: true });
for (const clip of clips) {
  const file = `${clip.name}.json`;
  await writeFile(join(OUT, file), JSON.stringify(exportLottie(getRig(clip.rig), clip), null, 2));
  console.log(`wrote dist/lottie/${file}`);
}

const bundleRig = getRig(machine.rig);
const bundleClips = clips.filter((c) => c.rig === machine.rig);
await writeFile(join(OUT, 'pubnyan.lottie'), exportLottieBundle(bundleRig, bundleClips, machine));
console.log('wrote dist/lottie/pubnyan.lottie');
