import { parsePath } from '#ir/path.ts';
import type { Rig, Vec2 } from '#ir/types.ts';

export const isVec2 = (v: unknown): v is Vec2 =>
  Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n));

/** Absolute path data restricted to M/L/C/Z. Rejects relative commands, arcs, and malformed data. */
export const isPathData = (d: unknown): d is string => {
  if (typeof d !== 'string' || !d.startsWith('M')) return false;
  try {
    const segs = parsePath(d);
    return segs.length > 0 && segs[0][0] === 'M';
  } catch {
    return false;
  }
};

export function validateRig(rig: Rig): string[] {
  const errors: string[] = [];
  if (!rig.name) errors.push('rig.name is required');
  if (!(rig.artboard?.width > 0 && rig.artboard?.height > 0)) errors.push('artboard width and height must be positive');
  if (!Array.isArray(rig.parts) || rig.parts.length === 0) errors.push('rig needs at least one part');
  const seen = new Set<string>();
  for (const [i, part] of (rig.parts ?? []).entries()) {
    const at = `parts[${i}] (${part.name})`;
    if (!part.name) errors.push(`${at}: name is required`);
    if (seen.has(part.name)) errors.push(`${at}: duplicate part name`);
    if (!/^#[0-9a-f]{6}$/i.test(part.fill)) errors.push(`${at}: fill must be #rrggbb`);
    if (!isVec2(part.pivot)) errors.push(`${at}: pivot must be [x, y]`);
    if (part.parent !== undefined && !seen.has(part.parent)) {
      errors.push(`${at}: parent "${part.parent}" must be declared before this part`);
    }
    if (part.path !== null && !isPathData(part.path)) errors.push(`${at}: path must be null or absolute M/L/C/Z path data`);
    seen.add(part.name);
  }
  for (const [expr, map] of Object.entries(rig.expressions ?? {})) {
    for (const [name, d] of Object.entries(map)) {
      if (!seen.has(name)) errors.push(`expressions.${expr}: unknown part "${name}"`);
      if (d !== null && !isPathData(d)) errors.push(`expressions.${expr}.${name}: path must be null or absolute M/L/C/Z path data`);
    }
  }
  return errors;
}

export function assertValid(errors: string[], label: string): void {
  if (errors.length > 0) throw new Error(`${label} is invalid:\n- ${errors.join('\n- ')}`);
}

/** Structural check that narrows `unknown` (e.g. a parsed JSON rig file) to `Rig`, without judging content. */
export function isRig(data: unknown): data is Rig {
  if (typeof data !== 'object' || data === null) return false;
  const r = data as Record<string, unknown>;
  if (typeof r.name !== 'string') return false;
  if (typeof r.artboard !== 'object' || r.artboard === null) return false;
  const artboard = r.artboard as Record<string, unknown>;
  if (typeof artboard.width !== 'number' || typeof artboard.height !== 'number') return false;
  if (r.attribution !== undefined && typeof r.attribution !== 'string') return false;
  if (!Array.isArray(r.parts)) return false;
  for (const p of r.parts) {
    if (typeof p !== 'object' || p === null) return false;
    const part = p as Record<string, unknown>;
    if (typeof part.name !== 'string') return false;
    if (typeof part.fill !== 'string') return false;
    if (!isVec2(part.pivot)) return false;
    if (part.parent !== undefined && typeof part.parent !== 'string') return false;
    if (part.path !== null && typeof part.path !== 'string') return false;
  }
  if (typeof r.expressions !== 'object' || r.expressions === null) return false;
  for (const map of Object.values(r.expressions as Record<string, unknown>)) {
    if (typeof map !== 'object' || map === null) return false;
    for (const path of Object.values(map as Record<string, unknown>)) {
      if (path !== null && typeof path !== 'string') return false;
    }
  }
  return true;
}

/** Parses and fully validates an untyped rig (e.g. `import ... with { type: 'json' }`), narrowing to `Rig`. */
export function loadRig(data: unknown, label: string): Rig {
  if (!isRig(data)) throw new Error(`rig ${label} is not a well-formed rig: unexpected shape`);
  assertValid(validateRig(data), `rig ${label}`);
  return data;
}
