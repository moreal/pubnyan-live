import { EASES } from '#ir/easing.ts';
import type { Clip, EaseName, Key, Property, Rig, Track, TrackValue } from '#ir/types.ts';
import { isVec2 } from '#ir/validate.ts';

export const PROPERTIES: Property[] = ['position', 'rotation', 'scale', 'opacity', 'shape'];

export function key<V>(t: number, v: V, ease?: EaseName): Key<V> {
  return ease === undefined ? { t, v } : { t, v, ease };
}

export function track<P extends Property>(part: string, property: P, keys: Key<TrackValue<P>>[]): Track<P> {
  return { part, property, keys };
}

export function clip(
  name: string,
  opts: { rig: string; duration: number; fps?: number; loop?: boolean },
  tracks: Track[],
): Clip {
  return { name, rig: opts.rig, duration: opts.duration, fps: opts.fps ?? 30, loop: opts.loop ?? true, tracks };
}

export function validateClip(c: Clip, rig: Rig): string[] {
  const errors: string[] = [];
  if (!c.name) errors.push('clip.name is required');
  if (c.rig !== rig.name) errors.push(`clip "${c.name}" targets rig "${c.rig}" but was validated against "${rig.name}"`);
  if (!(c.duration > 0)) errors.push('duration must be positive');
  if (!Number.isInteger(c.fps) || c.fps < 1 || c.fps > 120) errors.push('fps must be an integer in 1..120');
  if (c.tracks.length === 0) errors.push('clip needs at least one track');
  const parts = new Set(rig.parts.map((p) => p.name));
  const seen = new Set<string>();
  for (const [i, tr] of c.tracks.entries()) {
    const at = `tracks[${i}] (${tr.part}.${tr.property})`;
    if (!parts.has(tr.part)) errors.push(`${at}: unknown part "${tr.part}"`);
    if (!PROPERTIES.includes(tr.property)) errors.push(`${at}: unknown property`);
    const id = `${tr.part}.${tr.property}`;
    if (seen.has(id)) errors.push(`${at}: duplicate track for ${id}`);
    seen.add(id);
    if (tr.keys.length === 0) errors.push(`${at}: needs at least one key`);
    let last = -Infinity;
    for (const [k, kf] of tr.keys.entries()) {
      const kat = `${at} keys[${k}]`;
      if (!(kf.t >= 0 && kf.t <= c.duration)) errors.push(`${kat}: t=${kf.t} must be within [0, ${c.duration}]`);
      if (!(kf.t > last)) errors.push(`${kat}: key times must be strictly increasing`);
      last = kf.t;
      if (kf.ease !== undefined && !(kf.ease in EASES)) errors.push(`${kat}: unknown ease "${kf.ease}"`);
      errors.push(...valueErrors(tr.property, kf.v, rig).map((e) => `${kat}: ${e}`));
    }
  }
  return errors;
}

function valueErrors(property: Property, v: unknown, rig: Rig): string[] {
  switch (property) {
    case 'position':
    case 'scale':
      return isVec2(v) ? [] : [`${property} value must be [x, y]`];
    case 'rotation':
      return typeof v === 'number' && Number.isFinite(v) ? [] : ['rotation must be a finite number of degrees'];
    case 'opacity':
      return typeof v === 'number' && v >= 0 && v <= 1 ? [] : ['opacity must be a number in 0..1'];
    case 'shape':
      return typeof v === 'string' && (v === 'default' || v in rig.expressions) ? [] : [`unknown expression "${String(v)}"`];
    default:
      return [`unknown property ${String(property)}`];
  }
}
