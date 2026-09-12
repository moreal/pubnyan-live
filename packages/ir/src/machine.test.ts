import { describe, expect, test } from 'vitest';
import { clip } from '#ir/clip.ts';
import { machine, validateMachine } from '#ir/machine.ts';
import type { Rig } from '#ir/types.ts';

const rig: Rig = { name: 'r', artboard: { width: 1, height: 1 }, parts: [{ name: 'a', fill: '#000000', pivot: [0, 0], path: 'M0 0Z' }], expressions: {} };
const clips = [clip('idle', { rig: 'r', duration: 1 }, [{ part: 'a', property: 'opacity', keys: [{ t: 0, v: 1 }] }])];

describe('machine', () => {
  test('accepts a consistent machine', () => {
    const m = machine({
      rig: 'r',
      inputs: { react: { type: 'trigger' }, loading: { type: 'bool', default: false }, mood: { type: 'enum', values: ['a', 'b'], default: 'a' } },
      layers: {
        base: {
          entry: 'idle',
          states: { idle: { clip: 'idle', mode: 'loop' }, none: { clip: null, mode: 'once' } },
          transitions: [
            { from: 'idle', to: 'none', when: { input: 'react', fired: true }, duration: 0.2 },
            { from: '*', to: 'idle', when: { input: 'loading', equals: false }, duration: 0 },
          ],
        },
      },
    });
    expect(validateMachine(m, rig, clips)).toEqual([]);
  });

  test('reports unknown states, clips, inputs, and type mismatches', () => {
    const m = machine({
      rig: 'r',
      inputs: { mood: { type: 'enum', values: ['a'], default: 'zzz' } },
      layers: { l: { entry: 'nope', states: { s: { clip: 'missing', mode: 'loop' } }, transitions: [
        { from: 's', to: 'gone', when: { input: 'what', equals: true }, duration: -1 },
        { from: 's', to: 's', when: { input: 'mood', equals: true }, duration: 0 },
      ] } },
    });
    const errors = validateMachine(m, rig, clips).join('\n');
    for (const needle of ['default "zzz"', 'entry "nope"', 'clip "missing"', 'state "gone"', 'input "what"', 'duration', 'enum "mood" must equal a string']) {
      expect(errors).toContain(needle);
    }
  });
});

test('rejects incomplete or invalid transition bridges before exporting', () => {
  const m = machine({rig:'r',inputs:{mood:{type:'enum',values:['a','b'],default:'a'}},layers:{base:{
    entry:'a',states:{a:{clip:'idle',mode:'loop'},b:{clip:'idle',mode:'loop'}},
    transitions:[{from:'*',to:'b',when:{input:'mood',equals:'b'},duration:0.1}],
    bridges:{a:{b:{...clips[0]!,name:'bridge',loop:true,rig:'wrong'}}},
  }}});
  expect(validateMachine(m,rig,clips).join('\n')).toContain('bridge');
  m.layers.base!.bridges={};
  expect(validateMachine(m,rig,clips).join('\n')).toContain('missing bridge');
});
