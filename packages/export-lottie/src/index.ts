import { EASES } from '#ir/easing.ts';
import { interpolatePath, parsePath, type Segment } from '#ir/path.ts';
import { locate, groupTracks, REST, resolvePath, sampleNumeric, type TracksByProperty } from '#ir/sample.ts';
import type { Clip, Key, Rig, RigPart, Track, Vec2 } from '#ir/types.ts';

export interface LottieShapeValue {
  i: number[][];
  o: number[][];
  v: number[][];
  c: boolean;
}

export type LottieShapeKeyframe = {
  t: number;
  s: [LottieShapeValue];
  e?: [LottieShapeValue];
  o?: { x: number[]; y: number[] };
  i?: { x: number[]; y: number[] };
};

export type LottieShapeProperty = { a: 0; k: LottieShapeValue } | { a: 1; k: LottieShapeKeyframe[] };

export interface LottieShapePath {
  ty: 'sh';
  ks: LottieShapeProperty;
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
  o: LottieProperty<number>;
}

export interface LottieShapeGroup {
  ty: 'gr';
  it: (LottieShapePath | LottieFill | LottieGroupTransform | LottieShapeGroup)[];
  nm: string;
}

export interface LottieKeyframe {
  h?: 1;
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
  tt?: 1;
  td?: 1;
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
function splitSubpaths(d: string): Segment[][] {
  const segs = parsePath(d);
  const subpaths: Segment[][] = [];
  for (const seg of segs) {
    if (seg[0] === 'M') subpaths.push([seg]);
    else subpaths[subpaths.length - 1]!.push(seg);
  }
  return subpaths;
}

function pathToShapes(d: string, namePrefix: string): LottieShapePath[] {
  return splitSubpaths(d).map((sub, idx) => {
    const shape = subpathToShape(sub);
    return {
      ty: 'sh',
      ks: { a: 0, k: { i: shape.i, o: shape.o, v: shape.v, c: shape.c } },
      nm: `${namePrefix}-${idx}`,
    };
  });
}

/** Whether every consecutive pair of expressions resolved by a shape track's keys morphs (same command sequence). */
function isMorphable(rig: Rig, part: RigPart, track: Track<'shape'>): boolean {
  const paths = track.keys.map((k) => resolvePath(rig, part, k.v));
  return paths.every((d, i) => i === 0 || (d !== null && paths[i - 1] !== null && interpolatePath(paths[i - 1]!, d, 0) !== null));
}

/** One animated `sh` shape per subpath, morphing vertex-for-vertex between the resolved paths of a track's keys. */
function morphableShapeItems(rig: Rig, part: RigPart, track: Track<'shape'>, fps: number): LottieShapePath[] {
  const paths = track.keys.map((k) => resolvePath(rig, part, k.v)!);
  const subpathsPerKey = paths.map(splitSubpaths);
  const count = subpathsPerKey[0]!.length;
  const items: LottieShapePath[] = [];
  for (let s = 0; s < count; s++) {
    const k: LottieShapeKeyframe[] = track.keys.map((key, idx) => {
      const shape = subpathToShape(subpathsPerKey[idx]![s]!);
      const sVal: [LottieShapeValue] = [{ i: shape.i, o: shape.o, v: shape.v, c: shape.c }];
      const t = key.t * fps;
      const next = track.keys[idx + 1];
      if (!next) return { t, s: sVal };
      const nextShape = subpathToShape(subpathsPerKey[idx + 1]![s]!);
      const eVal: [LottieShapeValue] = [{ i: nextShape.i, o: nextShape.o, v: nextShape.v, c: nextShape.c }];
      const [x1, y1, x2, y2] = EASES[next.ease ?? 'linear'];
      return { t, s: sVal, e: eVal, o: { x: [x1], y: [y1] }, i: { x: [x2], y: [y2] } };
    });
    items.push({ ty: 'sh', ks: { a: 1, k }, nm: `${part.name}-${s}` });
  }
  return items;
}

/** Crossfade weight of `expression` at time `t` for an incompatible (non-morphable) shape track, matching `sampleShape`. */
function crossfadeWeight(track: Track<'shape'>, expression: string, t: number): number {
  const { from, to, p } = locate(track.keys, t);
  if (p === 0 || from.v === to.v) return from.v === expression ? 1 : 0;
  let w = 0;
  if (from.v === expression) w += 1 - p;
  if (to.v === expression) w += p;
  return w;
}

/** Exact bezier keyframes for one expression's crossfade weight, mirroring `export-svg`'s `keyStops`. */
function crossfadeProp(track: Track<'shape'>, expression: string, fps: number): LottieProperty<number> {
  if (track.keys.length < 2) return { a: 0, k: (track.keys[0]!.v === expression ? 1 : 0) * 100 };
  const k: LottieKeyframe[] = track.keys.map((key, idx) => {
    const t = key.t * fps;
    const s = [(key.v === expression ? 1 : 0) * 100];
    const next = track.keys[idx + 1];
    if (!next) return { t, s };
    const e = [(next.v === expression ? 1 : 0) * 100];
    const [x1, y1, x2, y2] = EASES[next.ease ?? 'linear'];
    return { t, s, e, o: { x: [x1], y: [y1] }, i: { x: [x2], y: [y2] } };
  });
  return { a: 1, k };
}

/**
 * Baked (per-frame) crossfade weight combined with a part-level opacity track, for the rare case a
 * shape track and an opacity track coexist on the same part: the product of two independently eased
 * curves is not itself a single bezier, so this samples both every frame instead of deriving keys.
 */
function bakedCrossfadeProp(shapeTrack: Track<'shape'>, opacityTrack: Track<'opacity'>, expression: string, fps: number, duration: number): LottieProperty<number> {
  const frames = Math.max(1, Math.round(duration * fps));
  const k: LottieKeyframe[] = [];
  for (let f = 0; f <= frames; f++) {
    const t = (f / frames) * duration;
    const w = crossfadeWeight(shapeTrack, expression, t) * sampleNumeric(opacityTrack, t);
    k.push({ t: f, s: [w * 100], o: { x: [0], y: [0] }, i: { x: [1], y: [1] } });
  }
  return { a: 1, k };
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

function shapeGroup(part: RigPart, items: LottieShapePath[]): LottieShapeGroup {
  return {
    ty: 'gr',
    nm: part.name,
    it: [
      ...items,
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
  };
}

function partLayer(
  part: RigPart,
  ind: number,
  parentInd: number | undefined,
  ip: number,
  op: number,
  tracks: TracksByProperty,
  fps: number,
  shapes: LottieShapeGroup[],
  opacity: LottieProperty<number>,
): LottieLayer {
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
      o: opacity,
    },
    ao: 0,
    shapes,
    ip,
    op,
    st: 0,
  };
  if (parentInd !== undefined) layer.parent = parentInd;
  return layer;
}

/**
 * The layer(s) a part turns into. No shape track: the static path as before, one layer. A
 * morphable shape track: still one layer, its path now animated. An incompatible shape track:
 * one layer per expression it references, each a static path crossfaded in/out through opacity
 * (mirrors `export-svg`'s per-expression `<path>` elements) — the first gets the part's own
 * (primary) index so parenting is unaffected, the rest get indices from `nextIndex`.
 */
function partLayers(
  rig: Rig,
  part: RigPart,
  primaryInd: number,
  parentInd: number | undefined,
  ip: number,
  op: number,
  tracks: TracksByProperty,
  fps: number,
  duration: number,
  nextIndex: () => number,
): LottieLayer[] {
  const shapeTrack = tracks.shape;
  if (!shapeTrack) {
    const shapes = part.path ? [shapeGroup(part, pathToShapes(part.path, part.name))] : [];
    return [partLayer(part, primaryInd, parentInd, ip, op, tracks, fps, shapes, opacityProp(tracks, fps))];
  }
  if (isMorphable(rig, part, shapeTrack)) {
    const d0 = resolvePath(rig, part, shapeTrack.keys[0]!.v);
    const shapes = d0 ? [shapeGroup(part, morphableShapeItems(rig, part, shapeTrack, fps))] : [];
    return [partLayer(part, primaryInd, parentInd, ip, op, tracks, fps, shapes, opacityProp(tracks, fps))];
  }
  // A later null/incompatible key must not turn an earlier compatible morph into a crossfade.
  if (shapeTrack.keys.some((from, i) => {
    const to = shapeTrack.keys[i + 1];
    return to && from.v !== to.v && isMorphable(rig, part, { ...shapeTrack, keys: [from, to] });
  })) {
    const groups: LottieShapeGroup[] = [];
    const addRange = (items: LottieShapeGroup[], start: number, end: number) => {
      if (end <= start) return;
      // Part opacity belongs to each sampled contour, before their crossfade composite.
      const drawings = items.map((item) => {
        const drawing = shapeGroup(part, []);
        const opacity = drawing.it.find((it) => it.ty === 'tr')!;
        opacity.o = opacityProp(tracks, fps);
        drawing.it = [item, opacity];
        return drawing;
      });
      const wrapper = shapeGroup(part, []);
      const transform = wrapper.it.find((it) => it.ty === 'tr')!;
      transform.o = { a: 1, k: [
        ...(start > 0 ? [{ t: 0, s: [0], h: 1 as const }] : []),
        { t: start * fps, s: [100], h: 1 },
        { t: end * fps, s: [0], h: 1 },
      ] };
      wrapper.it = [...drawings, transform];
      groups.push(wrapper);
    };
    const staticGroup = (expression: string) => {
      const d = resolvePath(rig, part, expression);
      return d ? [shapeGroup(part, pathToShapes(d, part.name))] : [];
    };
    const first = shapeTrack.keys[0]!;
    addRange(staticGroup(first.v), 0, first.t);
    for (let i = 0; i < shapeTrack.keys.length - 1; i++) {
      const from = shapeTrack.keys[i]!;
      const to = shapeTrack.keys[i + 1]!;
      const pair = { ...shapeTrack, keys: [from, to] };
      if (isMorphable(rig, part, pair)) {
        addRange([shapeGroup(part, morphableShapeItems(rig, part, pair, fps))], from.t, to.t);
      } else {
        const items = [...new Set([from.v, to.v])].flatMap((expression) => {
          const groups = staticGroup(expression);
          for (const group of groups) group.it.find((it) => it.ty === 'tr')!.o = crossfadeProp(pair, expression, fps);
          return groups;
        });
        addRange(items, from.t, to.t);
      }
    }
    const last = shapeTrack.keys[shapeTrack.keys.length - 1]!;
    addRange(staticGroup(last.v), last.t, duration + 1);
    return [partLayer(part, primaryInd, parentInd, ip, op, tracks, fps, groups, { a: 0, k: 100 })];
  }
  const expressions = [...new Set(shapeTrack.keys.map((k) => k.v))];
  const layers: LottieLayer[] = [];
  for (const [i, expr] of expressions.entries()) {
    const d = resolvePath(rig, part, expr);
    const shapes = d ? [shapeGroup(part, pathToShapes(d, `${part.name}-${expr}`))] : [];
    const opacity = tracks.opacity
      ? bakedCrossfadeProp(shapeTrack, tracks.opacity, expr, fps, duration)
      : crossfadeProp(shapeTrack, expr, fps);
    const ind = i === 0 ? primaryInd : nextIndex();
    layers.push(partLayer(part, ind, parentInd, ip, op, tracks, fps, shapes, opacity));
  }
  return layers;
}

/** A geometric aperture is opaque even when its visible source is fading or transparent.
 * Separate interval groups preserve compound-path winding and exact morph easing. */
function apertureGroups(rig: Rig, source: RigPart, track: Track<'shape'> | undefined, fps: number, duration: number): LottieShapeGroup[] {
  const white = { ...source, fill: '#ffffff' };
  if (!track) return source.path ? [shapeGroup(white, pathToShapes(source.path, source.name))] : [];
  const groups: LottieShapeGroup[] = [];
  const add = (items: LottieShapePath[], start: number, end: number) => {
    const group = shapeGroup(white, items);
    const transform = group.it.find((it) => it.ty === 'tr')!;
    const keys: LottieKeyframe[] = [];
    if (start > 0) keys.push({ t: 0, s: [0], h: 1 });
    keys.push({ t: Math.max(0, start) * fps, s: [100], h: 1 });
    keys.push({ t: end * fps, s: [0], h: 1 });
    transform.o = { a: 1, k: keys };
    groups.push(group);
  };
  const staticRange = (expression: string, start: number, end: number) => {
    const d = resolvePath(rig, source, expression);
    if (d && end > start) add(pathToShapes(d, source.name), start, end);
  };
  const first = track.keys[0]!;
  staticRange(first.v, 0, first.t);
  for (let i = 0; i < track.keys.length - 1; i++) {
    const from = track.keys[i]!;
    const to = track.keys[i + 1]!;
    const pair = { ...track, keys: [from, to] };
    if (isMorphable(rig, source, pair)) {
      add(morphableShapeItems(rig, source, pair, fps), from.t, to.t);
    } else {
      staticRange(from.v, from.t, to.t);
      // At the exact key only the current expression participates. Immediately after it,
      // both crossfade contours clip at full coverage, independent of crossfade weights.
      staticRange(to.v, from.t + 1e-7, to.t);
    }
  }
  const last = track.keys[track.keys.length - 1]!;
  staticRange(last.v, last.t, Math.max(duration, last.t) + 1);
  return groups;
}

export function exportLottie(rig: Rig, clip: Clip): LottieJson {
  const ip = 0;
  const op = Math.max(1, Math.round(clip.duration * clip.fps));
  // 1-based indices, assigned in rig draw order (bottom first) so `parent` can reference them
  // regardless of the rendering order the layers array ends up in.
  const indexByName = new Map<string, number>(rig.parts.map((p, i) => [p.name, i + 1]));
  let extraIndex = rig.parts.length;
  const nextIndex = () => ++extraIndex;
  const byPart = groupTracks(clip);
  // Lottie's layers array is front-to-back: the rig's bottom-first draw order must be reversed.
  const layers = [...rig.parts]
    .reverse()
    .flatMap((part) => {
      const drawing = partLayers(
        rig,
        part,
        indexByName.get(part.name)!,
        part.parent !== undefined ? indexByName.get(part.parent) : undefined,
        ip,
        op,
        byPart.get(part.name) ?? {},
        clip.fps,
        clip.duration,
        nextIndex,
      );
      if (!part.clipTo) return drawing;
      const source = rig.parts.find((candidate) => candidate.name === part.clipTo)!;
      const sourceTracks = byPart.get(source.name) ?? {};
      return drawing.flatMap((layer) => {
        const matte = partLayer(source, nextIndex(), source.parent ? indexByName.get(source.parent) : undefined,
          ip, op, sourceTracks, clip.fps,
          apertureGroups(rig, source, sourceTracks.shape, clip.fps, clip.duration), { a: 0, k: 100 });
        matte.nm = `${part.name}-aperture`;
        matte.td = 1;
        layer.tt = 1;
        return [matte, layer];
      });
    });
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
