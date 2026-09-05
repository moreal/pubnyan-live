import { sampleClip } from '#ir/sample.ts';
import { renderStaticSvg } from '#ir/svg.ts';
import type { Clip, Rig } from '#ir/types.ts';
import type { Renderer } from '#verify/renderer.ts';

/** The ground truth: sampleClip() drawn as a static SVG. */
export function referenceFrame(renderer: Renderer, rig: Rig, clip: Clip, t: number): Promise<Buffer> {
  return renderer.renderSvg(renderStaticSvg(sampleClip(rig, clip, t), rig.artboard), rig.artboard.width, rig.artboard.height);
}
