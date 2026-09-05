import { EASES } from '#ir/easing.ts';
import { parsePath, type Segment } from '#ir/path.ts';
import { groupTracks, REST, type TracksByProperty } from '#ir/sample.ts';
import type { Clip, Key, Rig, RigPart, Vec2 } from '#ir/types.ts';

export interface LottieShapePath {
  ty: 'sh';
  ks: { a: 0; k: { i: number[][]; o: number[][]; v: number[][]; c: boolean } };
  nm: string;
}

export interface LottieFill {
  ty: 'fl';
  c: { a: 0; k: [number, number, number, number] };
  o: { a: 0; k: 100 };
  nm: string;
}

export interface LottieGroupTransform {
  ty: 'tr';
  p: { a: 0; k: [number, number] };
  a: { a: 0; k: [number, number] };
  s: { a: 0; k: [number, number] };
  r: { a: 0; k: number };
  o: { a: 0; k: 100 };
}

export interface LottieShapeGroup {
  ty: 'gr';
  it: (LottieShapePath | LottieFill | LottieGroupTransform)[];
  nm: string;
}

export interface LottieKeyframe {
  t: number;
  s: number[];
  e?: number[];
  o?: { x: number[]; y: number[] };
  i?: { x: number[]; y: number[] };
}

export interface LottieAnimatedProperty {
  a: 1;
  k: LottieKeyframe[];
}

export interface LottieStaticProperty<V> {
  a: 0;
  k: V;
}

export type LottieProperty<V> = LottieStaticProperty<V> | LottieAnimatedProperty;

export interface LottieLayerTransform {
  a: LottieStaticProperty<[number, number, number]>;
  p: LottieProperty<[number, number, number]>;
  s: LottieProperty<[number, number, number]>;
  r: LottieProperty<number>;
  o: LottieProperty<number>;
}

export interface LottieLayer {
  ddd: 0;
  ind: number;
  ty: 4;
  nm: string;
  parent?: number;
  sr: 1;
  ks: LottieLayerTransform;
  ao: 0;
  shapes: LottieShapeGroup[];
  ip: number;
  op: number;
  st: 0;
}

export interface LottieJson {
  v: string;
  fr: number;
  ip: number;
  op: number;
  w: number;
  h: number;
  nm: string;
  ddd: 0;
  assets: unknown[];
  layers: LottieLayer[];
}

const EPSILON = 0.01;
const close = (a: Vec2, b: Vec2) => Math.abs(a[0] - b[0]) < EPSILON && Math.abs(a[1] - b[1]) < EPSILON;

/** One rig subpath (bounded by M ... [Z]) -> a Lottie vertex/tangent/closed triple. */
function subpathToShape(segs: Segment[]): { v: Vec2[]; i: Vec2[]; o: Vec2[]; c: boolean } {
  const v: Vec2[] = [];
  const i: Vec2[] = [];
  const o: Vec2[] = [];
  let closed = false;
  for (const seg of segs) {
    if (seg[0] === 'M' || seg[0] === 'L') {
      v.push([seg[1], seg[2]]);
      i.push([0, 0]);
      o.push([0, 0]);
    } else if (seg[0] === 'C') {
      const prev = v[v.length - 1]!;
      o[o.length - 1] = [seg[1] - prev[0], seg[2] - prev[1]];
      const end: Vec2 = [seg[5], seg[6]];
      v.push(end);
      i.push([seg[3] - end[0], seg[4] - end[1]]);
      o.push([0, 0]);
    } else if (seg[0] === 'Z') {
      closed = true;
    }
  }
  if (closed && v.length > 1 && close(v[0]!, v[v.length - 1]!)) {
    i[0] = i[i.length - 1]!;
    v.pop();
    i.pop();
    o.pop();
  }
  return { v, i, o, c: closed };
}

/** Splits absolute M/L/C/Z path data on each M into its subpaths (a fill can have several, e.g. a ring). */
function pathToShapes(d: string, namePrefix: string): LottieShapePath[] {
  const segs = parsePath(d);
  const subpaths: Segment[][] = [];
  for (const seg of segs) {
    if (seg[0] === 'M') subpaths.push([seg]);
    else subpaths[subpaths.length - 1]!.push(seg);
  }
  return subpaths.map((sub, idx) => {
    const shape = subpathToShape(sub);
    return {
      ty: 'sh',
      ks: { a: 0, k: { i: shape.i, o: shape.o, v: shape.v, c: shape.c } },
      nm: `${namePrefix}-${idx}`,
    };
  });
}

function readFill(hex: string): [number, number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`export-lottie: fill "${hex}" is not a 6-digit hex colour`);
  const n = parseInt(m[1]!, 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255, 1];
}

