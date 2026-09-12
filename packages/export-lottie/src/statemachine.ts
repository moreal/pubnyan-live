import { EASES } from '#ir/easing.ts';
import type { Machine, MachineTransition } from '#ir/types.ts';

/**
 * dotLottie state machine JSON (the format `stateMachineLoadData` / the `s/<id>.json` bundle
 * entry expects), per https://github.com/LottieFiles/dotlottie-rs `state_machine::definition`.
 *
 * dotLottie only ever plays ONE animation at a time, so this is a lossy flattening of `Machine`'s
 * parallel layers into a single graph: the `idle` layer's clip becomes the visual for expression
 * states with `clip: null` (the rig's neutral pose), and every OTHER layer's transitions become
 * global (checked regardless of which state is active), with compound guards preserved. Named overlay-release transitions attach to the reaction
 * state and return to the selected expression. Other named transitions remain unsupported.
 */

export type DotLottieInputDef =
  | { type: 'String'; name: string; value: string }
  | { type: 'Boolean'; name: string; value: boolean }
  | { type: 'Event'; name: string };

export interface DotLottieGuard {
  type: 'String' | 'Boolean' | 'Event';
  inputName: string;
  conditionType?: 'Equal' | 'NotEqual';
  compareTo?: string | boolean;
}

export interface DotLottieTransition {
  type: 'Transition' | 'Tweened';
  toState: string;
  guards?: DotLottieGuard[];
  duration?: number;
  easing?: [number, number, number, number];
}

export interface DotLottiePlaybackState {
  type: 'PlaybackState';
  name: string;
  animation: string;
  loop?: boolean;
  autoplay?: boolean;
  transitions: DotLottieTransition[];
}

export interface DotLottieGlobalState {
  type: 'GlobalState';
  name: string;
  transitions: DotLottieTransition[];
}

export interface DotLottieStateMachine {
  initial: string;
  states: (DotLottiePlaybackState | DotLottieGlobalState)[];
  inputs: DotLottieInputDef[];
}

/** `${layer}.${state}` names every flattened state so identically-named states across layers don't collide. */
const stateId = (layer: string, state: string) => `${layer}.${state}`;

function guardFor(machine: Machine, when: MachineTransition['when']): DotLottieGuard {
  const input = machine.inputs[when.input];
  if (!input) throw new Error(`export-lottie: machine transition references unknown input "${when.input}"`);
  if ('fired' in when) {
    if (input.type !== 'trigger') throw new Error(`export-lottie: "fired" guard needs a trigger input, got "${input.type}" for "${when.input}"`);
    return { type: 'Event', inputName: when.input };
  }
  if (input.type === 'enum') return { type: 'String', inputName: when.input, conditionType: 'Equal', compareTo: when.equals as string };
  if (input.type === 'bool') return { type: 'Boolean', inputName: when.input, conditionType: 'Equal', compareTo: when.equals as boolean };
  throw new Error(`export-lottie: "equals" guard cannot target trigger input "${when.input}"`);
}

function transitionFor(machine: Machine, layerName: string, tr: MachineTransition): DotLottieTransition {
  const guards = [tr.when, ...(tr.when.and ?? [])].map(when => guardFor(machine, when));
  const toState = stateId(layerName, tr.to);
  if (tr.duration <= 0) return { type: 'Transition', toState, guards };
  const [x1, y1, x2, y2] = EASES.linear;
  return { type: 'Tweened', toState, duration: tr.duration, easing: [x1, y1, x2, y2], guards };
}

export function exportStateMachine(machine: Machine): DotLottieStateMachine {
  const idleLayer = machine.layers.idle;
  const idleClip = idleLayer?.states[idleLayer.entry]?.clip ?? null;

  const states: (DotLottiePlaybackState | DotLottieGlobalState)[] = [];
  const globalTransitions: DotLottieTransition[] = [];
  let initial: string | undefined;

  for (const [layerName, layer] of Object.entries(machine.layers)) {
    if (layerName === 'idle') continue; // folded into every null-clip state's `idleClip` fallback below
    for (const [stateName, state] of Object.entries(layer.states)) {
      const animation = state.clip ?? idleClip;
      if (!animation) continue; // no clip anywhere to show for this state; nothing to author
      states.push({
        type: 'PlaybackState',
        name: stateId(layerName, stateName),
        animation,
        loop: state.mode === 'loop',
        autoplay: true,
        transitions: [],
      });
    }
    for (const tr of layer.transitions) {
      if (tr.from !== '*') {
        // Releasing an overlay returns to the expression selected by this guard.
        // A single-animation target has no empty layer to blend back into.
        const expressionTransition = machine.layers.expression?.transitions.find(candidate =>
          candidate.when.input === tr.when.input && 'equals' in candidate.when &&
          'equals' in tr.when && candidate.when.equals === tr.when.equals);
        if (tr.to === layer.entry && layer.states[tr.to]?.clip === null && expressionTransition) {
          const source = states.find(state => state.name === stateId(layerName, tr.from));
          source?.transitions.push({ ...transitionFor(machine, layerName, tr),
            toState: stateId('expression', expressionTransition.to) });
          continue;
        }
        throw new Error(`export-lottie: state machine derivation only supports "from: '*'" transitions or expression-driven overlay releases, got "${tr.from}" in layer "${layerName}"`);
      }
      globalTransitions.push(transitionFor(machine, layerName, tr));
    }
    if (initial === undefined) initial = stateId(layerName, layer.entry);
  }
  if (initial === undefined) {
    if (!idleClip) throw new Error('export-lottie: machine has no non-idle layers and no idle clip to fall back to');
    initial = stateId('idle', idleLayer!.entry);
    states.push({ type: 'PlaybackState', name: initial, animation: idleClip, loop: true, autoplay: true, transitions: [] });
  }
  states.push({ type: 'GlobalState', name: 'global', transitions: globalTransitions });

  const inputs: DotLottieInputDef[] = Object.entries(machine.inputs).map(([name, input]) => {
    if (input.type === 'enum') return { type: 'String', name, value: input.default };
    if (input.type === 'bool') return { type: 'Boolean', name, value: input.default };
    return { type: 'Event', name };
  });

  return { initial, states, inputs };
}
