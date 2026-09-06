import { validateClip } from '#ir/clip.ts';
import { validateMachine } from '#ir/machine.ts';
import type { Clip, Machine, Rig } from '#ir/types.ts';
import { assertValid, validateRig } from '#ir/validate.ts';
import pubnyanRig from '#rig/pubnyan.rig.json' with { type: 'json' };
import starorbitRig from '#rig/starorbit.rig.json' with { type: 'json' };
import exprAngry from '#motion/clips/expr-angry.clip.ts';
import exprCry from '#motion/clips/expr-cry.clip.ts';
import exprCurious from '#motion/clips/expr-curious.clip.ts';
import exprShy from '#motion/clips/expr-shy.clip.ts';
import spinner from '#motion/clips/spinner.clip.ts';
import idle from '#motion/clips/idle.clip.ts';
import wink from '#motion/clips/wink.clip.ts';
import toAngry from '#motion/clips/to-angry.clip.ts';
import fromAngry from '#motion/clips/from-angry.clip.ts';
import toCurious from '#motion/clips/to-curious.clip.ts';
import fromCurious from '#motion/clips/from-curious.clip.ts';
import toCry from '#motion/clips/to-cry.clip.ts';
import fromCry from '#motion/clips/from-cry.clip.ts';
import toShy from '#motion/clips/to-shy.clip.ts';
import fromShy from '#motion/clips/from-shy.clip.ts';
import machineDef from '#motion/machine.ts';

export const rigs: Record<string, Rig> = {
  pubnyan: pubnyanRig as unknown as Rig,
  starorbit: starorbitRig as unknown as Rig,
};

export const clips: Clip[] = [
  spinner,
  idle,
  wink,
  exprAngry,
  exprCurious,
  exprCry,
  exprShy,
  toAngry,
  fromAngry,
  toCurious,
  fromCurious,
  toCry,
  fromCry,
  toShy,
  fromShy,
];
export const machine: Machine = machineDef;

export function getRig(name: string): Rig {
  const rig = rigs[name];
  if (!rig) throw new Error(`unknown rig "${name}"; known: ${Object.keys(rigs).join(', ')}`);
  return rig;
}

// Validate once, here, so every consumer of the motion definition inherits it.
for (const rig of Object.values(rigs)) assertValid(validateRig(rig), `rig ${rig.name}`);
for (const clip of clips) assertValid(validateClip(clip, getRig(clip.rig)), `clip ${clip.name}`);
assertValid(validateMachine(machine, getRig(machine.rig), clips), `machine`);
