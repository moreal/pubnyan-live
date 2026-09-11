import { svgPathBbox } from 'svg-path-bbox';
import svgpath from 'svgpath';
import { ATTRIBUTION } from '#ir/svg.ts';
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
  const overridePaths = def.overridesFile ? files[def.overridesFile] : undefined;
  if (def.overridesFile && !overridePaths) throw new Error(`overrides file "${def.overridesFile}" was not loaded`);
  for (const [expr, e] of Object.entries(def.expressions)) {
    const paths = files[e.file];
    if (!paths) throw new Error(`expression "${expr}": file "${e.file}" was not loaded`);
    for (const mapped of Object.keys(e.map)) {
      if (!def.parts.some((p) => p.name === mapped)) throw new Error(`expression "${expr}" maps unknown part "${mapped}"`);
    }
    for (const mapped of Object.keys(e.overrides ?? {})) {
      if (!def.parts.some((p) => p.name === mapped)) throw new Error(`expression "${expr}" overrides unknown part "${mapped}"`);
    }
    // Only mapped parts get an entry: an absent part inherits its default path, an explicit null hides it.
    const map: Record<string, string | null> = {};
    for (const part of def.parts) {
      if (!(part.name in e.map)) continue;
      const sel = e.map[part.name];
      map[part.name] = sel === null ? null : selectPath(paths, sel);
    }
    expressions[expr] = map;
  }
  const base = expressions[def.default];
  if (!base) throw new Error(`default expression "${def.default}" is not defined`);

  if (def.align) {
    const part = def.align.part;
    const refPath = base[part];
    if (refPath === undefined) throw new Error(`default expression "${def.default}" must map the align part "${part}"`);
    if (refPath === null) throw new Error(`align part "${part}" is hidden in the default expression`);
    const ref = center(refPath);
    for (const [expr, map] of Object.entries(expressions)) {
      if (expr === def.default) continue;
      const own = map[part];
      if (own === undefined) throw new Error(`expression "${expr}" must map the align part "${part}"; inherited paths are not aligned`);
      if (own === null) throw new Error(`align part "${part}" is hidden in expression "${expr}"`);
      const c = center(own);
      const dx = ref[0] - c[0];
      const dy = ref[1] - c[1];
      for (const mapped of Object.keys(map)) {
        const d = map[mapped];
        if (d) map[mapped] = svgpath(d).translate(dx, dy).round(2).toString();
      }
    }
  }

  // Overrides are applied after alignment: they're authored directly in the rig's final
  // coordinate space, so they replace whatever `map` (and alignment) produced.
  for (const [expr, e] of Object.entries(def.expressions)) {
    if (!e.overrides) continue;
    if (!overridePaths) throw new Error(`expression "${expr}" has overrides but rig "${name}" has no overridesFile`);
    const map = expressions[expr];
    for (const [part, sel] of Object.entries(e.overrides)) {
      map[part] = selectPath(overridePaths, sel);
    }
  }

  const parts: RigPart[] = def.parts.map((p) => {
    const path = base[p.name] ?? null;
    const part: RigPart = { name: p.name, fill: p.fill, pivot: p.pivot ?? (path ? center(path) : [0, 0]), path };
    if (p.parent !== undefined) part.parent = p.parent;
    if (p.clipTo !== undefined) part.clipTo = p.clipTo;
    return part;
  });
  return { name, artboard: def.artboard, attribution: ATTRIBUTION, parts, expressions };
}
