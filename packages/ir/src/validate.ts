import type { Rig, Vec2 } from '#ir/types.ts';

export const isVec2 = (v: unknown): v is Vec2 =>
  Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n));

/** Absolute path data restricted to M/L/C/Z. Rejects relative commands and arcs. */
export const isPathData = (d: unknown): d is string =>
  typeof d === 'string' && /^M[0-9.\s\-eMLCZ]*$/.test(d);

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
