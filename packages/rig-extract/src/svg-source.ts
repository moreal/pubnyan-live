import { DOMParser, type Element, type Node } from '@xmldom/xmldom';
import { svgPathBbox } from 'svg-path-bbox';
import svgpath from 'svgpath';

export interface SourceSubpath {
  d: string;
  bbox: [number, number, number, number];
}

export interface SourcePath {
  id: string;
  fill: string;
  subpaths: SourceSubpath[];
}

const SKIP_ANCESTORS = new Set(['clipPath', 'defs', 'mask', 'symbol']);
const round2 = (n: number) => Number(n.toFixed(2));

export function readSourceSvg(xml: string): SourcePath[] {
  const doc = new DOMParser().parseFromString(xml, 'image/svg+xml');
  const out: SourcePath[] = [];
  const paths = doc.getElementsByTagName('path');
  for (let i = 0; i < paths.length; i++) {
    const el = paths.item(i)!;
    const transforms: string[] = [];
    let skip = false;
    for (let n: Node | null = el; n && n.nodeType === 1; n = n.parentNode) {
      const e = n as Element;
      if (SKIP_ANCESTORS.has(e.localName ?? e.nodeName)) {
        skip = true;
        break;
      }
      const tf = e.getAttribute('transform');
      if (tf) transforms.push(tf);
    }
    const d = el.getAttribute('d');
    if (skip || !d) continue;
    let p = svgpath(d);
    for (const tf of transforms) p = p.transform(tf);
    const absolute = p.abs().unshort().unarc().round(2).toString();
    const id = el.getAttribute('id') ?? `path-${i}`;
    out.push({ id, fill: readFill(el), subpaths: splitSubpaths(absolute, id) });
  }
  return out;
}

// https://developer.mozilla.org/en-US/docs/Web/CSS/named-color: only the ones rig source SVGs are
// likely to use; anything else must be a hex or rgb() colour.
const NAMED_COLORS: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  gray: '#808080',
  grey: '#808080',
};

function normalizeColor(raw: string): string {
  const value = raw.trim();
  const hex6 = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex6) return `#${hex6[1]!.toLowerCase()}`;
  const hex3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value);
  if (hex3) {
    const [, r, g, b] = hex3;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const rgb = /^rgba?\(\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*(?:,\s*[\d.]+\s*)?\)$/i.exec(value);
  if (rgb) {
    const toByte = (n: string) => {
      const pct = n.endsWith('%');
      const num = Number.parseFloat(n);
      const byte = pct ? Math.round((num / 100) * 255) : Math.round(num);
      return Math.min(255, Math.max(0, byte));
    };
    const [, r, g, b] = rgb;
    return `#${[r!, g!, b!].map((n) => toByte(n).toString(16).padStart(2, '0')).join('')}`;
  }
  const named = NAMED_COLORS[value.toLowerCase()];
  if (named) return named;
  throw new Error(`svg-source: unable to parse fill colour "${raw}"`);
}

function readFill(el: Element): string {
  const style = el.getAttribute('style') ?? '';
  const fromStyle = /(?:^|;)\s*fill\s*:\s*([^;]+)/i.exec(style)?.[1];
  const fill = fromStyle ?? el.getAttribute('fill') ?? '#000000';
  return normalizeColor(fill);
}

/** Lowers a quadratic Bezier control point to the two cubic control points spanning the same curve. */
function quadToCubic(
  sx: number,
  sy: number,
  qx: number,
  qy: number,
  ex: number,
  ey: number,
): [number, number, number, number, number, number] {
  return [
    sx + (2 / 3) * (qx - sx),
    sy + (2 / 3) * (qy - sy),
    ex + (2 / 3) * (qx - ex),
    ey + (2 / 3) * (qy - ey),
    ex,
    ey,
  ];
}

/** Splits absolute path data on M, closes each subpath, drops zero-area artifacts. Converts H/V to L and Q to C (rig paths use only M/L/C/Z). */
export function splitSubpaths(d: string, pathId = ''): SourceSubpath[] {
  const groups: string[][] = [];
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  svgpath(d).iterate((seg) => {
    const args = (seg as unknown as (string | number)[]).slice(1) as number[];
    let cmd = seg[0];
    let text: string;
    if (cmd === 'H') {
      cx = args[0];
      text = `L${cx} ${cy}`;
      cmd = 'L';
    } else if (cmd === 'V') {
      cy = args[0];
      text = `L${cx} ${cy}`;
      cmd = 'L';
    } else if (cmd === 'Q') {
      const [qx, qy, ex, ey] = args;
      const [c1x, c1y, c2x, c2y, endX, endY] = quadToCubic(cx, cy, qx, qy, ex, ey);
      text = `C${c1x} ${c1y} ${c2x} ${c2y} ${endX} ${endY}`;
      cmd = 'C';
      cx = endX;
      cy = endY;
    } else if (cmd !== 'M' && cmd !== 'L' && cmd !== 'C' && cmd !== 'Z' && cmd !== 'z') {
      throw new Error(
        `svg-source: unsupported path command "${seg[0]}" in path "${pathId}"; only M/L/H/V/C/Q/Z are lowered`,
      );
    } else {
      text = seg[0] + args.join(' ');
      if (cmd === 'M') {
        cx = args[0];
        cy = args[1];
        startX = cx;
        startY = cy;
      } else if (cmd === 'L') {
        cx = args[0];
        cy = args[1];
      } else if (cmd === 'C') {
        cx = args[4];
        cy = args[5];
      } else if (cmd === 'Z' || cmd === 'z') {
        cx = startX;
        cy = startY;
      }
    }
    if (cmd === 'M') groups.push([]);
    groups[groups.length - 1].push(text);
  });
  const out: SourceSubpath[] = [];
  for (const g of groups) {
    let sub = g.join('');
    if (!sub.endsWith('Z')) sub += 'Z';
    const [minX, minY, maxX, maxY] = svgPathBbox(sub).map(round2) as [number, number, number, number];
    if ((maxX - minX) * (maxY - minY) < 1) continue;
    out.push({ d: sub, bbox: [minX, minY, maxX, maxY] });
  }
  return out;
}
