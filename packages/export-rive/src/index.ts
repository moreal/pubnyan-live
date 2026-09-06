/**
 * `.riv` rig exporter (backlog: "export-rive: rig shapes"): every rig part becomes a
 * `Shape > Path (PointsPath of CubicDetachedVertex) + Fill > SolidColor`, parented through
 * `parentId` to its own `Node`. The part's pivot lives on the Node's `x`/`y` (in its parent
 * Node's local space, i.e. the delta from the parent part's pivot; the artboard's own origin is
 * (0, 0)) and the path's vertices are offset by `-pivot`, so rotating/scaling the Node later
 * (backlog: "linear animations") pivots the shape exactly like `ir/matrix.ts`'s `localMatrix`.
 *
 * Transform tracks (backlog: "linear animations") key the part's Node; shape tracks (backlog:
 * "shape keyframes") key either the rest Shape's `CubicDetachedVertex` objects directly (a
 * morphable track, same command sequence at every key) or, when the expressions are incompatible,
 * crossfade between one static Shape per distinct expression via keyed opacity on each.
 */
import { EASES } from '#ir/easing.ts';
import { interpolatePath, parsePath, type Segment } from '#ir/path.ts';
import { groupTracks, locate, resolvePath, sampleNumeric, type TracksByProperty } from '#ir/sample.ts';
import type { Clip, EaseName, Rig, RigPart, Track, Vec2 } from '#ir/types.ts';
import { KEYS } from '#export-rive/keys.generated.ts';
import { RivWriter } from '#export-rive/writer.ts';

const { typeKey: BACKBOARD } = KEYS.Backboard!;
const { typeKey: ARTBOARD } = KEYS.Artboard!;
const { typeKey: NODE } = KEYS.Node!;
const { typeKey: SHAPE } = KEYS.Shape!;
const { typeKey: RECTANGLE } = KEYS.Rectangle!;
const { typeKey: POINTS_PATH } = KEYS.PointsPath!;
const { typeKey: CUBIC_DETACHED_VERTEX } = KEYS.CubicDetachedVertex!;
const { typeKey: FILL } = KEYS.Fill!;
const { typeKey: SOLID_COLOR } = KEYS.SolidColor!;
const { typeKey: LINEAR_ANIMATION } = KEYS.LinearAnimation!;
const { typeKey: KEYED_OBJECT } = KEYS.KeyedObject!;
const { typeKey: KEYED_PROPERTY } = KEYS.KeyedProperty!;
const { typeKey: KEY_FRAME_DOUBLE } = KEYS.KeyFrameDouble!;
const { typeKey: CUBIC_EASE_INTERPOLATOR } = KEYS.CubicEaseInterpolator!;

