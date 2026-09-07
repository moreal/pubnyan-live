import type { EaseName } from '#ir/types.ts';

/** Cubic bezier control points (x1, y1, x2, y2), the same form CSS, Lottie, and Rive consume. */
export const EASES: Record<EaseName, [number, number, number, number]> = {
  linear: [0, 0, 1, 1],
  easeIn: [0.42, 0, 1, 1],
  easeOut: [0, 0, 0.58, 1],
  easeInOut: [0.42, 0, 0.58, 1],
  inOutSine: [0.37, 0, 0.63, 1],
  outQuint: [0.22, 1, 0.36, 1],
  outBack: [0.34, 1.56, 0.64, 1],
  outCubic: [0.33, 1, 0.68, 1],
  inOutCubic: [0.65, 0, 0.35, 1],
  inOutQuad: [0.45, 0, 0.55, 1],
  inBack: [0.36, 0, 0.66, -0.56],
  inOutBack: [0.68, -0.6, 0.32, 1.6],
  outSine: [0.61, 1, 0.88, 1],
};

export const EASE_NAMES = Object.keys(EASES) as EaseName[];

/** Eased progress for x in [0, 1]. Solves the bezier x(t) = x by bisection, then returns y(t). */
export function easeValue(name: EaseName, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (name === 'linear') return x;
  const [x1, y1, x2, y2] = EASES[name];
  const at = (p1: number, p2: number, t: number) => 3 * p1 * t * (1 - t) * (1 - t) + 3 * p2 * t * t * (1 - t) + t * t * t;
  let lo = 0;
  let hi = 1;
  let t = x;
  for (let i = 0; i < 48; i++) {
    const bx = at(x1, x2, t);
    if (Math.abs(bx - x) < 1e-7) break;
    if (bx < x) lo = t;
    else hi = t;
    t = (lo + hi) / 2;
  }
  return at(y1, y2, t);
}
