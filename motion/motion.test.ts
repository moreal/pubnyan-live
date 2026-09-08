import { describe, expect, test } from 'vitest';
import { easeValue } from '#ir/easing.ts';
import { sampleNumeric, sampleVec2 } from '#ir/sample.ts';
import type { Clip, Track } from '#ir/types.ts';
import { clips } from '#motion/index.ts';

// easeValue is exercised indirectly through sampleNumeric/sampleVec2 (both call it via
// `locate`); referencing it here keeps the import honest with the item's "using
// sampleClip/easeValue" wording and gives us a place to sanity-check it directly too.
test('easeValue is monotone-safe at the segment ends', () => {
  for (const name of ['linear', 'inOutSine', 'outCubic'] as const) {
    expect(easeValue(name, 0)).toBe(0);
    expect(easeValue(name, 1)).toBe(1);
  }
});

const PUBNYAN_POSITION_PX = 8;
const PUBNYAN_ROTATION_DEG = 6;
const PUBNYAN_BODY_SCALE_DELTA = 0.02;
const FLOAT_SLACK = 1e-9;

/** Below this per-second speed, a track counts as "at rest": the ~1/fps^2 curvature noise
 * that a zero-slope ease leaves at a segment boundary should not trip the seam-jerk check. */
const REST_SPEED = 0.05;

