import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { availableParallelism } from 'node:os';
import type { Clip, Rig } from '#ir/types.ts';
import { Renderer } from '#render/renderer.ts';
import { exportVideo } from '#export-video/index.ts';
import { contactSheet } from '#verify/contact-sheet.ts';
import { checkParity, sampleTimes } from '#verify/parity.ts';
import { referenceFrame } from '#verify/reference.ts';
import { TARGETS } from '#verify/targets/index.ts';
import { runWorkers } from './workers.ts';

export interface ReportEntry {
  clip: string; target: string; pass: boolean; worstT: number; worstRatio: number; skipped: number[];
}
export interface ClipTiming {
  clip: string;
  totalMs: number;
  referenceMs: number;
  targetMs: Record<string, number>;
  contactMs: number;
}
export interface PipelineOptions {
  outputDir: string;
  verifyDir: string;
  workers: number;
  shouldExport?: (clip: Clip) => boolean;
  onResult?: (entry: ReportEntry) => void;
}

/** Keep the default conservative: Chrome and encoders also have their own threads. */
export function verificationWorkers(raw = process.env.VERIFY_WORKERS): number {
  const workers = raw === undefined ? Math.min(2, availableParallelism()) : Number(raw);
  if (!Number.isSafeInteger(workers) || workers < 1) throw new Error('VERIFY_WORKERS must be a positive integer');
  return workers;
}

/** Each clip exclusively owns one worker's page. Never share a Renderer across jobs. */
export async function verifyClips(clips: readonly Clip[], getRig: (name: string) => Rig, options: PipelineOptions) {
  await mkdir(options.verifyDir, { recursive: true });
  const results = await runWorkers(clips, options.workers, () => Renderer.launch(), async (renderer, clip) => {
    const started = performance.now();
    const rig = getRig(clip.rig);
    const times = sampleTimes(clip);
    const referenceStarted = performance.now();
    const referenceFrames: Buffer[] = [];
    for (const t of times) referenceFrames.push(await referenceFrame(renderer, rig, clip, t));
    const timing: ClipTiming = { clip: clip.name, totalMs: 0, referenceMs: performance.now() - referenceStarted, targetMs: {}, contactMs: 0 };
    const rows = [{ label: 'reference', frames: referenceFrames }];
    const entries: ReportEntry[] = [];
    for (const target of TARGETS) {
      const targetStarted = performance.now();
      if (options.shouldExport?.(clip) ?? true) await target.export(rig, clip, join(options.outputDir, target.name));
      const result = await checkParity(renderer, rig, clip, target, times, referenceFrames);
      rows.push({ label: target.name, frames: result.targetFrames });
      await writeFile(join(options.verifyDir, `${clip.name}-${target.name}-worst.png`), result.worst.diff);
      const entry = { clip: clip.name, target: target.name, pass: result.pass, worstT: result.worst.t,
        worstRatio: result.worst.ratio, skipped: result.skipped };
      entries.push(entry);
      timing.targetMs[target.name] = performance.now() - targetStarted;
      options.onResult?.(entry);
    }
    const contactStarted = performance.now();
    await writeFile(join(options.verifyDir, `${clip.name}-contact.png`), await contactSheet(renderer, times, rows));
    timing.contactMs = performance.now() - contactStarted;
    timing.totalMs = performance.now() - started;
    return { entries, timing };
  }, renderer => renderer.close());
  return { report: results.flatMap(result => result.entries), timings: results.map(result => result.timing) };
}

export async function exportVideoClips(clips: readonly Clip[], getRig: (name: string) => Rig,
  options: { outputDir: string; workers: number; onResult?: (files: string[]) => void }) {
  return runWorkers(clips, options.workers, () => Renderer.launch(), async (renderer, clip) => {
    const started = performance.now();
    const files = await exportVideo(renderer, getRig(clip.rig), clip, options.outputDir);
    options.onResult?.(files);
    return { clip: clip.name, totalMs: performance.now() - started };
  }, renderer => renderer.close());
}
