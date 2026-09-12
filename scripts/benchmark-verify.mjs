#!/usr/bin/env node
// Run alone: SVG round-trip verification writes its usual dist/svg files.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { clips, getRig } from '../motion/index.ts';
import { verifyClips, exportVideoClips, verificationWorkers } from '../packages/verify/src/pipeline.ts';

const { values } = parseArgs({ options: {
  workers: { type: 'string' },
  clips: { type: 'string', default: 'expr-curious,expr-cry' },
  stage: { type: 'string', default: 'both' },
} });
const workers = verificationWorkers(values.workers);
if (!['parity', 'video', 'both'].includes(values.stage)) throw new Error('--stage must be parity, video, or both');
const names = [...new Set(values.clips.split(','))];
const selected = names.map(name => {
  const clip = clips.find(clip => clip.name === name);
  if (!clip) throw new Error(`unknown clip: ${name}`);
  return clip;
});
const outputDir = await mkdtemp(join(tmpdir(), 'pubnyan-verify-benchmark-'));
const result = { node: process.version, platform: process.platform, arch: process.arch, workers, clips: names, stages: {} };
try {
  if (values.stage !== 'video') {
    const started = performance.now();
    const parity = await verifyClips(selected, getRig, { outputDir, verifyDir: join(outputDir, 'verify'), workers });
    if (parity.report.some(entry => !entry.pass)) throw new Error('benchmark parity failed');
    result.stages.parity = { seconds: (performance.now() - started) / 1000, clips: parity.timings };
  }
  if (values.stage !== 'parity') {
    const started = performance.now();
    const timings = await exportVideoClips(selected, getRig, { outputDir: join(outputDir, 'video'), workers });
    result.stages.video = { seconds: (performance.now() - started) / 1000, clips: timings };
  }
  const dir = new URL('../dist/verify/', import.meta.url);
  await mkdir(dir, { recursive: true });
  await writeFile(new URL(`benchmark-${workers}-workers.json`, dir), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally {
  await rm(outputDir, { recursive: true, force: true });
}
