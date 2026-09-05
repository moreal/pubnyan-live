import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import type { Clip, Rig } from '#ir/types.ts';
import { PARITY_MAX_RATIO, PIXEL_THRESHOLD } from '#verify/config.ts';
import { referenceFrame } from '#verify/reference.ts';
import type { Renderer } from '#verify/renderer.ts';

export interface Target {
  name: string;
  /** Write the target's files for this clip; returns the paths written. */
  export(rig: Rig, clip: Clip, outDir: string): Promise<string[]>;
  /** Render the target's own output at time t (seconds) to a PNG of artboard size. */
  renderFrame(renderer: Renderer, rig: Rig, clip: Clip, t: number): Promise<Buffer>;
  /**
   * Declares which sample times this target currently claims to reproduce. Omit to claim every
   * time. Targets that are only partially implemented (e.g. a static-frame exporter ahead of its
   * keyframe support) return false for times outside their scope; `checkParity` reports those as
   * skipped rather than comparing frames and silently passing or failing them.
   */
  supportsTime?(clip: Clip, t: number): boolean;
}

export interface FrameDiff {
  width: number;
  height: number;
  diffPixels: number;
  ratio: number;
  diff: Buffer;
}

export function compareFrames(a: Buffer, b: Buffer): FrameDiff {
  const pa = PNG.sync.read(a);
  const pb = PNG.sync.read(b);
  if (pa.width !== pb.width || pa.height !== pb.height) {
    throw new Error(`frame size mismatch: ${pa.width}x${pa.height} vs ${pb.width}x${pb.height}`);
  }
  const diff = new PNG({ width: pa.width, height: pa.height });
  const diffPixels = pixelmatch(pa.data, pb.data, diff.data, pa.width, pa.height, { threshold: PIXEL_THRESHOLD });
  return { width: pa.width, height: pa.height, diffPixels, ratio: diffPixels / (pa.width * pa.height), diff: PNG.sync.write(diff) };
}

/**
 * Every time the exporter and the sampler must agree on: 0, every key time, the midpoint of each
 * consecutive pair (where eases differ most), and `clip.duration`. For a loop clip the last one is
 * the seam: the exporter's 100% frame against the sampler's wrapped t=0.
 */
export function sampleTimes(clip: Clip): number[] {
  const keyTimes = new Set<number>([0, clip.duration]);
  for (const track of clip.tracks) for (const k of track.keys) keyTimes.add(k.t);
  const sorted = [...keyTimes].sort((a, b) => a - b);
  const out = new Set<number>();
  for (const [i, t] of sorted.entries()) {
    out.add(round4(t));
    const next = sorted[i + 1];
    if (next !== undefined) out.add(round4((t + next) / 2));
  }
  return [...out].sort((a, b) => a - b);
}

const round4 = (n: number) => Number(n.toFixed(4));

export interface ParityResult {
  target: string;
  clip: string;
  pass: boolean;
  frames: { t: number; diffPixels: number; ratio: number; skipped: boolean }[];
  worst: { t: number; ratio: number; diff: Buffer };
  referenceFrames: Buffer[];
  targetFrames: Buffer[];
  /** Sample times excluded from pass/fail because `target.supportsTime` returned false. */
  skipped: number[];
}

export async function checkParity(renderer: Renderer, rig: Rig, clip: Clip, target: Target, times = sampleTimes(clip)): Promise<ParityResult> {
  const referenceFrames: Buffer[] = [];
  const targetFrames: Buffer[] = [];
  const frames: ParityResult['frames'] = [];
  const skipped: number[] = [];
  let worst: ParityResult['worst'] | undefined;
  for (const t of times) {
    const ref = await referenceFrame(renderer, rig, clip, t);
    const got = await target.renderFrame(renderer, rig, clip, t);
    const d = compareFrames(ref, got);
    referenceFrames.push(ref);
    targetFrames.push(got);
    const supported = target.supportsTime ? target.supportsTime(clip, t) : true;
    frames.push({ t, diffPixels: d.diffPixels, ratio: d.ratio, skipped: !supported });
    if (!supported) {
      skipped.push(t);
      continue;
    }
    if (!worst || d.ratio > worst.ratio) worst = { t, ratio: d.ratio, diff: d.diff };
  }
  // If every sampled time was skipped there is nothing to assert; that is itself a bug in the
  // target's `supportsTime` (or the sampler), not a pass, so surface it as a failure.
  const pass = worst ? worst.ratio <= PARITY_MAX_RATIO : skipped.length === 0;
  const fallbackWorst = { t: times[0] ?? 0, ratio: 0, diff: targetFrames[0] ?? Buffer.alloc(0) };
  return { target: target.name, clip: clip.name, pass, frames, worst: worst ?? fallbackWorst, referenceFrames, targetFrames, skipped };
}
