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
import { parsePath, type Segment } from '#ir/path.ts';
import { groupTracks, resolvePath } from '#ir/sample.ts';
import type { Clip, Rig, RigPart, Vec2 } from '#ir/types.ts';
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

/**
 * Exports the rig's rest pose (no clip animation baked in yet: see the backlog's "linear
 * animations" item) as `.riv` bytes: one `Backboard`, one `Artboard`, and per rig part a
 * `Node -> Shape -> (PointsPath, Fill -> SolidColor)` chain, `Node`s parented to their rig
 * parent's `Node` (or the artboard for root parts).
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
  // Object indices are relative to the artboard, which is implicitly index 0 (see the spike in
  // this file's git history / `writer.ts`'s doc comment).
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

  for (const part of [...rig.parts].reverse()) {
    // A shape track's first key is this part's rest expression (mirrors the reference sampler's
    // t=0, since `locate()` holds at the first key for any t at or before it); no shape track
    // keyframing is baked in yet (backlog: "shape keyframes"), only this initial pose.
    const shapeTrack = byPart.get(part.name)?.shape;
    const path = shapeTrack ? resolvePath(rig, part, shapeTrack.keys[0]!.v) : part.path;
    if (!path) continue; // hidden by default (e.g. tears): no geometry to emit at rest.
    const nodeIndex = nodeIndexByPart.get(part.name)!;
    const shapeIndex = add(SHAPE, [[PARENT_ID, nodeIndex]]);
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

  return w.toBytes();
}