const NAME = KEYS.Component!.properties.name!.key;
const PARENT_ID = KEYS.Component!.properties.parentId!.key;
const ARTBOARD_WIDTH = KEYS.LayoutComponent!.properties.width!.key;
const ARTBOARD_HEIGHT = KEYS.LayoutComponent!.properties.height!.key;
const PATH_WIDTH = KEYS.ParametricPath!.properties.width!.key;
const PATH_HEIGHT = KEYS.ParametricPath!.properties.height!.key;
const NODE_X = KEYS.Node!.properties.x!.key;
const NODE_Y = KEYS.Node!.properties.y!.key;
const VERTEX_X = KEYS.Vertex!.properties.x!.key;
const VERTEX_Y = KEYS.Vertex!.properties.y!.key;
const IS_CLOSED = KEYS.PointsCommonPath!.properties.isClosed!.key;
const IN_ROTATION = KEYS.CubicDetachedVertex!.properties.inRotation!.key;
const IN_DISTANCE = KEYS.CubicDetachedVertex!.properties.inDistance!.key;
const OUT_ROTATION = KEYS.CubicDetachedVertex!.properties.outRotation!.key;
const OUT_DISTANCE = KEYS.CubicDetachedVertex!.properties.outDistance!.key;
const COLOR_VALUE = KEYS.SolidColor!.properties.colorValue!.key;
const NODE_ROTATION = KEYS.TransformComponent!.properties.rotation!.key;
const NODE_SCALE_X = KEYS.TransformComponent!.properties.scaleX!.key;
const NODE_SCALE_Y = KEYS.TransformComponent!.properties.scaleY!.key;
const NODE_OPACITY = KEYS.WorldTransformComponent!.properties.opacity!.key;
const ANIMATION_NAME = KEYS.Animation!.properties.name!.key;
const ANIM_FPS = KEYS.LinearAnimation!.properties.fps!.key;
const ANIM_DURATION = KEYS.LinearAnimation!.properties.duration!.key;
const ANIM_LOOP_VALUE = KEYS.LinearAnimation!.properties.loopValue!.key;
const KEYED_OBJECT_ID = KEYS.KeyedObject!.properties.objectId!.key;
const KEYED_PROPERTY_KEY = KEYS.KeyedProperty!.properties.propertyKey!.key;
const KEY_FRAME_FRAME = KEYS.KeyFrame!.properties.frame!.key;
const KEY_FRAME_INTERPOLATION_TYPE = KEYS.InterpolatingKeyFrame!.properties.interpolationType!.key;
const KEY_FRAME_INTERPOLATOR_ID = KEYS.InterpolatingKeyFrame!.properties.interpolatorId!.key;
const KEY_FRAME_VALUE = KEYS.KeyFrameDouble!.properties.value!.key;
// `CubicEaseInterpolator` (a concrete, no-extra-fields subclass of `CubicInterpolator`, see
// cubic_ease_interpolator_base.hpp in the pinned runtime) inherits x1/y1/x2/y2 rather than
// redeclaring them; the property keys below are the ones the runtime's `CubicInterpolatorBase`
// actually deserializes; `keys.generated.ts` only lists a class's own fields, so they are read
// off `CubicInterpolator` here.
const CUBIC_X1 = KEYS.CubicInterpolator!.properties.x1!.key;
const CUBIC_Y1 = KEYS.CubicInterpolator!.properties.y1!.key;
const CUBIC_X2 = KEYS.CubicInterpolator!.properties.x2!.key;
const CUBIC_Y2 = KEYS.CubicInterpolator!.properties.y2!.key;
/** `InterpolatingKeyFrame::interpolationType() == 0` means "hold" (`keyed_property.cpp`); any
 * other value selects `applyInterpolation`, which only actually eases if
 * `effectiveInterpolator()` resolves to a real `KeyFrameInterpolator` — that resolution goes
 * through the `interpolatorId` property (`InterpolatingKeyFrameBase::onAddedDirty` calls
 * `context->resolve(interpolatorId())`), not adjacency in the object stream: a `CubicInterpolator`
 * is imported as an ordinary artboard component (`KeyFrameInterpolator::import`), so a keyframe
 * that omits `interpolatorId` silently falls back to linear interpolation even though the
 * `CubicEaseInterpolator` object is right there in the file (confirmed against the real runtime:
 * eases whose midpoint happens to coincide with the linear midpoint, e.g. `inOutSine`'s symmetric
 * control points, still matched the reference by coincidence). `interpolatorId` is artboard-
 * relative like `parentId`; the interpolator is always written immediately after its keyframe, so
 * its index is `cursor + 2` (this keyframe's own index `cursor + 1`, plus one) at the point the
 * keyframe's properties are assembled. */
const INTERPOLATION_TYPE_CUBIC = 1;

export interface RiveSpike {
  artboardName: string;
  width: number;
  height: number;
  fill: string;
}

