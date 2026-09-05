import { describe, expect, test } from 'vitest';
import type { Machine } from '#ir/types.ts';
import { exportStateMachine, type DotLottieGlobalState, type DotLottiePlaybackState } from '#export-lottie/statemachine.ts';

const machine: Machine = {
  rig: 'pubnyan',
  inputs: {
    expression: { type: 'enum', values: ['normal', 'angry'], default: 'normal' },
    react: { type: 'trigger' },
    loading: { type: 'bool', default: false },
  },
  layers: {
    idle: { entry: 'idle', states: { idle: { clip: 'idle', mode: 'loop' } }, transitions: [] },
    expression: {
      entry: 'normal',
      states: { normal: { clip: null, mode: 'loop' }, angry: { clip: 'expr-angry', mode: 'loop' } },
      transitions: [
        { from: '*', to: 'normal', when: { input: 'expression', equals: 'normal' }, duration: 0.2 },
        { from: '*', to: 'angry', when: { input: 'expression', equals: 'angry' }, duration: 0.2 },
      ],
    },
    reaction: {
      entry: 'none',
      states: { none: { clip: null, mode: 'once' }, wink: { clip: 'wink', mode: 'once' } },
      transitions: [{ from: '*', to: 'wink', when: { input: 'react', fired: true }, duration: 0 }],
    },
  },
};

describe('exportStateMachine', () => {
  const sm = exportStateMachine(machine);

  test('inputs: enum -> String, bool -> Boolean, trigger -> Event', () => {
    expect(sm.inputs).toEqual(
      expect.arrayContaining([
        { type: 'String', name: 'expression', value: 'normal' },
        { type: 'Boolean', name: 'loading', value: false },
        { type: 'Event', name: 'react' },
      ]),
    );
  });

  test('idle layer folds into null-clip states; non-idle layers become playback states', () => {
    const byName = new Map(sm.states.map((s) => [s.name, s]));
    const normal = byName.get('expression.normal') as DotLottiePlaybackState;
    const angry = byName.get('expression.angry') as DotLottiePlaybackState;
    const none = byName.get('reaction.none') as DotLottiePlaybackState;
    const wink = byName.get('reaction.wink') as DotLottiePlaybackState;
    expect(normal.animation).toBe('idle'); // clip: null falls back to the idle layer's clip
    expect(angry.animation).toBe('expr-angry');
    expect(none.animation).toBe('idle');
    expect(wink.animation).toBe('wink');
    expect(wink.loop).toBe(false);
    expect(byName.has('idle.idle')).toBe(false); // idle layer itself is not a standalone state
  });

  test('every from:* transition becomes a guarded transition on the single GlobalState', () => {
    const global = sm.states.find((s) => s.type === 'GlobalState') as DotLottieGlobalState;
    expect(global.transitions).toHaveLength(3);
    const toAngry = global.transitions.find((t) => t.toState === 'expression.angry')!;
    expect(toAngry.type).toBe('Tweened');
    expect(toAngry.duration).toBe(0.2);
    expect(toAngry.guards).toEqual([{ type: 'String', inputName: 'expression', conditionType: 'Equal', compareTo: 'angry' }]);
    const toWink = global.transitions.find((t) => t.toState === 'reaction.wink')!;
    expect(toWink.type).toBe('Transition');
    expect(toWink.guards).toEqual([{ type: 'Event', inputName: 'react' }]);
  });

  test('initial state is the first non-idle layer entry', () => {
    expect(sm.initial).toBe('expression.normal');
  });

  test('rejects a from: <specific state> transition', () => {
    const bad: Machine = {
      ...machine,
      layers: {
        ...machine.layers,
        expression: {
          ...machine.layers.expression!,
          transitions: [{ from: 'normal', to: 'angry', when: { input: 'expression', equals: 'angry' }, duration: 0 }],
        },
      },
    };
    expect(() => exportStateMachine(bad)).toThrow(/from: '\*'/);
  });
});
