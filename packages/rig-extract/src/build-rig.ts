import { svgPathBbox } from 'svg-path-bbox';
import svgpath from 'svgpath';
import type { Rig, RigPart, Vec2 } from '#ir/types.ts';
import { selectPath, type PartsMapRig } from '#rig-extract/parts-map.ts';
import type { SourcePath } from '#rig-extract/svg-source.ts';

const round2 = (n: number) => Number(n.toFixed(2));

function center(d: string): Vec2 {
  const [minX, minY, maxX, maxY] = svgPathBbox(d);
  return [round2((minX + maxX) / 2), round2((minY + maxY) / 2)];
}

export function buildRig(name: string, def: PartsMapRig, files: Record<string, SourcePath[]>): Rig {
  const expressions: Record<string, Record<string, string | null>> = {};
  for (const [expr, e] of Object.entries(def.expressions)) {
    const paths = files[e.file];
    if (!paths) throw new Error(`expression "${expr}": file "${e.file}" was not loaded`);
    const map: Record<string, string | null> = {};
    for (const part of def.parts) {
      const sel = e.map[part.name];
      map[part.name] = sel === undefined ? null : selectPath(paths, sel);
    }
    for (const mapped of Object.keys(e.map)) {
      if (!def.parts.some((p) => p.name === mapped)) throw new Error(`expression "${expr}" maps unknown part "${mapped}"`);
    }
    expressions[expr] = map;
  }
  const base = expressions[def.default];
  if (!base) throw new Error(`default expression "${def.default}" is not defined`);

  if (def.align) {
    const refPath = base[def.align.part];
    if (!refPath) throw new Error(`align part "${def.align.part}" is hidden in the default expression`);
    const ref = center(refPath);
    for (const [expr, map] of Object.entries(expressions)) {
      if (expr === def.default) continue;
      const own = map[def.align.part];
      if (!own) throw new Error(`align part "${def.align.part}" is hidden in expression "${expr}"`);
      const c = center(own);
      const dx = ref[0] - c[0];
      const dy = ref[1] - c[1];
      for (const part of Object.keys(map)) {
        const d = map[part];
        if (d) map[part] = svgpath(d).translate(dx, dy).round(2).toString();
      }
    }
  }

  const parts: RigPart[] = def.parts.map((p) => {
    const path = base[p.name];
    const part: RigPart = { name: p.name, fill: p.fill, pivot: p.pivot ?? (path ? center(path) : [0, 0]), path };
    if (p.parent !== undefined) part.parent = p.parent;
    return part;
  });
  return { name, artboard: def.artboard, parts, expressions };
}
