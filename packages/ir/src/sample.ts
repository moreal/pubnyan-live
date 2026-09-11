import { easeValue } from '#ir/easing.ts';
import { IDENTITY, localMatrix, multiply } from '#ir/matrix.ts';
import { interpolatePath } from '#ir/path.ts';
import type { Clip, Key, Matrix, Property, Rig, RigPart, Track, Vec2 } from '#ir/types.ts';

export interface ClipPath {
  d: string;
  matrix: Matrix;
}

export interface SampledPart {
  name: string;
  fill: string;
  d: string;
  opacity: number;
  matrix: Matrix;
  /** World-space geometric aperture. Undefined is unclipped; [] is fully clipped. */
  clipPaths?: ClipPath[];
}

export const REST = Object.freeze({
  position: Object.freeze([0, 0]) as Vec2,
  rotation: 0,
  scale: Object.freeze([1, 1]) as Vec2,
  opacity: 1,
  shape: 'default',
});

/** The keys around t and the eased progress from `from` to `to`. Holds outside the key range. */
export function locate<V>(keys: Key<V>[], t: number): { from: Key<V>; to: Key<V>; p: number } {
  if (t <= keys[0].t) return { from: keys[0], to: keys[0], p: 0 };
  const last = keys[keys.length - 1];
  if (t >= last.t) return { from: last, to: last, p: 0 };
  let i = 0;
  while (keys[i + 1].t <= t) i++;
  const from = keys[i];
  const to = keys[i + 1];
  return { from, to, p: easeValue(to.ease ?? 'linear', (t - from.t) / (to.t - from.t)) };
}

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

export function sampleNumeric(track: Track<'rotation' | 'opacity'>, t: number): number {
  const { from, to, p } = locate(track.keys, t);
  return lerp(from.v, to.v, p);
}

export function sampleVec2(track: Track<'position' | 'scale'>, t: number): Vec2 {
  const { from, to, p } = locate(track.keys, t);
  return [lerp(from.v[0], to.v[0], p), lerp(from.v[1], to.v[1], p)];
}

export function wrapTime(clip: Clip, t: number): number {
  if (clip.loop) return ((t % clip.duration) + clip.duration) % clip.duration;
  return Math.min(Math.max(t, 0), clip.duration);
}

export function resolvePath(rig: Rig, part: RigPart, expression: string): string | null {
  if (expression === 'default') return part.path;
  const e = rig.expressions[expression];
  if (!e) throw new Error(`unknown expression "${expression}" in rig "${rig.name}"`);
  return e[part.name] === undefined ? part.path : e[part.name];
}

export type TracksByProperty = Partial<{ [P in Property]: Track<P> }>;

export function groupTracks(clip: Clip): Map<string, TracksByProperty> {
  const byPart = new Map<string, TracksByProperty>();
  for (const tr of clip.tracks) {
    const m = byPart.get(tr.part) ?? {};
    (m as Record<string, Track>)[tr.property] = tr;
    byPart.set(tr.part, m);
  }
  return byPart;
}

/** Shape of a part at time t: one entry (static or morphed) or two entries crossfading. */
export function sampleShape(rig: Rig, part: RigPart, track: Track<'shape'> | undefined, t: number): { d: string; opacity: number }[] {
  if (!track) return part.path ? [{ d: part.path, opacity: 1 }] : [];
  const { from, to, p } = locate(track.keys, t);
  const a = resolvePath(rig, part, from.v);
  const b = resolvePath(rig, part, to.v);
  if (p === 0 || from.v === to.v) return a ? [{ d: a, opacity: 1 }] : [];
  if (a && b) {
    const m = interpolatePath(a, b, p);
    if (m) return [{ d: m, opacity: 1 }];
  }
  const out: { d: string; opacity: number }[] = [];
  if (a) out.push({ d: a, opacity: 1 - p });
  if (b) out.push({ d: b, opacity: p });
  return out;
}

export function sampleClip(rig: Rig, clip: Clip, time: number): SampledPart[] {
  const t = wrapTime(clip, time);
  const byPart = groupTracks(clip);
  const world = new Map<string, Matrix>();
  const apertures = new Map<string, ClipPath[]>();
  const out: SampledPart[] = [];
  for (const part of rig.parts) {
    const tracks = byPart.get(part.name) ?? {};
    const position = tracks.position ? sampleVec2(tracks.position, t) : REST.position;
    const rotation = tracks.rotation ? sampleNumeric(tracks.rotation, t) : REST.rotation;
    const sc = tracks.scale ? sampleVec2(tracks.scale, t) : REST.scale;
    const opacity = tracks.opacity ? sampleNumeric(tracks.opacity, t) : REST.opacity;
    const parent = part.parent ? world.get(part.parent) : undefined;
    const matrix = multiply(parent ?? IDENTITY, localMatrix(part.pivot, position, rotation, sc));
    world.set(part.name, matrix);
    const shapes = sampleShape(rig, part, tracks.shape, t);
    apertures.set(part.name, shapes.filter(s => s.opacity > 0).map(s => ({ d: s.d, matrix })));
    const clipPaths = part.clipTo === undefined ? undefined : apertures.get(part.clipTo) ?? [];
    for (const shape of shapes) {
      const o = opacity * shape.opacity;
      if (o <= 0) continue;
      out.push({ name: part.name, fill: part.fill, d: shape.d, opacity: o, matrix, ...(clipPaths === undefined ? {} : { clipPaths }) });
    }
  }
  return out;
}

/** Every visible part of an expression at rest: identity transforms, full opacity. */
export function staticParts(rig: Rig, expression: string): SampledPart[] {
  const out: SampledPart[] = [];
  const apertures = new Map<string, ClipPath[]>();
  for (const part of rig.parts) {
    const d = resolvePath(rig, part, expression);
    apertures.set(part.name, d ? [{ d, matrix: IDENTITY }] : []);
    const clipPaths = part.clipTo === undefined ? undefined : apertures.get(part.clipTo) ?? [];
    if (d) out.push({ name: part.name, fill: part.fill, d, opacity: 1, matrix: IDENTITY, ...(clipPaths === undefined ? {} : { clipPaths }) });
  }
  return out;
}
