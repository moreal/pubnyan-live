import { parsePath, type Segment } from '#ir/path.ts';
import type { Vec2 } from '#ir/types.ts';

const EPSILON = 0.01;
const close = (a: Vec2, b: Vec2) => Math.abs(a[0] - b[0]) < EPSILON && Math.abs(a[1] - b[1]) < EPSILON;

export interface VertexData {
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
export function subpathToVertices(segs: Segment[], pivot: Vec2): VertexData[] {
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

/** Splits absolute M/L/C/Z path data on each `M` into its subpaths (a fill can have several).
 * Exported for `#export-rive/machine.ts`, which builds the state machine artboard's rest-pose
 * geometry the same way this file does, without a per-clip shape track to morph/crossfade. */
export function splitSubpaths(d: string): Segment[][] {
  const segs = parsePath(d);
  const subpaths: Segment[][] = [];
  for (const seg of segs) {
    if (seg[0] === 'M') subpaths.push([seg]);
    else subpaths[subpaths.length - 1]!.push(seg);
  }
  return subpaths;
}


/** Signed area of a closed cubic contour, integrated exactly with three-point
 * Gaussian quadrature (the integrand x*y' - y*x' has degree at most five). */
function signedArea(vertices: VertexData[]): number {
  let area = 0;
  const offset = Math.sqrt(3 / 5) / 2;
  const quadrature = [[0.5 - offset, 5 / 18], [0.5, 8 / 18], [0.5 + offset, 5 / 18]] as const;
  for (const [i, from] of vertices.entries()) {
    const to = vertices[(i + 1) % vertices.length]!;
    const x = [from.x, from.x + Math.cos(from.outRotation) * from.outDistance,
      to.x + Math.cos(to.inRotation) * to.inDistance, to.x];
    const y = [from.y, from.y + Math.sin(from.outRotation) * from.outDistance,
      to.y + Math.sin(to.inRotation) * to.inDistance, to.y];
    for (const [t, weight] of quadrature) {
      const u = 1 - t;
      const value = (p: number[]) => u*u*u*p[0]! + 3*u*u*t*p[1]! + 3*u*t*t*p[2]! + t*t*t*p[3]!;
      const derivative = (p: number[]) => 3*u*u*(p[1]! - p[0]!) + 6*u*t*(p[2]! - p[1]!) + 3*t*t*(p[3]! - p[2]!);
      area += weight * (value(x) * derivative(y) - value(y) * derivative(x));
    }
  }
  return area / 2;
}

/** Normalize entire Shapes, not individual contours: reversing every contour
 * together preserves holes while preventing opposite-winding source Shapes from
 * cancelling each other in Rive's concatenated nonzero clipping path. */
export function maskNeedsReversal(subpaths: VertexData[][]): boolean {
  const areas = subpaths.map(signedArea);
  const largest = areas.reduce((a, b) => Math.abs(a) >= Math.abs(b) ? a : b, 0);
  return largest < 0;
}

export function reverseContours(subpaths: VertexData[][]): VertexData[][] {
  return subpaths.map((vertices) => [vertices[0]!, ...vertices.slice(1).reverse()].map((v) => ({
    ...v, inRotation: v.outRotation, inDistance: v.outDistance,
    outRotation: v.inRotation, outDistance: v.inDistance,
  })));
}
