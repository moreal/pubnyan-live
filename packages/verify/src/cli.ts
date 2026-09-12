import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { exportLottieBundle } from '#export-lottie/bundle.ts';
import { exportRiveMachine } from '#export-rive/machine.ts';
import { writeSvgManifest } from '#export-svg/manifest.ts';
import { clips, getRig, machine } from '#motion/index.ts';
import { contactSheet } from '#verify/contact-sheet.ts';
import { bundledClipNames, checkDotlottieBundle, machineInputNames } from '#verify/dotlottie-check.ts';
import { fixtureClips } from '#verify/fixtures/clips.ts';
import { compareFrames } from '#verify/parity.ts';
import { referenceFrame } from '#verify/reference.ts';
import { renderRiveStateSequence } from '#verify/rive-machine-check.ts';
import { PARITY_MAX_RATIO } from '#verify/config.ts';
import { Renderer } from '#render/renderer.ts';
import { verifyClips, exportVideoClips, verificationWorkers, type ReportEntry, type ClipTiming } from './pipeline.ts';

const ROOT = new URL('../../../', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');
const VERIFY_DIR = join(DIST, 'verify');

await mkdir(VERIFY_DIR, { recursive: true });
const workers = verificationWorkers();
const started = performance.now();
let renderer: Renderer | undefined;
const report: ReportEntry[] = [];
const timings = { workers, totalMs: 0, phasesMs: {} as Record<string, number>,
  parityClips: [] as ClipTiming[], videoClips: [] as {clip: string; totalMs: number}[] };
const finishPhase = (name: string, start: number) => {
  timings.phasesMs[name] = performance.now() - start;
  const pool = name === 'parity' || name === 'video' ? ` (${workers} workers)` : '';
  console.log(`TIMING ${name}: ${(timings.phasesMs[name]! / 1000).toFixed(2)}s${pool}`);
};
let failed = false;
try {
  // Parallel clips own separate pages. Reference frames are rendered once per clip.
  const parityStarted = performance.now();
  const parity = await verifyClips([...clips, ...fixtureClips], getRig, {
    outputDir: DIST, verifyDir: VERIFY_DIR, workers, shouldExport: clip => clips.includes(clip),
    onResult: result => {
      const skipNote = result.skipped.length ? ` (skipped t=${result.skipped.join(',')}s: unsupported by target)` : '';
      console.log(`${result.pass ? 'PASS' : 'FAIL'} ${result.clip} / ${result.target}: worst ${(result.worstRatio * 100).toFixed(3)}% at t=${result.worstT}s${skipNote}`);
    },
  });
  report.push(...parity.report);
  timings.parityClips = parity.timings;
  failed ||= parity.report.some(result => !result.pass);
  finishPhase('parity', parityStarted);

  const machineStarted = performance.now();
  renderer = await Renderer.launch();
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
    // A bridge runs before the destination's sustained loop starts.
    const bridgeDuration = i ? machine.layers.expression!.bridges?.[expressions[i - 1]!]?.[expression]?.duration ?? 0 : 0;
    const expected = await referenceFrame(renderer, machineRig, clip, 1 - bridgeDuration);
    referenceFrames.push(expected);
    const diff = compareFrames(expected, machineFrames[i]!);
    const pass = diff.ratio <= PARITY_MAX_RATIO;
    failed ||= !pass;
    report.push({clip:expression, target:'rive-machine', pass, worstT:1, worstRatio:diff.ratio, skipped:[]});
    console.log(`${pass ? 'PASS' : 'FAIL'} ${expression} / rive-machine: ${(diff.ratio * 100).toFixed(3)}%`);
  }
  await writeFile(join(VERIFY_DIR, 'rive-machine-contact.png'), await contactSheet(renderer,
    expressions.map((_, i) => i + 1), [{label:'reference',frames:referenceFrames},{label:'rive-machine',frames:machineFrames}]));

  await renderer.close();
  renderer = undefined;
  finishPhase('machine', machineStarted);

  // Video clips also have independent temp directories, output names and pages.
  const videoStarted = performance.now();
  timings.videoClips = await exportVideoClips(clips, getRig, {
    outputDir: join(DIST, 'video'), workers,
    onResult: files => console.log(`wrote ${files.map(file => file.replace(DIST, 'dist')).join(', ')}`),
  });
  finishPhase('video', videoStarted);

  const bundleStarted = performance.now();
  renderer = await Renderer.launch();
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
  finishPhase('bundle', bundleStarted);
} finally {
  await renderer?.close();
  timings.totalMs = performance.now() - started;
  await writeFile(join(VERIFY_DIR, 'timings.json'), JSON.stringify(timings, null, 2) + '\n');
}
// The svg target has now written every registered clip, so the manifest matches what is on disk.
await writeSvgManifest(clips, join(DIST, 'svg'));
await writeFile(join(VERIFY_DIR, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`contact sheets in dist/verify/; report.json written`);
process.exit(failed ? 1 : 0);
