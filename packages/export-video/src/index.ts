import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportSvg } from '#export-svg/index.ts';
import type { Clip, Rig } from '#ir/types.ts';
import type { Renderer } from '#verify/renderer.ts';

/**
 * Sample times for a clip at its own fps: `round(duration * fps)` evenly spaced frames covering
 * one period. Non-looping clips get one extra frame holding the final pose, since a loop's last
 * frame is meant to hand off to the wrapped t=0 instead of restating it.
 */
export function frameTimes(clip: Clip): number[] {
  const count = Math.max(1, Math.round(clip.duration * clip.fps));
  const times = Array.from({ length: count }, (_, i) => (i / count) * clip.duration);
  if (!clip.loop) times.push(clip.duration);
  return times;
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`))));
  });
}

/**
 * Renders `clip` through the svg target at `clip.fps` to PNG frames in a temp dir, then shells
 * out to `ffmpeg` to produce an h264/yuv420p mp4, an animated webp, and a palette-quantized gif
 * in `outDir`. Not a parity target: there is no `renderFrame` to compare against the sampler.
 */
export async function exportVideo(renderer: Renderer, rig: Rig, clip: Clip, outDir: string): Promise<string[]> {
  const tmp = await mkdtemp(join(tmpdir(), `pubnyan-video-${clip.name}-`));
  try {
    const svg = exportSvg(rig, clip);
    const times = frameTimes(clip);
    const pad = String(times.length).length;
    for (const [i, t] of times.entries()) {
      const frame = await renderer.renderSvg(svg, rig.artboard.width, rig.artboard.height, t * 1000);
      await writeFile(join(tmp, `frame-${String(i).padStart(pad, '0')}.png`), frame);
    }
    const pattern = join(tmp, `frame-%0${pad}d.png`);
    await mkdir(outDir, { recursive: true });

    const mp4 = join(outDir, `${clip.name}.mp4`);
    await run('ffmpeg', [
      '-y',
      '-framerate', String(clip.fps),
      '-i', pattern,
      '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2:0:0:white',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      mp4,
    ]);

    // ffmpeg on this box has no libwebp encoder (only a decoder); img2webp is the same libwebp
    // project's own frame-muxer and needs no encoder registration, so it stands in for it here.
    const webp = join(outDir, `${clip.name}.webp`);
    const frames = (await readdir(tmp)).filter((f) => f.endsWith('.png')).sort();
    const delayMs = Math.round(1000 / clip.fps);
    await run('img2webp', ['-loop', '0', '-d', String(delayMs), ...frames.map((f) => join(tmp, f)), '-o', webp]);

    const palette = join(tmp, 'palette.png');
    await run('ffmpeg', ['-y', '-framerate', String(clip.fps), '-i', pattern, '-vf', 'palettegen', palette]);
    const gif = join(outDir, `${clip.name}.gif`);
    await run('ffmpeg', ['-y', '-framerate', String(clip.fps), '-i', pattern, '-i', palette, '-lavfi', 'paletteuse', '-loop', '0', gif]);

    return [mp4, webp, gif];
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