/**
 * Animated Lottie property from a track's keys: a keyframe per key except the last, each holding
 * the ease of the segment ENDING at the next key as bezier tangents (`o` leaving this keyframe,
 * `i` arriving at the next), then a final keyframe with just the resting value.
 */
function animatedProp<V>(keys: Key<V>[], fps: number, toArray: (v: V) => number[]): LottieAnimatedProperty {
  const k: LottieKeyframe[] = keys.map((key, idx) => {
    const t = key.t * fps;
    const s = toArray(key.v);
    const next = keys[idx + 1];
    if (!next) return { t, s };
    const [x1, y1, x2, y2] = EASES[next.ease ?? 'linear'];
    return { t, s, e: toArray(next.v), o: { x: [x1], y: [y1] }, i: { x: [x2], y: [y2] } };
  });
  return { a: 1, k };
}

function positionProp(tracks: TracksByProperty, pivot: Vec2, fps: number): LottieProperty<[number, number, number]> {
  const track = tracks.position;
  if (!track || track.keys.length < 2) {
    const v = track ? track.keys[0]!.v : REST.position;
    return { a: 0, k: [pivot[0] + v[0], pivot[1] + v[1], 0] };
  }
  return animatedProp(track.keys, fps, (v) => [pivot[0] + v[0], pivot[1] + v[1], 0]);
}

function rotationProp(tracks: TracksByProperty, fps: number): LottieProperty<number> {
  const track = tracks.rotation;
  if (!track || track.keys.length < 2) return { a: 0, k: track ? track.keys[0]!.v : REST.rotation };
  return animatedProp(track.keys, fps, (v) => [v]);
}

function scaleProp(tracks: TracksByProperty, fps: number): LottieProperty<[number, number, number]> {
  const track = tracks.scale;
  if (!track || track.keys.length < 2) {
    const v = track ? track.keys[0]!.v : REST.scale;
    return { a: 0, k: [v[0] * 100, v[1] * 100, 100] };
  }
  return animatedProp(track.keys, fps, (v) => [v[0] * 100, v[1] * 100, 100]);
}

function opacityProp(tracks: TracksByProperty, fps: number): LottieProperty<number> {
  const track = tracks.opacity;
  if (!track || track.keys.length < 2) return { a: 0, k: (track ? track.keys[0]!.v : REST.opacity) * 100 };
  return animatedProp(track.keys, fps, (v) => [v * 100]);
}

function partLayer(
  rig: Rig,
  part: RigPart,
  ind: number,
  indexByName: Map<string, number>,
  ip: number,
  op: number,
  tracks: TracksByProperty,
  fps: number,
): LottieLayer {
  const d = part.path;
  const shapes: LottieShapeGroup[] = [];
  if (d) {
    shapes.push({
      ty: 'gr',
      nm: part.name,
      it: [
        ...pathToShapes(d, part.name),
        { ty: 'fl', c: { a: 0, k: readFill(part.fill) }, o: { a: 0, k: 100 }, nm: `${part.name}-fill` },
        {
          ty: 'tr',
          p: { a: 0, k: [0, 0] },
          a: { a: 0, k: [0, 0] },
          s: { a: 0, k: [100, 100] },
          r: { a: 0, k: 0 },
          o: { a: 0, k: 100 },
        },
      ],
    });
  }
  const layer: LottieLayer = {
    ddd: 0,
    ind,
    ty: 4,
    nm: part.name,
    sr: 1,
    ks: {
      a: { a: 0, k: [part.pivot[0], part.pivot[1], 0] },
      p: positionProp(tracks, part.pivot, fps),
      s: scaleProp(tracks, fps),
      r: rotationProp(tracks, fps),
      o: opacityProp(tracks, fps),
    },
    ao: 0,
    shapes,
    ip,
    op,
    st: 0,
  };
  if (part.parent !== undefined) layer.parent = indexByName.get(part.parent)!;
  return layer;
}

export function exportLottie(rig: Rig, clip: Clip): LottieJson {
  const ip = 0;
  const op = Math.max(1, Math.round(clip.duration * clip.fps));
  // 1-based indices, assigned in rig draw order (bottom first) so `parent` can reference them
  // regardless of the rendering order the layers array ends up in.
  const indexByName = new Map<string, number>(rig.parts.map((p, i) => [p.name, i + 1]));
  const byPart = groupTracks(clip);
  // Lottie's layers array is front-to-back: the rig's bottom-first draw order must be reversed.
  const layers = [...rig.parts]
    .reverse()
    .map((part) => partLayer(rig, part, indexByName.get(part.name)!, indexByName, ip, op, byPart.get(part.name) ?? {}, clip.fps));
  return {
    v: '5.13.0',
    fr: clip.fps,
    ip,
    op,
    w: rig.artboard.width,
    h: rig.artboard.height,
    nm: clip.name,
    ddd: 0,
    assets: [],
    layers,
  };
}
