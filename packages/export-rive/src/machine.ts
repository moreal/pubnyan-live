/**
 * `.riv` state machine exporter (backlog: "export-rive: state machine"): unlike `exportRive`
 * (one `.riv` per clip, for parity), this builds ONE artboard holding the rig's rest-pose geometry,
 * every clip `motion/machine.ts` references as a `LinearAnimation`, and a `StateMachine` with:
 *   - one `StateMachineNumber` / `StateMachineBool` / `StateMachineTrigger` per `Machine` input
 *     (`enum` inputs become a `StateMachineNumber` holding the index into `values`, since the
 *     classic runtime state machine has no native string/enum input),
 *   - one `StateMachineLayer` per `Machine` layer, with an `EntryState` wired (via an unconditional,
 *     zero-duration `StateTransition`) to that layer's `entry` state, an `AnyState` holding every
 *     `from: '*'` transition (any OTHER named `from` attaches to that state directly), and one
 *     `AnimationState` per named state (a `clip: null` state gets an out-of-range `animationId`:
 *     harmless, since nothing ever calls `advance()` on it here, and it keeps every state a real
 *     `AnimationState` rather than a second, unregistered state type),
 *   - `StateTransition`s carrying a `TransitionNumberCondition` / `TransitionBoolCondition` /
 *     `TransitionTriggerCondition` per `MachineTransition.when`.
 *
 * This is not a parity target (no shape morphing/crossfading: every part's Shape is built once,
 * at rest, from `RigPart.path`, and each `LinearAnimation` only keys transform/opacity tracks) —
 * it exists to prove the state machine graph loads and exposes the inputs `motion/machine.ts`
 * declares, per the backlog item's own acceptance check (`stateMachineInputs()` names).
 */
import { EASES } from '#ir/easing.ts';
import { groupTracks, type TracksByProperty } from '#ir/sample.ts';
import type { Clip, EaseName, Machine, MachineTransition, Rig, RigPart, Vec2 } from '#ir/types.ts';
import { splitSubpaths, subpathToVertices } from '#export-rive/index.ts';
import { KEYS } from '#export-rive/keys.generated.ts';
import { RivWriter } from '#export-rive/writer.ts';

const { typeKey: BACKBOARD } = KEYS.Backboard!;
const { typeKey: ARTBOARD } = KEYS.Artboard!;
const { typeKey: NODE } = KEYS.Node!;
const { typeKey: SHAPE } = KEYS.Shape!;
const { typeKey: POINTS_PATH } = KEYS.PointsPath!;
const { typeKey: CUBIC_DETACHED_VERTEX } = KEYS.CubicDetachedVertex!;
const { typeKey: FILL } = KEYS.Fill!;
const { typeKey: SOLID_COLOR } = KEYS.SolidColor!;
const { typeKey: LINEAR_ANIMATION } = KEYS.LinearAnimation!;
const { typeKey: KEYED_OBJECT } = KEYS.KeyedObject!;
const { typeKey: KEYED_PROPERTY } = KEYS.KeyedProperty!;
const { typeKey: KEY_FRAME_DOUBLE } = KEYS.KeyFrameDouble!;
const { typeKey: CUBIC_EASE_INTERPOLATOR } = KEYS.CubicEaseInterpolator!;
const { typeKey: STATE_MACHINE } = KEYS.StateMachine!;
const { typeKey: STATE_MACHINE_LAYER } = KEYS.StateMachineLayer!;
const { typeKey: STATE_MACHINE_NUMBER } = KEYS.StateMachineNumber!;
const { typeKey: STATE_MACHINE_BOOL } = KEYS.StateMachineBool!;
const { typeKey: STATE_MACHINE_TRIGGER } = KEYS.StateMachineTrigger!;
const { typeKey: ENTRY_STATE } = KEYS.EntryState!;
const { typeKey: ANY_STATE } = KEYS.AnyState!;
const { typeKey: ANIMATION_STATE } = KEYS.AnimationState!;
const { typeKey: STATE_TRANSITION } = KEYS.StateTransition!;
const { typeKey: TRANSITION_NUMBER_CONDITION } = KEYS.TransitionNumberCondition!;
const { typeKey: TRANSITION_BOOL_CONDITION } = KEYS.TransitionBoolCondition!;
const { typeKey: TRANSITION_TRIGGER_CONDITION } = KEYS.TransitionTriggerCondition!;

