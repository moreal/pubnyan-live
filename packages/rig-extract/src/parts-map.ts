import type { Vec2 } from '#ir/types.ts';
import type { SourcePath, SourceSubpath } from '#rig-extract/svg-source.ts';

export interface PartsMapPart {
  name: string;
  fill: string;
  parent?: string;
  /** Defaults to the bbox centre of the part's default path. */
  pivot?: Vec2;
}

export interface PartsMapExpression {
  /** File name inside `source`. */
  file: string;
  /** part name -> selector(s). Unmapped parts are hidden in this expression. */
  map: Record<string, string | string[]>;
}

export interface PartsMapRig {
  artboard: { width: number; height: number };
  /** Expression whose paths become the parts' default paths. */
  default: string;
  /** Translate every other expression so this part's bbox centre matches the default expression. */
  align?: { part: string };
  parts: PartsMapPart[];
  expressions: Record<string, PartsMapExpression>;
}

export interface PartsMap {
  source: string;
  rigs: Record<string, PartsMapRig>;
}

const area = (s: SourceSubpath) => (s.bbox[2] - s.bbox[0]) * (s.bbox[3] - s.bbox[1]);

/**
 * Selector grammar: `id` (all subpaths), `id#outer` (largest bbox), `id#rest` (all but outer), `id#<n>` (nth).
 * A list of selectors concatenates.
 */
export function selectPath(paths: SourcePath[], selector: string | string[]): string {
  if (Array.isArray(selector)) return selector.map((s) => selectPath(paths, s)).join('');
  const [id, which = 'all'] = selector.split('#');
  const path = paths.find((p) => p.id === id);
  if (!path) throw new Error(`selector "${selector}": no path with id "${id}"`);
  const subs = path.subpaths;
  if (subs.length === 0) throw new Error(`selector "${selector}": path has no usable subpaths`);
  const outer = subs.reduce((a, b) => (area(b) > area(a) ? b : a));
  let chosen: SourceSubpath[];
  if (which === 'all') chosen = subs;
  else if (which === 'outer') chosen = [outer];
  else if (which === 'rest') chosen = subs.filter((s) => s !== outer);
  else {
    const n = Number(which);
    if (!Number.isInteger(n) || n < 0 || n >= subs.length) {
      throw new Error(`selector "${selector}": subpath index out of range (0..${subs.length - 1})`);
    }
    chosen = [subs[n]];
  }
  if (chosen.length === 0) throw new Error(`selector "${selector}" selected nothing`);
  return chosen.map((s) => s.d).join('');
}
