import type { SampledPart } from '#ir/sample.ts';

export const ATTRIBUTION =
  "pubnyan, the Hackers' Pub mascot, by Bak Eunji. CC BY-SA 4.0. https://github.com/hackers-pub/visual-identity";

const fmt = (n: number) => String(Number(n.toFixed(4)));

/** A static SVG of sampled parts: the reference every exporter is compared against. */
export function renderStaticSvg(parts: SampledPart[], artboard: { width: number; height: number }): string {
  const body = parts
    .map((p) => {
      const opacity = p.opacity < 1 ? ` opacity="${fmt(p.opacity)}"` : '';
      return `<path d="${p.d}" fill="${p.fill}"${opacity} transform="matrix(${p.matrix.map(fmt).join(' ')})"/>`;
    })
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${artboard.width} ${artboard.height}" width="${artboard.width}" height="${artboard.height}">\n<desc>${ATTRIBUTION}</desc>\n${body}\n</svg>`;
}