const NAME = KEYS.Component!.properties.name!.key;
const PARENT_ID = KEYS.Component!.properties.parentId!.key;
const ARTBOARD_WIDTH = KEYS.LayoutComponent!.properties.width!.key;
const ARTBOARD_HEIGHT = KEYS.LayoutComponent!.properties.height!.key;
const NODE_X = KEYS.Node!.properties.x!.key;
const NODE_Y = KEYS.Node!.properties.y!.key;
const VERTEX_X = KEYS.Vertex!.properties.x!.key;
const VERTEX_Y = KEYS.Vertex!.properties.y!.key;
const IS_CLOSED = KEYS.PointsCommonPath!.properties.isClosed!.key;
const IN_ROTATION = KEYS.CubicDetachedVertex!.properties.inRotation!.key;
const IN_DISTANCE = KEYS.CubicDetachedVertex!.properties.inDistance!.key;
const OUT_ROTATION = KEYS.CubicDetachedVertex!.properties.outRotation!.key;
const OUT_DISTANCE = KEYS.CubicDetachedVertex!.properties.outDistance!.key;
const COLOR_VALUE = KEYS.SolidColor!.properties.colorValue!.key;
const NODE_ROTATION = KEYS.TransformComponent!.properties.rotation!.key;
const NODE_SCALE_X = KEYS.TransformComponent!.properties.scaleX!.key;
const NODE_SCALE_Y = KEYS.TransformComponent!.properties.scaleY!.key;
const NODE_OPACITY = KEYS.WorldTransformComponent!.properties.opacity!.key;
// `Animation.name` (55), inherited by both `LinearAnimation` and `StateMachine` (it extends
// `Animation`), NOT `StateMachineComponent.name` (138, used by layers/inputs below).
const ANIMATION_NAME = KEYS.Animation!.properties.name!.key;
const ANIM_FPS = KEYS.LinearAnimation!.properties.fps!.key;
const ANIM_DURATION = KEYS.LinearAnimation!.properties.duration!.key;
const ANIM_LOOP_VALUE = KEYS.LinearAnimation!.properties.loopValue!.key;
const KEYED_OBJECT_ID = KEYS.KeyedObject!.properties.objectId!.key;
const KEYED_PROPERTY_KEY = KEYS.KeyedProperty!.properties.propertyKey!.key;
const KEY_FRAME_FRAME = KEYS.KeyFrame!.properties.frame!.key;
const KEY_FRAME_INTERPOLATION_TYPE = KEYS.InterpolatingKeyFrame!.properties.interpolationType!.key;
const KEY_FRAME_INTERPOLATOR_ID = KEYS.InterpolatingKeyFrame!.properties.interpolatorId!.key;
const KEY_FRAME_VALUE = KEYS.KeyFrameDouble!.properties.value!.key;
const CUBIC_X1 = KEYS.CubicInterpolator!.properties.x1!.key;
const CUBIC_Y1 = KEYS.CubicInterpolator!.properties.y1!.key;
const CUBIC_X2 = KEYS.CubicInterpolator!.properties.x2!.key;
const CUBIC_Y2 = KEYS.CubicInterpolator!.properties.y2!.key;
const INTERPOLATION_TYPE_CUBIC = 1;

// `StateMachineComponent.name` (layers and inputs are both named this way).
const SM_NAME = KEYS.StateMachineComponent!.properties.name!.key;
const SM_NUMBER_VALUE = KEYS.StateMachineNumber!.properties.value!.key;
const SM_BOOL_VALUE = KEYS.StateMachineBool!.properties.value!.key;
const ANIMATION_ID = KEYS.AnimationState!.properties.animationId!.key;
const STATE_TO_ID = KEYS.StateTransition!.properties.stateToId!.key;
const TRANSITION_FLAGS = KEYS.StateTransition!.properties.flags!.key;
const TRANSITION_DURATION = KEYS.StateTransition!.properties.duration!.key;
const CONDITION_INPUT_ID = KEYS.TransitionInputCondition!.properties.inputId!.key;
const CONDITION_OP_VALUE = KEYS.TransitionValueCondition!.properties.opValue!.key;
const CONDITION_NUMBER_VALUE = KEYS.TransitionNumberCondition!.properties.value!.key;

/** `TransitionConditionOp` (transition_condition_op.hpp): only `equal`/`notEqual` are used here. */
const OP_EQUAL = 0;
const OP_NOT_EQUAL = 1;

/** No clip has this many frames' worth of animations; used as a deliberately out-of-range
 * `animationId` for `clip: null` states (see the file doc comment above). */
