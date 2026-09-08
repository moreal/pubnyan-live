import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { clips, getRig } from '../motion/index.ts';
import { Renderer } from '../packages/render/src/renderer.ts';
import { referenceFrame } from '../packages/verify/src/reference.ts';
import { contactSheet } from '../packages/verify/src/contact-sheet.ts';
import { TARGETS } from '../packages/verify/src/targets/index.ts';

// Full verification sheets can exceed Chrome's 16,384px screenshot texture width.
// Keep all four renderer rows, but curate eight poses including the exact endpoint.
// This is visual review, not a replacement for npm run verify's exhaustive samples.
const poses = {
  idle: [0, 1.18, 1.68, 2.76, 3.23, 3.64, 4.25, 6],
  celebrate: [0, 1/6, 11/30, 29/60, 0.65, 0.85, 1.1, 1.5],
  'ring-wobble': [0, 0.18, 0.34, 0.58, 0.88, 1.04, 1.32, 1.8],
  'tail-flick': [0, 0.18, 0.34, 0.58, 0.88, 1.04, 1.32, 1.8],
  nod: [0, 0.1, 0.24, 0.3, 0.49, 0.63, 0.75, 0.85],
  wink: [0, 0.1, 0.21, 0.39, 0.57, 0.69, 0.8, 0.95],
  tilt: [0, 0.11, 0.32, 0.44, 0.7, 0.97, 1.08, 1.2],
  'head-turn': [0, 0.12, 0.34, 0.49, 0.76, 0.9, 1.13, 1.4],
  'expr-angry': [0, 0.65, 1.15, 1.5, 1.9, 2.65, 3.85, 4.6],
  'expr-cry': [0, 0.65, 0.9, 1.65, 2.5, 3.2, 4.2, 5.2],
  'expr-curious': [0, 0.5, 1.08, 1.52, 2.56, 3.8, 4.5, 5.4],
  'expr-shy': [0, 0.49, 1.06, 2.76, 3.24, 3.83, 4.7, 5.6],
};
const names = process.argv.slice(2);
for (const name of names) if (!clips.some(c => c.name === name)) throw new Error(`Unknown clip: ${name}`);
const selected = clips.filter(c => c.rig === 'pubnyan' && (!names.length || names.includes(c.name)));
const dir = new URL('../dist/verify/', import.meta.url);
await mkdir(dir, { recursive: true });
const renderer = await Renderer.launch();
try {
  for (const clip of selected) {
    const rig = getRig(clip.rig);
    const times = (poses[clip.name] ?? Array.from({length:8}, (_, i) => clip.duration * i / 7))
      .map((t, i) => i === 7 ? clip.duration : Math.min(t, clip.duration));
    const reference = [];
    for (const t of times) reference.push(await referenceFrame(renderer, rig, clip, t));
    const rows = [{ label: 'reference', frames: reference }];
    for (const target of TARGETS) {
      const frames = [];
      // Read the exported SVG without rewriting shared artifacts during a review.
      const svg = target.name === 'svg' ? await readFile(new URL(`../dist/svg/${clip.name}.svg`, import.meta.url), 'utf8') : null;
      for (const t of times) frames.push(svg
        ? await renderer.renderSvg(svg, rig.artboard.width, rig.artboard.height, t * 1000)
        : await target.renderFrame(renderer, rig, clip, t));
      rows.push({label: target.name, frames});
    }
    await writeFile(new URL(`${clip.name}-review.png`, dir), await contactSheet(renderer, times.map(t => Number(t.toFixed(4))), rows));
    console.log(`${clip.name}: ${times.length} poses, reference + ${TARGETS.map(t => t.name).join('/')}`);
  }
} finally { await renderer.close(); }
