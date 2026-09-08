import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { exportLottieBundle } from '#export-lottie/bundle.ts';
import { exportRiveMachine } from '#export-rive/machine.ts';
import { exportVideo } from '#export-video/index.ts';
import { writeSvgManifest } from '#export-svg/manifest.ts';
import { clips, getRig, machine } from '#motion/index.ts';
import { contactSheet } from '#verify/contact-sheet.ts';
import { bundledClipNames, checkDotlottieBundle, machineInputNames } from '#verify/dotlottie-check.ts';
import { fixtureClips } from '#verify/fixtures/clips.ts';
import { checkParity, compareFrames, sampleTimes } from '#verify/parity.ts';
import { referenceFrame } from '#verify/reference.ts';
import { renderRiveStateSequence } from '#verify/rive-machine-check.ts';
import { PARITY_MAX_RATIO } from '#verify/config.ts';
import { Renderer } from '#render/renderer.ts';
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

  // The combined file must render expression inputs faithfully, not just load.
  const machineRig = getRig(machine.rig);
  const machineBytes = exportRiveMachine(machineRig, clips.filter((c) => c.rig === machine.rig), machine);
  await mkdir(join(DIST, 'rive'), {recursive:true});
  await writeFile(join(DIST, 'rive', 'pubnyan.riv'), machineBytes);
  const expressions = ['normal', 'cry', 'curious', 'shy', 'angry', 'normal'];
  const expressionInput = machine.inputs.expression;
  if (expressionInput?.type !== 'enum') throw new Error('expression input must be an enum');
  const machineFrames = await renderRiveStateSequence(renderer, machineRig, machineBytes,
    expressions.map((expression) => ({expression:expressionInput.values.indexOf(expression),seconds:1})));
  const referenceFrames: Buffer[] = [];
  for (const [i, expression] of expressions.entries()) {
    const clipName = machine.layers.expression!.states[expression]!.clip;
    const clip = clips.find((c) => c.name === clipName)!;
    const expected = await referenceFrame(renderer, machineRig, clip, 1);
    referenceFrames.push(expected);
    const diff = compareFrames(expected, machineFrames[i]!);
    const pass = diff.ratio <= PARITY_MAX_RATIO;
    failed ||= !pass;
    report.push({clip:expression, target:'rive-machine', pass, worstT:1, worstRatio:diff.ratio, skipped:[]});
    console.log(`${pass ? 'PASS' : 'FAIL'} ${expression} / rive-machine: ${(diff.ratio * 100).toFixed(3)}%`);
  }
  await writeFile(join(VERIFY_DIR, 'rive-machine-contact.png'), await contactSheet(renderer,
    expressions.map((_, i) => i + 1), [{label:'reference',frames:referenceFrames},{label:'rive-machine',frames:machineFrames}]));

  // Not a parity target: no reference to diff against, just render mp4/webp/gif for each clip.
  for (const clip of clips) {
    const files = await exportVideo(renderer, getRig(clip.rig), clip, join(DIST, 'video'));
    console.log(`wrote ${files.map((f) => f.replace(DIST, 'dist')).join(', ')}`);
  }

  // The .lottie bundle isn't a per-clip parity target: load the real bytes with dotlottie-web
  // and confirm the manifest lists every clip and the state machine's inputs match the machine.
  const bundleRig = getRig(machine.rig);
  const bundleClips = clips.filter((c) => c.rig === machine.rig);
  const bundle = exportLottieBundle(bundleRig, bundleClips, machine);
  await mkdir(join(DIST, 'lottie'), { recursive: true });
  await writeFile(join(DIST, 'lottie', 'pubnyan.lottie'), bundle);
  const wantAnimations = bundledClipNames(clips, machine.rig).sort();
  const wantInputs = machineInputNames(machine).sort();
  try {
    const result = await checkDotlottieBundle(renderer, bundle, 'pubnyan');
    const gotAnimations = [...result.animationIds].sort();
    const gotInputs = [...result.stateMachineInputs].sort();
    const animationsOk = JSON.stringify(gotAnimations) === JSON.stringify(wantAnimations);
    const stateMachineOk = result.stateMachineIds.includes('pubnyan');
    // `stateMachineGetInputs()` also reports each input's backing type and dotLottie's built-in
    // `@elapsedTime`, so this checks that every input machine.ts declares is present, not equality.
    const inputsOk = wantInputs.every((name) => gotInputs.includes(name));
    const pass = animationsOk && stateMachineOk && inputsOk;
    failed ||= !pass;
    console.log(`${pass ? 'PASS' : 'FAIL'} pubnyan.lottie / dotlottie-web: animations=[${gotAnimations}] stateMachines=[${result.stateMachineIds}] inputs=[${gotInputs}]`);
    if (!pass) {
      console.log(`  wanted animations=[${wantAnimations}] inputs=[${wantInputs}]`);
    }
  } catch (err) {
    failed = true;
    console.log(`FAIL pubnyan.lottie / dotlottie-web: ${(err as Error).message}`);
  }
} finally {
  await renderer.close();
}
// The svg target has now written every registered clip, so the manifest matches what is on disk.
await writeSvgManifest(clips, join(DIST, 'svg'));
await writeFile(join(VERIFY_DIR, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`contact sheets in dist/verify/; report.json written`);
process.exit(failed ? 1 : 0);
