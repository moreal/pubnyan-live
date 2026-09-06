import { join } from 'node:path';
import { exportVideo } from '#export-video/index.ts';
import { clips, getRig } from '#motion/index.ts';
import { Renderer } from '#verify/renderer.ts';

const ROOT = new URL('../../../', import.meta.url).pathname;
const OUT = join(ROOT, 'dist', 'video');

const renderer = await Renderer.launch();
try {
  for (const clip of clips) {
    const files = await exportVideo(renderer, getRig(clip.rig), clip, OUT);
    for (const file of files) console.log(`wrote ${file.replace(ROOT, '')}`);
  }
} finally {
  await renderer.close();
}