/**
 * Builds the spike `.riv` bytes (backlog: "export-rive: writer core"): Backboard,
 * Artboard(width, height, name), Shape > Rectangle, Shape > Fill > SolidColor. Object indices
 * below are the artboard-relative indices `parentId` references (the artboard is implicitly
 * index 0 in its own object list).
 */
export function exportRiveSpike(spike: RiveSpike): Buffer {
  const w = new RivWriter();

  w.object(BACKBOARD, []);
  w.object(ARTBOARD, [
    [NAME, spike.artboardName],
    [ARTBOARD_WIDTH, spike.width],
    [ARTBOARD_HEIGHT, spike.height],
  ]);
  const artboard = 0;
  const shape = 1;
  w.object(SHAPE, [[PARENT_ID, artboard]]);
  w.object(RECTANGLE, [
    [PARENT_ID, shape],
    [PATH_WIDTH, spike.width],
    [PATH_HEIGHT, spike.height],
  ]);
  const fill = 3;
  w.object(FILL, [[PARENT_ID, shape]]);
  w.object(SOLID_COLOR, [
    [PARENT_ID, fill],
    [COLOR_VALUE, spike.fill],
  ]);

  return w.toBytes();
}

const EPSILON = 0.01;
const close = (a: Vec2, b: Vec2) => Math.abs(a[0] - b[0]) < EPSILON && Math.abs(a[1] - b[1]) < EPSILON;

interface VertexData {
  x: number;
  y: number;
  inRotation: number;
  inDistance: number;
  outRotation: number;
  outDistance: number;
}

/**
 * One closed subpath (M, C*, [Z], back to the start) -> vertices with absolute in/out control
 * points converted to CubicDetachedVertex's polar form: `point + distance * (cos r, sin r)`.
 * Coordinates are relative to `pivot` (the Node the Path's Shape is parented to sits there).
 */
function subpathToVertices(segs: Segment[], pivot: Vec2): VertexData[] {
  const points: Vec2[] = [];
  const outCtrl: (Vec2 | null)[] = [];
  const inCtrl: (Vec2 | null)[] = [];
  for (const seg of segs) {
    if (seg[0] === 'M') {
      points.push([seg[1], seg[2]]);
      outCtrl.push(null);
      inCtrl.push(null);
    } else if (seg[0] === 'L') {
      points.push([seg[1], seg[2]]);
      outCtrl.push(null);
      inCtrl.push(null);
    } else if (seg[0] === 'C') {
      const c1: Vec2 = [seg[1], seg[2]];
      const c2: Vec2 = [seg[3], seg[4]];
      const end: Vec2 = [seg[5], seg[6]];
      outCtrl[outCtrl.length - 1] = c1;
      if (points.length > 1 && close(end, points[0]!)) {
        // Closes exactly back to the first vertex: the second control point belongs to that
        // vertex's incoming handle rather than starting a new (duplicate) vertex.
        inCtrl[0] = c2;
      } else {
        points.push(end);
        inCtrl.push(c2);
        outCtrl.push(null);
      }
    }
  }
  return points.map((p, i) => {
    const [px, py] = [p[0] - pivot[0], p[1] - pivot[1]];
    const out = outCtrl[i];
    const inp = inCtrl[i];
    const outVec: Vec2 = out ? [out[0] - p[0], out[1] - p[1]] : [0, 0];
    const inVec: Vec2 = inp ? [inp[0] - p[0], inp[1] - p[1]] : [0, 0];
    return {
      x: px,
      y: py,
      outDistance: Math.hypot(outVec[0], outVec[1]),
      outRotation: Math.atan2(outVec[1], outVec[0]),
      inDistance: Math.hypot(inVec[0], inVec[1]),
      inRotation: Math.atan2(inVec[1], inVec[0]),
    };
  });
}

/** Splits absolute M/L/C/Z path data on each `M` into its subpaths (a fill can have several). */
function splitSubpaths(d: string): Segment[][] {
  const segs = parsePath(d);
  const subpaths: Segment[][] = [];
  for (const seg of segs) {
    if (seg[0] === 'M') subpaths.push([seg]);
    else subpaths[subpaths.length - 1]!.push(seg);
  }
  return subpaths;
}

