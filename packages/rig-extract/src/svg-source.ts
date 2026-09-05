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
    out.push({ id: el.getAttribute('id') ?? `path-${i}`, fill: readFill(el), subpaths: splitSubpaths(absolute) });
  }
  return out;
}

function readFill(el: Element): string {
  const style = el.getAttribute('style') ?? '';
  const fromStyle = /(?:^|;)\s*fill\s*:\s*(#[0-9a-f]{6})/i.exec(style)?.[1];
  const fill = fromStyle ?? el.getAttribute('fill') ?? '#000000';
  return fill.toLowerCase();
}

/** Splits absolute path data on M, closes each subpath, drops zero-area artifacts. Converts H/V to L (rig paths use only M/L/C/Z). */
export function splitSubpaths(d: string): SourceSubpath[] {
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
