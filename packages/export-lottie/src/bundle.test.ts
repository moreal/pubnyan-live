import { describe, expect, test } from 'vitest';
import { clip } from '#ir/clip.ts';
import type { Machine, Rig } from '#ir/types.ts';
import { exportLottieBundle } from '#export-lottie/bundle.ts';

const rig: Rig = {
  name: 'r',
  artboard: { width: 100, height: 100 },
  parts: [{ name: 'a', fill: '#ff0000', pivot: [0, 0], path: 'M0 0L10 0L10 10Z' }],
  expressions: { normal: {} },
};

const clips = [clip('idle', { rig: 'r', duration: 1, fps: 30 }, []), clip('wink', { rig: 'r', duration: 0.3, fps: 30, loop: false }, [])];

const machine: Machine = {
  rig: 'r',
  inputs: { react: { type: 'trigger' } },
  layers: {
    idle: { entry: 'idle', states: { idle: { clip: 'idle', mode: 'loop' } }, transitions: [] },
    reaction: {
      entry: 'none',
      states: { none: { clip: null, mode: 'once' }, wink: { clip: 'wink', mode: 'once' } },
      transitions: [{ from: '*', to: 'wink', when: { input: 'react', fired: true }, duration: 0 }],
    },
  },
};

function readEntryNames(buf: Buffer): string[] {
  const names: string[] = [];
  let at = 0;
  while (buf.readUInt32LE(at) === 0x04034b50) {
    const nameLen = buf.readUInt16LE(at + 26);
    const size = buf.readUInt32LE(at + 18);
    const name = buf.subarray(at + 30, at + 30 + nameLen).toString('utf8');
    names.push(name);
    at += 30 + nameLen + size;
  }
  return names;
}

describe('exportLottieBundle', () => {
  test('zips manifest.json, one animations/<clip>.json per clip, and the state machine under s/', () => {
    const buf = exportLottieBundle(rig, clips, machine);
    const names = readEntryNames(buf);
    expect(names).toEqual(['manifest.json', 'animations/idle.json', 'animations/wink.json', 's/pubnyan.json']);
  });

  test('manifest lists every clip as an animation and the state machine id', () => {
    const buf = exportLottieBundle(rig, clips, machine);
    const names = readEntryNames(buf);
    const manifestStart = 30 + Buffer.from('manifest.json').length;
    const manifestSize = buf.readUInt32LE(18);
    const manifest = JSON.parse(buf.subarray(manifestStart, manifestStart + manifestSize).toString('utf8'));
    expect(names).toContain('manifest.json');
    expect(manifest.animations).toEqual([{ id: 'idle' }, { id: 'wink' }]);
    expect(manifest.stateMachines).toEqual([{ id: 'pubnyan' }]);
    expect(manifest.initial).toEqual({ animation: 'idle', stateMachine: 'pubnyan' });
  });
});
