import { exportLottie } from '#export-lottie/index.ts';
import { exportStateMachine } from '#export-lottie/statemachine.ts';
import { zip } from '#export-lottie/zip.ts';
import type { Clip, Machine, Rig } from '#ir/types.ts';

export interface DotLottieManifest {
  version: string;
  generator: string;
  initial: { animation: string; stateMachine: string };
  animations: { id: string }[];
  stateMachines: { id: string }[];
}

const STATE_MACHINE_ID = 'pubnyan';

/** `dist/lottie/pubnyan.lottie`: manifest.json, `animations/<clip>.json`, `s/<id>.json`. */
export function exportLottieBundle(rig: Rig, clips: Clip[], machine: Machine): Buffer {
  const manifest: DotLottieManifest = {
    version: '1',
    generator: 'pubnyan-live',
    initial: { animation: clips[0]!.name, stateMachine: STATE_MACHINE_ID },
    animations: clips.map((c) => ({ id: c.name })),
    stateMachines: [{ id: STATE_MACHINE_ID }],
  };
  const stateMachine = exportStateMachine(machine);

  return zip([
    { name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest), 'utf8') },
    ...clips.map((clip) => ({
      name: `animations/${clip.name}.json`,
      data: Buffer.from(JSON.stringify(exportLottie(rig, clip)), 'utf8'),
    })),
    { name: `s/${STATE_MACHINE_ID}.json`, data: Buffer.from(JSON.stringify(stateMachine), 'utf8') },
  ]);
}
