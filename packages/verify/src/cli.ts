import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeSvgManifest } from '#export-svg/manifest.ts';
import { clips, getRig } from '#motion/index.ts';
import { contactSheet } from '#verify/contact-sheet.ts';
import { fixtureClips } from '#verify/fixtures/clips.ts';
import { checkParity, sampleTimes } from '#verify/parity.ts';
import { Renderer } from '#verify/renderer.ts';
import { TARGETS } from '#verify/targets/index.ts';

const ROOT = new URL('../../../', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');
const VERIFY_DIR = join(DIST, 'verify');

await mkdir(VERIFY_DIR, { recursive: true });
const renderer = await Renderer.launch();
const report: { clip: string; target: string; pass: boolean; worstT: number; worstRatio: number; skipped: number[] }[] = [];
let failed = false;
try {
  // Fixtures cover branches the registered clips do not reach; they are verified but never exported.
  for (const clip of [...clips, ...fixtureClips]) {
    const registered = clips.includes(clip);
    const rig = getRig(clip.rig);
    const times = sampleTimes(clip);
    const rows: { label: string; frames: Buffer[] }[] = [];
    for (const target of TARGETS) {
      if (registered) await target.export(rig, clip, join(DIST, target.name));
      const result = await checkParity(renderer, rig, clip, target, times);
      if (rows.length === 0) rows.push({ label: 'reference', frames: result.referenceFrames });
      rows.push({ label: target.name, frames: result.targetFrames });
      await writeFile(join(VERIFY_DIR, `${clip.name}-${target.name}-worst.png`), result.worst.diff);
      report.push({ clip: clip.name, target: target.name, pass: result.pass, worstT: result.worst.t, worstRatio: result.worst.ratio, skipped: result.skipped });
      failed ||= !result.pass;
      const status = result.pass ? 'PASS' : 'FAIL';
      const skipNote = result.skipped.length ? ` (skipped t=${result.skipped.join(',')}s: unsupported by target)` : '';
      console.log(`${status} ${clip.name} / ${target.name}: worst ${(result.worst.ratio * 100).toFixed(3)}% at t=${result.worst.t}s${skipNote}`);
    }
    await writeFile(join(VERIFY_DIR, `${clip.name}-contact.png`), await contactSheet(renderer, times, rows));
  }
} finally {
  await renderer.close();
}
// The svg target has now written every registered clip, so the manifest matches what is on disk.
await writeSvgManifest(clips, join(DIST, 'svg'));
await writeFile(join(VERIFY_DIR, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`contact sheets in dist/verify/; report.json written`);
process.exit(failed ? 1 : 0);