interface FrameValue {
  frame: number;
  value: number;
  ease?: EaseName;
}

/**
 * Exports the rig's rest pose (`Backboard`, `Artboard`, per rig part a
 * `Node -> Shape -> (PointsPath, Fill -> SolidColor)` chain, `Node`s parented to their rig
 * parent's `Node` or the artboard for root parts) plus one `LinearAnimation` for the clip
 * (backlog: "linear animations"): `x`/`y`/`rotation`/`scaleX`/`scaleY`/`opacity` become
 * `KeyedProperty > KeyFrameDouble` tracks under one `KeyedObject` per animated part, each
 * non-final keyframe pointing (via `interpolatorId`) at a `CubicEaseInterpolator` built from
 * `EASES` for the segment ending at the next key (mirrors `export-lottie`'s bezier tangents).
 * Shape tracks are not yet keyframed (backlog: "shape keyframes"): only their first key's
 * expression is baked into the rest `Shape`, as before.
 */
export function exportRive(rig: Rig, clip: Clip): Buffer {
  const w = new RivWriter();
  const byPart = groupTracks(clip);
  w.object(BACKBOARD, []);
  w.object(ARTBOARD, [
    [NAME, rig.name],
    [ARTBOARD_WIDTH, rig.artboard.width],
    [ARTBOARD_HEIGHT, rig.artboard.height],
  ]);

  const partByName = new Map(rig.parts.map((p) => [p.name, p]));
  const nodeIndexByPart = new Map<string, number>();
  // `cursor` tracks the artboard's own `m_Objects` index (what `parentId` and `interpolatorId`
  // resolve against), NOT a raw count of every `w.object()` call: `ArtboardImporter::addComponent`
  // (`Node`, `Shape`, `Fill`, `SolidColor`, `PointsPath`, `CubicDetachedVertex`,
  // `CubicEaseInterpolator` — anything a `KeyFrameInterpolator::import` or ordinary `Component`
  // import registers) is what actually appends to that array; `LinearAnimation`, `KeyedObject`,
  // `KeyedProperty`, and `KeyFrame` import through their OWN owner (`addAnimation`,
  // `addKeyedObject`, `addKeyedProperty`, `addKeyFrame` respectively, confirmed against the real
  // runtime's importers) and never occupy an `m_Objects` slot at all. `add()` below is only for
  // the former group; the latter group is written with the writer's raw `w.object()` and must
  // never receive an id computed from `cursor` for ITSELF (referencing another `add()`-tracked
  // object, e.g. a `KeyedObject`'s `objectId` pointing at a `Node`, is fine).
  let cursor = 0;
  const add = (typeKey: number, properties: [number, number | string][]): number => {
    w.object(typeKey, properties);
    cursor += 1;
    return cursor;
  };

  // Two passes: every `Node` first (in `rig.parts` order, so a part's rig parent's `Node` always
  // exists before its own — `parentId` can only reference an already-written object), then every
  // `Shape` in REVERSE `rig.parts` order. Empirically (confirmed against the real runtime, not
  // documented), an object earlier in the file's flat stream paints on top of one written later
  // regardless of the parent hierarchy depth; `rig.parts` is bottom-first, so writing Shapes back
  // to front makes the last (topmost) part's Shape land earliest in the file and paint on top.
  for (const part of rig.parts) {
    const parentPart: RigPart | undefined = part.parent ? partByName.get(part.parent) : undefined;
    if (part.parent && !parentPart) throw new Error(`export-rive: part "${part.name}" has unknown parent "${part.parent}"`);
    const parentNodeIndex = parentPart ? nodeIndexByPart.get(parentPart.name)! : 0;
    const parentPivot: Vec2 = parentPart ? parentPart.pivot : [0, 0];
    const nodeIndex = add(NODE, [
      [PARENT_ID, parentNodeIndex],
      [NAME, part.name],
      [NODE_X, part.pivot[0] - parentPivot[0]],
      [NODE_Y, part.pivot[1] - parentPivot[1]],
    ]);
    nodeIndexByPart.set(part.name, nodeIndex);
  }

  /** Writes one `Shape > (PointsPath, ...) + Fill > SolidColor` under `nodeIndex` for `path`, and
   * returns the shape's own index plus, per subpath, the `CubicDetachedVertex` object indices in
   * `subpathToVertices`' order (so a morphable shape track can key them afterward). */
  const writeShapeGeometry = (nodeIndex: number, part: RigPart, path: string, namePrefix: string): { shapeIndex: number; vertexIndicesPerSubpath: number[][] } => {
    const shapeIndex = add(SHAPE, [[PARENT_ID, nodeIndex]]);
    const vertexIndicesPerSubpath: number[][] = [];
    for (const [i, sub] of splitSubpaths(path).entries()) {
      const pathIndex = add(POINTS_PATH, [
        [PARENT_ID, shapeIndex],
        [NAME, `${namePrefix}-${i}`],
        [IS_CLOSED, 1],
      ]);
      const indices: number[] = [];
      for (const v of subpathToVertices(sub, part.pivot)) {
        indices.push(
          add(CUBIC_DETACHED_VERTEX, [
            [PARENT_ID, pathIndex],
            [VERTEX_X, v.x],
            [VERTEX_Y, v.y],
            [IN_ROTATION, v.inRotation],
            [IN_DISTANCE, v.inDistance],
            [OUT_ROTATION, v.outRotation],
            [OUT_DISTANCE, v.outDistance],
          ]),
        );
      }
      vertexIndicesPerSubpath.push(indices);
    }
    const fillIndex = add(FILL, [[PARENT_ID, shapeIndex]]);
    add(SOLID_COLOR, [
      [PARENT_ID, fillIndex],
      [COLOR_VALUE, part.fill],
    ]);
    return { shapeIndex, vertexIndicesPerSubpath };
  };

  /** Whether every consecutive pair of expressions a shape track resolves to morphs (same command sequence). */
  const isMorphable = (part: RigPart, track: Track<'shape'>): boolean => {
    const paths = track.keys.map((k) => resolvePath(rig, part, k.v));
    return paths.every((d, i) => i === 0 || (d !== null && paths[i - 1] !== null && interpolatePath(paths[i - 1]!, d, 0) !== null));
  };

  interface MorphInfo {
    track: Track<'shape'>;
    vertexIndicesPerSubpath: number[][];
  }
  interface CrossfadeInfo {
    track: Track<'shape'>;
    shapeIndexByExpr: Map<string, number>;
  }
  const shapeIndexByPart = new Map<string, number>();
  const morphByPart = new Map<string, MorphInfo>();
  const crossfadeByPart = new Map<string, CrossfadeInfo>();
  for (const part of [...rig.parts].reverse()) {
    const nodeIndex = nodeIndexByPart.get(part.name)!;
    const shapeTrack = byPart.get(part.name)?.shape;
    if (!shapeTrack) {
      if (!part.path) continue; // hidden by default (e.g. tears): no geometry to emit at rest.
      const { shapeIndex } = writeShapeGeometry(nodeIndex, part, part.path, part.name);
      shapeIndexByPart.set(part.name, shapeIndex);
      continue;
    }
    if (isMorphable(part, shapeTrack)) {
      // A morphable track's rest pose is its first key (mirrors the reference sampler's t=0,
      // since `locate()` holds at the first key for any t at or before it); the vertices keyed
      // below (backlog: "shape keyframes") animate them across the rest of the clip.
      const path0 = resolvePath(rig, part, shapeTrack.keys[0]!.v);
      if (!path0) continue;
      const { shapeIndex, vertexIndicesPerSubpath } = writeShapeGeometry(nodeIndex, part, path0, part.name);
      shapeIndexByPart.set(part.name, shapeIndex);
      morphByPart.set(part.name, { track: shapeTrack, vertexIndicesPerSubpath });
      continue;
    }
    // Incompatible (crossfading) shapes: one static Shape per distinct expression the track
    // references, all parented to the same Node, opacity-keyed against each other below (mirrors
    // `export-svg`'s per-expression `<path>` elements / `export-lottie`'s per-expression layers).
    const expressions = [...new Set(shapeTrack.keys.map((k) => k.v))];
    const shapeIndexByExpr = new Map<string, number>();
    for (const expr of expressions) {
      const d = resolvePath(rig, part, expr);
      if (!d) continue;
      const { shapeIndex } = writeShapeGeometry(nodeIndex, part, d, `${part.name}-${expr}`);
      shapeIndexByExpr.set(expr, shapeIndex);
    }
    if (shapeIndexByExpr.size > 0) crossfadeByPart.set(part.name, { track: shapeTrack, shapeIndexByExpr });
  }

  // `KeyFrame.frame` is a uint, so every keyed time must land on an exact integer frame at
  // whatever fps the `LinearAnimation` declares; clip authors write plain decimal seconds (e.g.
  // idle's 3.22s blink-open key) that are not exact multiples of `clip.fps`. Scaling up the
  // animation's own fps (which only this file's frame<->second math uses; playback elsewhere
  // seeks by seconds) makes every sampled clip's key times exact multiples with room to spare.
  const FPS_SCALE = 1000;
  const animFps = clip.fps * FPS_SCALE;
  const toFrame = (t: number) => Math.round(t * animFps);

  /** One `CubicEaseInterpolator` per eased segment, then a `KeyFrameDouble` per key referencing
   * it via `interpolatorId` (the last key has neither: nothing follows it). `KeyedProperty` and
   * `KeyFrameDouble` are written with the writer's raw `w.object()`, not `add()`: they import
   * through their owning `KeyedObject`/`KeyedProperty` (see the `cursor` doc comment above) and
   * never occupy an `m_Objects` slot, so they must not advance `cursor` — only the
   * `CubicEaseInterpolator` that follows a keyframe does. */
  const writeDoubleTrack = (propertyKey: number, values: FrameValue[]): void => {
    w.object(KEYED_PROPERTY, [[KEYED_PROPERTY_KEY, propertyKey]]);
    for (const [i, v] of values.entries()) {
      const next = values[i + 1];
      const props: [number, number | string][] = [
        [KEY_FRAME_FRAME, v.frame],
        [KEY_FRAME_VALUE, v.value],
      ];
      if (next) {
        props.push([KEY_FRAME_INTERPOLATION_TYPE, INTERPOLATION_TYPE_CUBIC]);
        // The interpolator is written by the very next `add()` call below: it will become
        // `cursor + 1`, the first (and only) `m_Objects` slot consumed since this keyframe.
        props.push([KEY_FRAME_INTERPOLATOR_ID, cursor + 1]);
      }
      w.object(KEY_FRAME_DOUBLE, props);
      if (next) {
        const [x1, y1, x2, y2] = EASES[next.ease ?? 'linear'];
        add(CUBIC_EASE_INTERPOLATOR, [
          [CUBIC_X1, x1],
          [CUBIC_Y1, y1],
          [CUBIC_X2, x2],
          [CUBIC_Y2, y2],
        ]);
      }
    }
  };

  const duration = Math.max(1, Math.round(clip.duration * animFps));
  w.object(LINEAR_ANIMATION, [
    [ANIMATION_NAME, clip.name],
    [ANIM_FPS, animFps],
    [ANIM_DURATION, duration],
    [ANIM_LOOP_VALUE, clip.loop ? 1 : 0],
  ]);

  for (const part of rig.parts) {
    const tracks: TracksByProperty = byPart.get(part.name) ?? {};
    const nodeIndex = nodeIndexByPart.get(part.name)!;
    const parentPart: RigPart | undefined = part.parent ? partByName.get(part.parent) : undefined;
    const parentPivot: Vec2 = parentPart ? parentPart.pivot : [0, 0];
    // Position/rotation/scale key the part's own Node: a rig parent's Node is genuinely the
    // spatial parent of this one, so those three cascade down exactly like `ir/matrix.ts`'s
    // nested `localMatrix` multiplication (Rive computes child world transforms the same way).
    if (tracks.position || tracks.rotation || tracks.scale) {
      w.object(KEYED_OBJECT, [[KEYED_OBJECT_ID, nodeIndex]]);
      if (tracks.position) {
        const dx = part.pivot[0] - parentPivot[0];
        const dy = part.pivot[1] - parentPivot[1];
        writeDoubleTrack(NODE_X, tracks.position.keys.map((k) => ({ frame: toFrame(k.t), value: dx + k.v[0], ease: k.ease })));
        writeDoubleTrack(NODE_Y, tracks.position.keys.map((k) => ({ frame: toFrame(k.t), value: dy + k.v[1], ease: k.ease })));
      }
      if (tracks.rotation) {
        writeDoubleTrack(
          NODE_ROTATION,
          tracks.rotation.keys.map((k) => ({ frame: toFrame(k.t), value: (k.v * Math.PI) / 180, ease: k.ease })),
        );
      }
      if (tracks.scale) {
        writeDoubleTrack(NODE_SCALE_X, tracks.scale.keys.map((k) => ({ frame: toFrame(k.t), value: k.v[0], ease: k.ease })));
        writeDoubleTrack(NODE_SCALE_Y, tracks.scale.keys.map((k) => ({ frame: toFrame(k.t), value: k.v[1], ease: k.ease })));
      }
    }
    // Opacity keys the part's own Shape instead: `ir/sample.ts`'s `sampleClip` gives a part the
    // opacity of only its OWN track (children do NOT inherit it, mirrored by `export-svg` wrapping
    // just the shape markup in its own animated `<g>`), but Rive's render opacity cascades down
    // every `TransformComponent`'s parent chain (`transform_component.cpp`); keying the Shape (a
    // `Node` subclass with its own opacity, parented to but distinct from this part's Node) keeps
    // that cascade from reaching sibling/child Nodes the way keying the Node itself would.
    if (tracks.opacity) {
      const shapeIndex = shapeIndexByPart.get(part.name);
      if (shapeIndex !== undefined) {
        w.object(KEYED_OBJECT, [[KEYED_OBJECT_ID, shapeIndex]]);
        writeDoubleTrack(NODE_OPACITY, tracks.opacity.keys.map((k) => ({ frame: toFrame(k.t), value: k.v, ease: k.ease })));
      }
    }
  }

  // Keeps a rotation/distance track from swinging the long way around when a morph's tangent
  // direction crosses the -pi/pi seam between two keys (atan2's range), by re-expressing each
  // later value as the equivalent angle closest to the one before it.
  const unwrapAngles = (values: number[]): number[] => {
    const out: number[] = [values[0]!];
    for (let i = 1; i < values.length; i++) {
      let v = values[i]!;
      const prev = out[i - 1]!;
      while (v - prev > Math.PI) v -= 2 * Math.PI;
      while (v - prev < -Math.PI) v += 2 * Math.PI;
      out.push(v);
    }
    return out;
  };

  // Shape morph (backlog: "shape keyframes"): key every `CubicDetachedVertex`'s x/y and in/out
  // rotation/distance across the track's key times. The vertex position (x, y) matches the
  // reference sampler's linear interpolation of the raw path numbers exactly; the tangent handles
  // are Rive's native polar form (rotation/distance) rather than the sampler's cartesian one, so a
  // handle that both rotates and changes length between two keys interpolates along a very close
  // but not bit-identical arc — acceptable for the small, calm expression changes this rig has.
  for (const [partName, morph] of morphByPart) {
    const part = partByName.get(partName)!;
    const paths = morph.track.keys.map((k) => resolvePath(rig, part, k.v)!);
    const vertsPerKeyPerSubpath = paths.map((p) => splitSubpaths(p).map((sub) => subpathToVertices(sub, part.pivot)));
    for (const [s, vertexIndices] of morph.vertexIndicesPerSubpath.entries()) {
      for (const [j, vertexIndex] of vertexIndices.entries()) {
        const at = (pick: (v: VertexData) => number) => vertsPerKeyPerSubpath.map((subpaths) => pick(subpaths[s]![j]!));
        const xs = at((v) => v.x);
        const ys = at((v) => v.y);
        const inRot = unwrapAngles(at((v) => v.inRotation));
        const inDist = at((v) => v.inDistance);
        const outRot = unwrapAngles(at((v) => v.outRotation));
        const outDist = at((v) => v.outDistance);
        const values = (arr: number[]): FrameValue[] => morph.track.keys.map((k, i) => ({ frame: toFrame(k.t), value: arr[i]!, ease: k.ease }));
        w.object(KEYED_OBJECT, [[KEYED_OBJECT_ID, vertexIndex]]);
        writeDoubleTrack(VERTEX_X, values(xs));
        writeDoubleTrack(VERTEX_Y, values(ys));
        writeDoubleTrack(IN_ROTATION, values(inRot));
        writeDoubleTrack(IN_DISTANCE, values(inDist));
        writeDoubleTrack(OUT_ROTATION, values(outRot));
        writeDoubleTrack(OUT_DISTANCE, values(outDist));
      }
    }
  }

  // Shape crossfade (backlog: "shape keyframes"): opacity-key each expression's own Shape so
  // exactly the resolved one is visible, matching `ir/sample.ts`'s `sampleShape` crossfade weights
  // exactly at every key (and, since both sides share the same ease, at every time between two
  // keys too — mirrors `export-svg`'s per-expression opacity keyframes / `export-lottie`'s
  // `crossfadeProp`).
  for (const [partName, info] of crossfadeByPart) {
    const opacityTrack = (byPart.get(partName) ?? {}).opacity;
    for (const [expr, shapeIndex] of info.shapeIndexByExpr) {
      w.object(KEYED_OBJECT, [[KEYED_OBJECT_ID, shapeIndex]]);
      if (opacityTrack) {
        // A shape crossfade and a part-level opacity track combine multiplicatively, and the
        // product of two independently eased curves isn't itself a single bezier, so this bakes
        // one linear keyframe per frame instead of deriving bezier keys (mirrors
        // `export-lottie`'s `bakedCrossfadeProp`).
        const frames = Math.max(1, Math.round(clip.duration * clip.fps));
        const values: FrameValue[] = [];
        for (let f = 0; f <= frames; f++) {
          const t = (f / frames) * clip.duration;
          const { from, to, p } = locate(info.track.keys, t);
          let weight = from.v === expr ? 1 : 0;
          if (p !== 0 && from.v !== to.v) {
            weight = 0;
            if (from.v === expr) weight += 1 - p;
            if (to.v === expr) weight += p;
          }
          values.push({ frame: toFrame(t), value: weight * sampleNumeric(opacityTrack, t) });
        }
        writeDoubleTrack(NODE_OPACITY, values);
      } else {
        writeDoubleTrack(
          NODE_OPACITY,
          info.track.keys.map((k) => ({ frame: toFrame(k.t), value: k.v === expr ? 1 : 0, ease: k.ease })),
        );
      }
    }
  }

  return w.toBytes();
}
