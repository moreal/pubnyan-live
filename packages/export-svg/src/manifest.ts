import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ATTRIBUTION } from '#ir/svg.ts';
import type { Clip } from '#ir/types.ts';

export interface SvgManifestEntry {
  name: string;
  rig: string;
  duration: number;
  fps: number;
  loop: boolean;
  file: string;
}

export interface SvgManifest {
  attribution: string;
  clips: SvgManifestEntry[];
}

export const svgManifest = (clips: Clip[]): SvgManifest => ({
  attribution: ATTRIBUTION,
  clips: clips.map((c) => ({ name: c.name, rig: c.rig, duration: c.duration, fps: c.fps, loop: c.loop, file: `${c.name}.svg` })),
});

/** Writes `<outDir>/manifest.json` listing every exported clip. Every writer of dist/svg calls this. */
export async function writeSvgManifest(clips: Clip[], outDir: string): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const file = join(outDir, 'manifest.json');
  await writeFile(file, JSON.stringify(svgManifest(clips), null, 2) + '\n');
  return file;
}
