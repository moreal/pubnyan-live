import type { Matrix, Vec2 } from '#ir/types.ts';

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** m · n : apply n first, then m. */
export function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export const translate = (x: number, y: number): Matrix => [1, 0, 0, 1, x, y];
export const scale = (sx: number, sy: number): Matrix => [sx, 0, 0, sy, 0, 0];

export function rotate(deg: number): Matrix {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, s, -s, c, 0, 0];
}

export function apply(m: Matrix, p: Vec2): Vec2 {
  return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
}

/** translate(position) · translate(pivot) · rotate · scale · translate(-pivot): the CSS transform-origin model. */
export function localMatrix(pivot: Vec2, position: Vec2, rotation: number, sc: Vec2): Matrix {
  let m = translate(position[0] + pivot[0], position[1] + pivot[1]);
  m = multiply(m, rotate(rotation));
  m = multiply(m, scale(sc[0], sc[1]));
  return multiply(m, translate(-pivot[0], -pivot[1]));
}
