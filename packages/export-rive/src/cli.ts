import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { exportRive } from '#export-rive/index.ts';
import { exportRiveMachine } from '#export-rive/machine.ts';
import { clips, getRig, machine } from '#motion/index.ts';

const ROOT = new URL('../../../', import.meta.url).pathname;
const OUT = join(ROOT, 'dist', 'rive');

await mkdir(OUT, { recursive: true });
for (const clip of clips) {
  const file = `${clip.name}.riv`;
  await writeFile(join(OUT, file), exportRive(getRig(clip.rig), clip));
  console.log(`wrote dist/rive/${file}`);
}

await writeFile(
  join(OUT, 'pubnyan.riv'),
  exportRiveMachine(
    getRig(machine.rig),
    clips.filter((c) => c.rig === machine.rig),
    machine,
  ),
);
console.log('wrote dist/rive/pubnyan.riv');
