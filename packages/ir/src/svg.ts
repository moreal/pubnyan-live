import type { SampledPart } from '#ir/sample.ts';

export const ATTRIBUTION =
  "pubnyan, the Hackers' Pub mascot, by Bak Eunji. CC BY-SA 4.0. https://github.com/hackers-pub/visual-identity";

const fmt = (n: number) => String(Number(n.toFixed(4)));

/** A static SVG of sampled parts: the reference every exporter is compared against. */
export function renderStaticSvg(parts: SampledPart[], artboard: { width: number; height: number }): string {
  const defs: string[] = [];
  const body = parts
    .map((p, index) => {
      const opacity = p.opacity < 1 ? ` opacity="${fmt(p.opacity)}"` : '';
      const drawing = `<path d="${p.d}" fill="${p.fill}"${opacity} transform="matrix(${p.matrix.map(fmt).join(' ')})"/>`;
      if (p.clipPaths === undefined) return drawing;
      const id = `clip-${index}`;
      defs.push(`<clipPath id="${id}" clipPathUnits="userSpaceOnUse">${p.clipPaths.map(c => `<path d="${c.d}" transform="matrix(${c.matrix.map(fmt).join(' ')})" clip-rule="nonzero"/>`).join('')}</clipPath>`);
      return `<g clip-path="url(#${id})">${drawing}</g>`;
    })
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${artboard.width} ${artboard.height}" width="${artboard.width}" height="${artboard.height}">\n<desc>${ATTRIBUTION}</desc>\n${defs.length ? `<defs>${defs.join('')}</defs>\n` : ''}${body}\n</svg>`;
}
