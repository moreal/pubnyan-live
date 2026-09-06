/**
 * `.riv` rig exporter (backlog: "export-rive: rig shapes"): every rig part becomes a
 * `Shape > Path (PointsPath of CubicDetachedVertex) + Fill > SolidColor`, parented through
 * `parentId` to its own `Node`. The part's pivot lives on the Node's `x`/`y` (in its parent
 * Node's local space, i.e. the delta from the parent part's pivot; the artboard's own origin is
 * (0, 0)) and the path's vertices are offset by `-pivot`, so rotating/scaling the Node later
 * (backlog: "linear animations") pivots the shape exactly like `ir/matrix.ts`'s `localMatrix`.
 *
 * No transform or shape keyframing is baked in yet (backlog: "linear animations", "shape
 * keyframes"): parts always sit at their rig rest transform, but a shape track's first key (this
 * part's expression at t=0) is still resolved, so the file matches the reference sampler's t=0
 * frame for clips that hold an expression from the start (e.g. `expr-angry`).
 */
import { EASES } from '#ir/easing.ts';
import { parsePath, type Segment } from '#ir/path.ts';
import { groupTracks, resolvePath, type TracksByProperty } from '#ir/sample.ts';
import type { Clip, EaseName, Rig, RigPart, Vec2 } from '#ir/types.ts';
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

  const shapeIndexByPart = new Map<string, number>();
  for (const part of [...rig.parts].reverse()) {
    // A shape track's first key is this part's rest expression (mirrors the reference sampler's
    // t=0, since `locate()` holds at the first key for any t at or before it); no shape track
    // keyframing is baked in yet (backlog: "shape keyframes"), only this initial pose.
    const shapeTrack = byPart.get(part.name)?.shape;
    const path = shapeTrack ? resolvePath(rig, part, shapeTrack.keys[0]!.v) : part.path;
    if (!path) continue; // hidden by default (e.g. tears): no geometry to emit at rest.
    const nodeIndex = nodeIndexByPart.get(part.name)!;
    const shapeIndex = add(SHAPE, [[PARENT_ID, nodeIndex]]);
    shapeIndexByPart.set(part.name, shapeIndex);
    for (const [i, sub] of splitSubpaths(path).entries()) {
      const pathIndex = add(POINTS_PATH, [
        [PARENT_ID, shapeIndex],
        [NAME, `${part.name}-${i}`],
        [IS_CLOSED, 1],
      ]);
      for (const v of subpathToVertices(sub, part.pivot)) {
        add(CUBIC_DETACHED_VERTEX, [
          [PARENT_ID, pathIndex],
          [VERTEX_X, v.x],
          [VERTEX_Y, v.y],
          [IN_ROTATION, v.inRotation],
          [IN_DISTANCE, v.inDistance],
          [OUT_ROTATION, v.outRotation],
          [OUT_DISTANCE, v.outDistance],
        ]);
      }
    }
    const fillIndex = add(FILL, [[PARENT_ID, shapeIndex]]);
    add(SOLID_COLOR, [
      [PARENT_ID, fillIndex],
      [COLOR_VALUE, part.fill],
    ]);
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

  return w.toBytes();
}
