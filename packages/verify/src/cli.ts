import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateClip } from '#ir/clip.ts';
import { assertValid, validateRig } from '#ir/validate.ts';
import { clips, getRig, rigs } from '#motion/index.ts';
import { contactSheet } from '#verify/contact-sheet.ts';
import { checkParity, sampleTimes, type Target } from '#verify/parity.ts';
import { Renderer } from '#verify/renderer.ts';
import { svgTarget } from '#verify/targets/svg.ts';

/** Every exporter under test. New targets register here. */
export const TARGETS: Target[] = [svgTarget];

const ROOT = new URL('../../../', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');
const VERIFY_DIR = join(DIST, 'verify');

for (const rig of Object.values(rigs)) assertValid(validateRig(rig), `rig ${rig.name}`);
for (const clip of clips) assertValid(validateClip(clip, getRig(clip.rig)), `clip ${clip.name}`);

await mkdir(VERIFY_DIR, { recursive: true });
const renderer = await Renderer.launch();
const report: { clip: string; target: string; pass: boolean; worstT: number; worstRatio: number }[] = [];
let failed = false;
try {
  for (const clip of clips) {
    const rig = getRig(clip.rig);
    const times = sampleTimes(clip);
    const rows: { label: string; frames: Buffer[] }[] = [];
    for (const target of TARGETS) {
      await target.export(rig, clip, join(DIST, target.name));
      const result = await checkParity(renderer, rig, clip, target, times);
      if (rows.length === 0) rows.push({ label: 'reference', frames: result.referenceFrames });
      rows.push({ label: target.name, frames: result.targetFrames });
      await writeFile(join(VERIFY_DIR, `${clip.name}-${target.name}-worst.png`), result.worst.diff);
      report.push({ clip: clip.name, target: target.name, pass: result.pass, worstT: result.worst.t, worstRatio: result.worst.ratio });
      failed ||= !result.pass;
      console.log(`${result.pass ? 'PASS' : 'FAIL'} ${clip.name} / ${target.name}: worst ${(result.worst.ratio * 100).toFixed(3)}% at t=${result.worst.t}s`);
    }
    await writeFile(join(VERIFY_DIR, `${clip.name}-contact.png`), await contactSheet(renderer, times, rows));
  }
} finally {
  await renderer.close();
}
await writeFile(join(VERIFY_DIR, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`contact sheets in dist/verify/; report.json written`);
process.exit(failed ? 1 : 0);