const NO_ANIMATION_ID = 0xffffffff;

interface FrameValue {
  frame: number;
  value: number;
  ease?: EaseName;
}

/** Builds the combined rig + all-clips + state-machine `.riv` bytes. `clips` only needs to contain
 * (at least) every clip a `machine` state names; extras are ignored. */
export function exportRiveMachine(rig: Rig, clips: Clip[], machine: Machine): Buffer {
  const w = new RivWriter();
  const clipsByName = new Map(clips.map((c) => [c.name, c]));
  w.object(BACKBOARD, []);
  w.object(ARTBOARD, [
    [NAME, rig.name],
    [ARTBOARD_WIDTH, rig.artboard.width],
    [ARTBOARD_HEIGHT, rig.artboard.height],
  ]);

  const partByName = new Map(rig.parts.map((p) => [p.name, p]));
  const nodeIndexByPart = new Map<string, number>();
  let cursor = 0;
  const add = (typeKey: number, properties: [number, number | string][]): number => {
    w.object(typeKey, properties);
    cursor += 1;
    return cursor;
  };

  // Pass 1: one Node per rig part (see `exportRive`'s identical pass for why parents must precede
  // children in `rig.parts` order).
  for (const part of rig.parts) {
    const parentPart: RigPart | undefined = part.parent ? partByName.get(part.parent) : undefined;
    if (part.parent && !parentPart) throw new Error(`export-rive: part "${part.name}" has unknown parent "${part.parent}"`);
    const parentNodeIndex = parentPart ? nodeIndexByPart.get(parentPart.name)! : 0;
    const parentPivot: Vec2 = parentPart ? parentPart.pivot : [0, 0];
    const nodeIndex = add(NODE, [
      [PARENT_ID, parentNodeIndex],
      [NAME, part.name],
      [NODE_X, part.pivot[0] - parentPivot[0]],
      [NODE_Y, part.pivot[1] - parentPivot[1]],
    ]);
    nodeIndexByPart.set(part.name, nodeIndex);
  }

  // Pass 2: one rest-pose Shape per part with geometry, back to front (see `exportRive`).
  const shapeIndexByPart = new Map<string, number>();
  for (const part of [...rig.parts].reverse()) {
    if (!part.path) continue;
    const nodeIndex = nodeIndexByPart.get(part.name)!;
    const shapeIndex = add(SHAPE, [[PARENT_ID, nodeIndex]]);
    for (const [i, sub] of splitSubpaths(part.path).entries()) {
      const pathIndex = add(POINTS_PATH, [
        [PARENT_ID, shapeIndex],
        [NAME, `${part.name}-${i}`],
        [IS_CLOSED, 1],
      ]);
      for (const v of subpathToVertices(sub, part.pivot)) {
        add(CUBIC_DETACHED_VERTEX, [
          [PARENT_ID, pathIndex],
          [VERTEX_X, v.x],
          [VERTEX_Y, v.y],
          [IN_ROTATION, v.inRotation],
          [IN_DISTANCE, v.inDistance],
          [OUT_ROTATION, v.outRotation],
          [OUT_DISTANCE, v.outDistance],
        ]);
      }
    }
    const fillIndex = add(FILL, [[PARENT_ID, shapeIndex]]);
    add(SOLID_COLOR, [
      [PARENT_ID, fillIndex],
      [COLOR_VALUE, part.fill],
    ]);
    shapeIndexByPart.set(part.name, shapeIndex);
  }

  // Every clip a machine state names becomes one `LinearAnimation`; `animationIdByClip` records
  // each one's index in `Artboard::animation()`'s order, i.e. the order their `LinearAnimation`
  // objects appear in the file (see `exportRive`'s identical assumption for a single clip).
  const referencedClipNames: string[] = [];
  for (const layer of Object.values(machine.layers)) {
    for (const state of Object.values(layer.states)) {
      if (state.clip && !referencedClipNames.includes(state.clip)) referencedClipNames.push(state.clip);
    }
  }
  const animationIdByClip = new Map<string, number>();
  const FPS_SCALE = 1000; // see `exportRive`'s identical comment: keeps keyed seconds on exact frames.

  const writeDoubleTrack = (propertyKey: number, values: FrameValue[]): void => {
    w.object(KEYED_PROPERTY, [[KEYED_PROPERTY_KEY, propertyKey]]);
    for (const [i, v] of values.entries()) {
      const next = values[i + 1];
      const props: [number, number | string][] = [
        [KEY_FRAME_FRAME, v.frame],
        [KEY_FRAME_VALUE, v.value],
      ];
      if (next) {
        props.push([KEY_FRAME_INTERPOLATION_TYPE, INTERPOLATION_TYPE_CUBIC]);
        props.push([KEY_FRAME_INTERPOLATOR_ID, cursor + 1]);
      }
      w.object(KEY_FRAME_DOUBLE, props);
      if (next) {
        const [x1, y1, x2, y2] = EASES[next.ease ?? 'linear'];
        add(CUBIC_EASE_INTERPOLATOR, [
          [CUBIC_X1, x1],
          [CUBIC_Y1, y1],
          [CUBIC_X2, x2],
          [CUBIC_Y2, y2],
        ]);
      }
    }
  };

  for (const [id, clipName] of referencedClipNames.entries()) {
    const clip = clipsByName.get(clipName);
    if (!clip) throw new Error(`export-rive: machine references clip "${clipName}" not present in the given clips`);
    animationIdByClip.set(clipName, id);

    const animFps = clip.fps * FPS_SCALE;
    const toFrame = (t: number) => Math.round(t * animFps);
    const duration = Math.max(1, Math.round(clip.duration * animFps));
    w.object(LINEAR_ANIMATION, [
      [ANIMATION_NAME, clip.name],
      [ANIM_FPS, animFps],
      [ANIM_DURATION, duration],
      [ANIM_LOOP_VALUE, clip.loop ? 1 : 0],
    ]);

    const byPart = groupTracks(clip);
    for (const part of rig.parts) {
      const tracks: TracksByProperty = byPart.get(part.name) ?? {};
      const nodeIndex = nodeIndexByPart.get(part.name);
      if (nodeIndex === undefined) continue;
      const parentPart: RigPart | undefined = part.parent ? partByName.get(part.parent) : undefined;
      const parentPivot: Vec2 = parentPart ? parentPart.pivot : [0, 0];
      if (tracks.position || tracks.rotation || tracks.scale) {
        w.object(KEYED_OBJECT, [[KEYED_OBJECT_ID, nodeIndex]]);
        if (tracks.position) {
          const dx = part.pivot[0] - parentPivot[0];
          const dy = part.pivot[1] - parentPivot[1];
          writeDoubleTrack(NODE_X, tracks.position.keys.map((k) => ({ frame: toFrame(k.t), value: dx + k.v[0], ease: k.ease })));
          writeDoubleTrack(NODE_Y, tracks.position.keys.map((k) => ({ frame: toFrame(k.t), value: dy + k.v[1], ease: k.ease })));
        }
        if (tracks.rotation) {
          writeDoubleTrack(
            NODE_ROTATION,
            tracks.rotation.keys.map((k) => ({ frame: toFrame(k.t), value: (k.v * Math.PI) / 180, ease: k.ease })),
          );
        }
        if (tracks.scale) {
          writeDoubleTrack(NODE_SCALE_X, tracks.scale.keys.map((k) => ({ frame: toFrame(k.t), value: k.v[0], ease: k.ease })));
          writeDoubleTrack(NODE_SCALE_Y, tracks.scale.keys.map((k) => ({ frame: toFrame(k.t), value: k.v[1], ease: k.ease })));
        }
      }
      if (tracks.opacity) {
        const shapeIndex = shapeIndexByPart.get(part.name);
        if (shapeIndex !== undefined) {
          w.object(KEYED_OBJECT, [[KEYED_OBJECT_ID, shapeIndex]]);
          writeDoubleTrack(NODE_OPACITY, tracks.opacity.keys.map((k) => ({ frame: toFrame(k.t), value: k.v, ease: k.ease })));
        }
      }
      // Shape morphing/crossfading is intentionally not authored here (see the file doc comment).
    }
  }

  // The state machine itself: one `StateMachine`, its inputs, then one `StateMachineLayer` per
  // `machine.layers` entry.
  w.object(STATE_MACHINE, [[ANIMATION_NAME, 'main']]);

  const inputIndexByName = new Map<string, number>();
  for (const [name, input] of Object.entries(machine.inputs)) {
    inputIndexByName.set(name, inputIndexByName.size);
    if (input.type === 'enum') {
      w.object(STATE_MACHINE_NUMBER, [
        [SM_NAME, name],
        [SM_NUMBER_VALUE, input.values.indexOf(input.default)],
      ]);
    } else if (input.type === 'bool') {
      w.object(STATE_MACHINE_BOOL, [
        [SM_NAME, name],
        [SM_BOOL_VALUE, input.default ? 1 : 0],
      ]);
    } else {
      w.object(STATE_MACHINE_TRIGGER, [[SM_NAME, name]]);
    }
  }

  /** One condition object per `MachineTransition.when` (backlog: "TransitionNumberCondition /
   * TransitionBoolCondition / TransitionTriggerCondition"). */
  const writeCondition = (when: MachineTransition['when']): void => {
    const inputId = inputIndexByName.get(when.input);
    if (inputId === undefined) throw new Error(`export-rive: transition references unknown input "${when.input}"`);
    if ('fired' in when) {
      w.object(TRANSITION_TRIGGER_CONDITION, [[CONDITION_INPUT_ID, inputId]]);
      return;
    }
    const input = machine.inputs[when.input]!;
    if (input.type === 'enum') {
      w.object(TRANSITION_NUMBER_CONDITION, [
        [CONDITION_INPUT_ID, inputId],
        [CONDITION_OP_VALUE, OP_EQUAL],
        [CONDITION_NUMBER_VALUE, input.values.indexOf(when.equals as string)],
      ]);
    } else if (input.type === 'bool') {
      w.object(TRANSITION_BOOL_CONDITION, [
        [CONDITION_INPUT_ID, inputId],
        [CONDITION_OP_VALUE, when.equals === true ? OP_EQUAL : OP_NOT_EQUAL],
      ]);
    } else {
      throw new Error(`export-rive: "equals" guard cannot target trigger input "${when.input}"`);
    }
  };

  /** Writes a `StateTransition` to `toName` (an index looked up in `stateIndex`), with `duration`
   * in seconds and, unless omitted, one condition per `when`. An omitted `when` (only used for the
   * `EntryState`'s own transition) leaves the `StateTransition` with zero conditions, which
   * `StateTransition::allowed()` trivially passes — i.e. unconditional. */
  const writeTransition = (toName: string, duration: number, when: MachineTransition['when'] | undefined, stateIndex: Map<string, number>): void => {
    const stateToId = stateIndex.get(toName);
    if (stateToId === undefined) throw new Error(`export-rive: transition targets unknown state "${toName}"`);
    w.object(STATE_TRANSITION, [
      [STATE_TO_ID, stateToId],
      [TRANSITION_FLAGS, 0],
      [TRANSITION_DURATION, Math.round(duration * 1000)],
    ]);
    if (when) writeCondition(when);
  };

  for (const [layerName, layer] of Object.entries(machine.layers)) {
    w.object(STATE_MACHINE_LAYER, [[SM_NAME, layerName]]);

    const wildcardTransitions = layer.transitions.filter((t) => t.from === '*');
    const namedTransitionsByFrom = new Map<string, MachineTransition[]>();
    for (const tr of layer.transitions) {
      if (tr.from === '*') continue;
      const list = namedTransitionsByFrom.get(tr.from) ?? [];
      list.push(tr);
      namedTransitionsByFrom.set(tr.from, list);
    }

    // States are written in this fixed order so `stateToId` (an index into this layer's own
    // states, per `StateMachineLayerImporter::resolve`) is known before any transition needs it.
    const stateNames = Object.keys(layer.states);
    const stateIndex = new Map<string, number>();
    stateIndex.set('__entry__', 0);
    let nextIndex = 1;
    if (wildcardTransitions.length > 0) {
      stateIndex.set('__any__', nextIndex);
      nextIndex += 1;
    }
    for (const name of stateNames) {
      stateIndex.set(name, nextIndex);
      nextIndex += 1;
    }

    // EntryState, wired with one unconditional, instant transition to `layer.entry`.
    w.object(ENTRY_STATE, []);
    writeTransition(layer.entry, 0, undefined, stateIndex);

    if (wildcardTransitions.length > 0) {
      w.object(ANY_STATE, []);
      for (const tr of wildcardTransitions) writeTransition(tr.to, tr.duration, tr.when, stateIndex);
    }

    for (const name of stateNames) {
      const state = layer.states[name]!;
      const animationId = state.clip ? animationIdByClip.get(state.clip)! : NO_ANIMATION_ID;
      w.object(ANIMATION_STATE, [[ANIMATION_ID, animationId]]);
      for (const tr of namedTransitionsByFrom.get(name) ?? []) writeTransition(tr.to, tr.duration, tr.when, stateIndex);
    }
  }

  return w.toBytes();
}