function normalizeAngle(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function speedAt(track: Track, t: number, dt: number): number {
  if (track.property === 'rotation') {
    const a = sampleNumeric(track as Track<'rotation'>, t);
    const b = sampleNumeric(track as Track<'rotation'>, t + dt);
    return Math.abs(b - a) / dt;
  }
  const a = sampleVec2(track as Track<'position' | 'scale'>, t);
  const b = sampleVec2(track as Track<'position' | 'scale'>, t + dt);
  return Math.hypot(b[0] - a[0], b[1] - a[1]) / dt;
}

describe('motion smoothness guard', () => {
  for (const clip of clips as Clip[]) {
    const isPubnyan = clip.rig === 'pubnyan';

    if (isPubnyan) {
      test(`${clip.name}: fps is at least 60`, () => {
        expect(clip.fps, `clip "${clip.name}" has fps=${clip.fps}, must be >= 60`).toBeGreaterThanOrEqual(60);
      });
    }

    // Expression transitions (`to-*`/`from-*`) carry `shape` tracks and are meant to leave
    // pubnyan in a new expression, not return to rest; the "return to start" guard below is
    // for one-shot reactions, including celebrate, whose smile shape also returns to rest.
    const isStateTransition = /^(to|from)-/.test(clip.name);

    if (!clip.loop && !isStateTransition) {
      test(`${clip.name}: every track returns to its first key`, () => {
        for (const track of clip.tracks) {
          const first = track.keys[0];
          const last = track.keys[track.keys.length - 1];
          const where = `clip "${clip.name}" track "${track.part}.${track.property}" (last key t=${last.t})`;
          if (track.property === 'rotation') {
            const a = normalizeAngle(first.v as number);
            const b = normalizeAngle(last.v as number);
            if (Math.abs(a - b) > FLOAT_SLACK) {
              throw new Error(`${where}: last value ${last.v} != first value ${first.v} (mod 360: ${b} != ${a})`);
            }
          } else if (track.property === 'position' || track.property === 'scale') {
            const [fx, fy] = first.v as [number, number];
            const [lx, ly] = last.v as [number, number];
            if (fx !== lx || fy !== ly) {
              throw new Error(`${where}: last value [${lx}, ${ly}] != first value [${fx}, ${fy}]`);
            }
          } else if (first.v !== last.v) {
            throw new Error(`${where}: last value ${JSON.stringify(last.v)} != first value ${JSON.stringify(first.v)}`);
          }
        }
      });
    }

    if (clip.loop) {
      test(`${clip.name}: loop seam is C0-continuous with no velocity jump`, () => {
        const dt = 1 / clip.fps;
        const T = clip.duration;
        for (const track of clip.tracks) {
          if (track.property === 'opacity' || track.property === 'shape') continue;
          const where = `clip "${clip.name}" track "${track.part}.${track.property}"`;

          // C0: the value just before the seam must match the value just after it.
          if (track.property === 'rotation') {
            const start = sampleNumeric(track as Track<'rotation'>, 0);
            const end = sampleNumeric(track as Track<'rotation'>, T);
            const diff = Math.abs(normalizeAngle(start) - normalizeAngle(end));
            if (Math.min(diff, 360 - diff) > FLOAT_SLACK) {
              throw new Error(`${where}: not C0 at the seam (value at t=0 is ${start}, at t=duration is ${end})`);
            }
          } else {
            const start = sampleVec2(track as Track<'position' | 'scale'>, 0);
            const end = sampleVec2(track as Track<'position' | 'scale'>, T);
            if (Math.abs(start[0] - end[0]) > FLOAT_SLACK || Math.abs(start[1] - end[1]) > FLOAT_SLACK) {
              throw new Error(`${where}: not C0 at the seam (value at t=0 is [${start}], at t=duration is [${end}])`);
            }
          }

          // Velocity: the speed leaving t=0 and the speed arriving at t=duration must not
          // differ by 3x or more (a "hitch" as the loop restarts), unless both are at rest.
          const vAfter = speedAt(track, 0, dt);
          const vBefore = speedAt(track, T - dt, dt);
          const bothAtRest = vAfter < REST_SPEED && vBefore < REST_SPEED;
          if (!bothAtRest) {
            const eitherAtRest = vAfter < REST_SPEED || vBefore < REST_SPEED;
            const ratio = eitherAtRest ? Infinity : Math.max(vAfter, vBefore) / Math.min(vAfter, vBefore);
            if (!(ratio < 3)) {
              throw new Error(
                `${where}: seam velocity jump (speed one frame in = ${vAfter.toFixed(5)}, speed one frame before the seam = ${vBefore.toFixed(5)}, ratio = ${ratio === Infinity ? 'Infinity' : ratio.toFixed(2)})`,
              );
            }
          }
        }
      });
    }

    if (isPubnyan) {
      test(`${clip.name}: amplitudes stay within the pubnyan limits`, () => {
        const dt = 1 / (clip.fps * 4);
        for (const track of clip.tracks) {
          if (track.property === 'position') {
            for (let t = 0; t <= clip.duration + FLOAT_SLACK; t += dt) {
              const [x, y] = sampleVec2(track as Track<'position'>, t);
              for (const [axis, v] of [['x', x], ['y', y]] as const) {
                if (Math.abs(v) > PUBNYAN_POSITION_PX + FLOAT_SLACK) {
                  throw new Error(
                    `clip "${clip.name}" track "${track.part}.position" exceeds ${PUBNYAN_POSITION_PX}px on ${axis} at t=${t.toFixed(4)}: ${v}`,
                  );
                }
              }
            }
          } else if (track.property === 'rotation') {
            for (let t = 0; t <= clip.duration + FLOAT_SLACK; t += dt) {
              const v = sampleNumeric(track as Track<'rotation'>, t);
              if (Math.abs(v) > PUBNYAN_ROTATION_DEG + FLOAT_SLACK) {
                throw new Error(
                  `clip "${clip.name}" track "${track.part}.rotation" exceeds ${PUBNYAN_ROTATION_DEG}deg at t=${t.toFixed(4)}: ${v}`,
                );
              }
            }
          } else if (track.property === 'scale' && ['body', 'torso'].includes(track.part)) {
            for (let t = 0; t <= clip.duration + FLOAT_SLACK; t += dt) {
              const [sx, sy] = sampleVec2(track as Track<'scale'>, t);
              for (const [axis, v] of [['x', sx], ['y', sy]] as const) {
                if (Math.abs(v - 1) > PUBNYAN_BODY_SCALE_DELTA + FLOAT_SLACK) {
                  throw new Error(
                    `clip "${clip.name}" track "${track.part}.scale" exceeds 1 +- ${PUBNYAN_BODY_SCALE_DELTA} on ${axis} at t=${t.toFixed(4)}: ${v}`,
                  );
                }
              }
            }
          }
        }
      });
    }
  }
});
