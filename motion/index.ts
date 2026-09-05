import { validateClip } from '#ir/clip.ts';
import type { Clip, Rig } from '#ir/types.ts';
import { assertValid, validateRig } from '#ir/validate.ts';
import pubnyanRig from '#rig/pubnyan.rig.json' with { type: 'json' };
import starorbitRig from '#rig/starorbit.rig.json' with { type: 'json' };
import spinner from '#motion/clips/spinner.clip.ts';
import idle from '#motion/clips/idle.clip.ts';

export const rigs: Record<string, Rig> = {
  pubnyan: pubnyanRig as unknown as Rig,
  starorbit: starorbitRig as unknown as Rig,
};

export const clips: Clip[] = [spinner, idle];

export function getRig(name: string): Rig {
  const rig = rigs[name];
  if (!rig) throw new Error(`unknown rig "${name}"; known: ${Object.keys(rigs).join(', ')}`);
  return rig;
}

// Validate once, here, so every consumer of the motion definition inherits it.
for (const rig of Object.values(rigs)) assertValid(validateRig(rig), `rig ${rig.name}`);
for (const clip of clips) assertValid(validateClip(clip, getRig(clip.rig)), `clip ${clip.name}`);
