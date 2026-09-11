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
 *     the runtime treats that as an empty animation, allowing completed overlays to release
 *     their channels without keying a neutral pose over the expression layer),
 *   - `StateTransition`s carrying a `TransitionNumberCondition` / `TransitionBoolCondition` /
 *     `TransitionTriggerCondition` per `MachineTransition.when`.
 *
 * Compatible expression paths share keyed vertices; incompatible paths crossfade.
 * Full expression states explicitly reset neutral channels. Reaction overlays key
 * only the channels they own. Runtime tests compare the combined file's faces to
 * the reference sampler, not merely its list of input names.
 */
import { EASES } from '#ir/easing.ts';
import { interpolatePath } from '#ir/path.ts';
import { key, track } from '#ir/clip.ts';
import { groupTracks, resolvePath, sampleShape, sampleNumeric, type TracksByProperty } from '#ir/sample.ts';
import type { Clip, EaseName, Machine, MachineTransition, Rig, RigPart, Vec2 } from '#ir/types.ts';
import { maskNeedsReversal, reverseContours, splitSubpaths, subpathToVertices, type VertexData } from '#export-rive/geometry.ts';
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
// A native scale constraint saturates the blended activation signal, preserving
// full contours throughout incompatible state crossfades (opacity cannot gate clips).
// The saturation threshold is a blend weight of 1e-12, far below one animation
// tick; the squared gain also stays within the native float matrix's finite range.
const MASK_ACTIVATION_GAIN = 1e12;

// `StateMachineComponent.name` (layers and inputs are both named this way).
const SM_NAME = KEYS.StateMachineComponent!.properties.name!.key;
const SM_NUMBER_VALUE = KEYS.StateMachineNumber!.properties.value!.key;
const SM_BOOL_VALUE = KEYS.StateMachineBool!.properties.value!.key;
const ANIMATION_ID = KEYS.AnimationState!.properties.animationId!.key;
const STATE_TO_ID = KEYS.StateTransition!.properties.stateToId!.key;
const TRANSITION_FLAGS = KEYS.StateTransition!.properties.flags!.key;
const TRANSITION_DURATION = KEYS.StateTransition!.properties.duration!.key;
const TRANSITION_EXIT_TIME = KEYS.StateTransition!.properties.exitTime!.key;
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

/** Builds one shared artboard with all supplied clips for this rig and the state
 * graph. Include every referenced clip; extra clips remain available for scrubbing. */
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

  // All supplied animations share one artboard. Compatible paths share vertices,
  // so native state transitions can interpolate eyes and pupils; incompatible
  // geometry (e.g. tears appearing) uses separate, opacity-keyed shapes.
  const referencedClipNames = clips.filter((clip) => clip.rig === rig.name).map((clip) => clip.name);
  for (const layer of Object.values(machine.layers)) {
    for (const state of Object.values(layer.states)) {
      if (state.clip && !referencedClipNames.includes(state.clip)) {
        throw new Error(`export-rive: machine references missing clip "${state.clip}"`);
      }
    }
  }
  // Overlay layers author only their own channels, preserving the expression below.
  const partialClipNames = new Set<string>();
  for (const layer of Object.values(machine.layers)) {
    const owned = Object.values(layer.states).flatMap((state) => state.clip ? [state.clip] : []);
    if (!owned.some((name) => clipsByName.get(name)?.tracks.some((tr) => tr.property === 'shape'))) {
      for (const name of owned) partialClipNames.add(name);
    }
  }
  const clipSources = new Set(rig.parts.flatMap((part) => part.clipTo ? [part.clipTo] : []));
  const maskNodeByPart = new Map<string, number>();
  for (const name of clipSources) {
    maskNodeByPart.set(name, add(NODE, [[PARENT_ID, 0], [NAME, `${name}-clip`]]));
  }
  const maskTransformCopies = new Map<string, number[]>();
  interface Geometry {
    mask: boolean;
    gateIndex?: number;
    reverseMask: boolean;
    path: string;
    shapeIndex: number;
    vertices: number[][];
    rest: VertexData[][];
  }
  const geometryByPart = new Map<string, Geometry[]>();
  for (const part of [...rig.parts].reverse()) {
    const paths = new Set<string>();
    if (part.path) paths.add(part.path);
    for (const name of referencedClipNames) {
      const shape = groupTracks(clipsByName.get(name)!).get(part.name)?.shape;
      for (const k of shape?.keys ?? []) {
        const path = resolvePath(rig, part, k.v);
        if (path) paths.add(path);
      }
    }
    const representatives: string[] = [];
    for (const path of paths) {
      if (!representatives.some((other) => interpolatePath(other, path, 0) !== null)) representatives.push(path);
    }
    const geometries: Geometry[] = [];
    if (clipSources.has(part.name) && representatives.length === 0) representatives.push('M0 0L0 0Z');
    for (const mask of clipSources.has(part.name) ? [false, true] : [false]) {
      for (const [g, path] of representatives.entries()) {
        const activeAtRest = part.path && interpolatePath(path, part.path, 0) !== null;
        let shapeParent = nodeIndexByPart.get(part.name)!;
        let gateIndex: number | undefined;
        if (mask) {
          // Gate in identity space BEFORE replaying the source ancestor transforms.
          // Clamping below the source would require inverting its world matrix,
          // which is singular for a fully closed eye (scaleY = 0).
          gateIndex = add(NODE, [
            [PARENT_ID, maskNodeByPart.get(part.name)!],
            [NODE_SCALE_X, activeAtRest ? MASK_ACTIVATION_GAIN : 0],
            [NODE_SCALE_Y, activeAtRest ? MASK_ACTIVATION_GAIN : 0],
          ]);
          add(KEYS.ScaleConstraint!.typeKey, [
            [PARENT_ID, gateIndex],
            [KEYS.TargetedConstraint!.properties.targetId!.key, 0xffffffff],
            [KEYS.TransformComponentConstraint!.properties.minMaxSpaceValue!.key, 1],
            [KEYS.TransformComponentConstraint!.properties.max!.key, 1],
            [KEYS.TransformComponentConstraint!.properties.maxValue!.key, 1],
            [KEYS.TransformComponentConstraintY!.properties.maxY!.key, 1],
            [KEYS.TransformComponentConstraintY!.properties.maxValueY!.key, 1],
          ]);
          const ancestors: RigPart[] = [];
          for (let source: RigPart | undefined = part; source; source = source.parent ? partByName.get(source.parent) : undefined) {
            ancestors.unshift(source);
          }
          shapeParent = gateIndex;
          for (const source of ancestors) {
            const parentPivot = source.parent ? partByName.get(source.parent)!.pivot : [0, 0];
            shapeParent = add(NODE, [
              [PARENT_ID, shapeParent],
              [NODE_X, source.pivot[0] - parentPivot[0]!],
              [NODE_Y, source.pivot[1] - parentPivot[1]!],
            ]);
            const copies = maskTransformCopies.get(source.name) ?? [];
            copies.push(shapeParent);
            maskTransformCopies.set(source.name, copies);
          }
        }
        const shapeIndex = add(SHAPE, [
          [PARENT_ID, shapeParent], [NODE_OPACITY, activeAtRest ? 1 : 0],
        ]);
        const vertices: number[][] = [];
        const original = splitSubpaths(path).map((sub) => subpathToVertices(sub, part.pivot));
        const reverseMask = mask && maskNeedsReversal(original);
        const rest = reverseMask ? reverseContours(original) : original;
        for (const [s, values] of rest.entries()) {
          const pathIndex = add(POINTS_PATH, [[PARENT_ID, shapeIndex], [NAME, `${part.name}-${g}-${s}`], [IS_CLOSED, 1]]);
          vertices.push(values.map((v) => add(CUBIC_DETACHED_VERTEX, [
            [PARENT_ID, pathIndex], [VERTEX_X, v.x], [VERTEX_Y, v.y],
            [IN_ROTATION, v.inRotation], [IN_DISTANCE, v.inDistance],
            [OUT_ROTATION, v.outRotation], [OUT_DISTANCE, v.outDistance],
          ])));
        }
        if (!mask) {
          const fill = add(FILL, [[PARENT_ID, shapeIndex]]);
          add(SOLID_COLOR, [[PARENT_ID, fill], [COLOR_VALUE, part.fill]]);
        }
        geometries.push({path, shapeIndex, vertices, rest, mask, reverseMask, ...(gateIndex === undefined ? {} : {gateIndex})});
      }
    }
    geometryByPart.set(part.name, geometries);
  }

  // Source subtrees contain only dedicated, fill-less mask Shapes. Attaching the
  // ClippingShape to the drawing Shape keeps a clipped part's children independent.
  for (const part of rig.parts) {
    if (!part.clipTo) continue;
    for (const geometry of geometryByPart.get(part.name) ?? []) {
      if (!geometry.mask) add(KEYS.ClippingShape!.typeKey, [
        [PARENT_ID, geometry.shapeIndex],
        [KEYS.ClippingShape!.properties.sourceId!.key, maskNodeByPart.get(part.clipTo)!],
        [KEYS.ClippingShape!.properties.fillRule!.key, 0],
        [KEYS.ClippingShape!.properties.isVisible!.key, 1],
      ]);
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
      const tracks: TracksByProperty = { ...byPart.get(part.name) };
      if (!partialClipNames.has(clipName)) {
        // Explicit neutral values release channels authored by the previous state.
        tracks.position ??= track(part.name, 'position', [key(0, [0, 0])]);
        tracks.rotation ??= track(part.name, 'rotation', [key(0, 0)]);
        tracks.scale ??= track(part.name, 'scale', [key(0, [1, 1])]);
      }
      const nodeIndex = nodeIndexByPart.get(part.name);
      if (nodeIndex === undefined) continue;
      const parentPart: RigPart | undefined = part.parent ? partByName.get(part.parent) : undefined;
      const parentPivot: Vec2 = parentPart ? parentPart.pivot : [0, 0];
      if (tracks.position || tracks.rotation || tracks.scale) {
        for (const transformIndex of [nodeIndex, ...(maskTransformCopies.get(part.name) ?? [])]) {
          w.object(KEYED_OBJECT, [[KEYED_OBJECT_ID, transformIndex]]);
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
      }
      if (!partialClipNames.has(clipName) || tracks.shape || tracks.opacity) {
        const changing = tracks.shape && new Set(tracks.shape.keys.map((k) => k.v)).size > 1;
        // Bake Cartesian path interpolation before converting handles to Rive's
        // polar representation. Four samples per output frame also cover rapid blinks.
        const times = changing
          ? [...new Set([0, clip.duration, ...tracks.shape!.keys.flatMap((k) => [k.t,
              Math.max(0,k.t-1/animFps),Math.min(clip.duration,k.t+1/animFps)]),
              ...Array.from({length: Math.ceil(clip.duration * clip.fps * 4) + 1},
                (_, f) => Math.min(clip.duration, f / (clip.fps * 4)))])].sort((a,b) => a-b)
          : [0];
        const shapes = times.map((t) => sampleShape(rig, part, tracks.shape, t));
        for (const geometry of geometryByPart.get(part.name) ?? []) {
          const samples = shapes.map((entries) => entries.find((entry) => interpolatePath(geometry.path, entry.d, 0) !== null));
          if (geometry.mask && partialClipNames.has(clipName) && !tracks.shape) continue;
          if (geometry.mask) {
            w.object(KEYED_OBJECT, [[KEYED_OBJECT_ID, geometry.gateIndex!]]);
            const activation = times.map((t, i) => ({frame:toFrame(t),
              value:samples[i] && samples[i]!.opacity > 0 ? MASK_ACTIVATION_GAIN : 0}));
            writeDoubleTrack(NODE_SCALE_X, activation);
            writeDoubleTrack(NODE_SCALE_Y, activation);
          } else {
            w.object(KEYED_OBJECT, [[KEYED_OBJECT_ID, geometry.shapeIndex]]);
            const opacity = tracks.opacity;
            if (!changing) {
              const weight = samples[0]?.opacity ?? 0;
              writeDoubleTrack(NODE_OPACITY, (opacity?.keys ?? [key(0, 1)]).map((k) => ({
                frame: toFrame(k.t), value: weight * k.v, ease: k.ease,
              })));
            } else {
              writeDoubleTrack(NODE_OPACITY, times.map((t,i) => ({
                frame: toFrame(t), value: (samples[i]?.opacity ?? 0) * (opacity ? sampleNumeric(opacity, t) : 1),
              })));
            }
          }
          // Keep full geometry even when inactive. The clamped activation scale
          // removes inactive masks without blending their vertices toward a point.
          const perTime = samples.map((sample) => {
            if (!sample) return geometry.rest;
            const vertices = splitSubpaths(sample.d).map((sub) => subpathToVertices(sub, part.pivot));
            // Keep the representative's direction throughout a morph so vertex
            // identities and their incoming/outgoing handles remain consistent.
            return geometry.reverseMask ? reverseContours(vertices) : vertices;
          });
          const properties: [number, keyof VertexData][] = [
            [VERTEX_X, 'x'], [VERTEX_Y, 'y'], [IN_ROTATION, 'inRotation'],
            [IN_DISTANCE, 'inDistance'], [OUT_ROTATION, 'outRotation'], [OUT_DISTANCE, 'outDistance'],
          ];
          for (const [s, ids] of geometry.vertices.entries()) {
            for (const [j, id] of ids.entries()) {
              w.object(KEYED_OBJECT, [[KEYED_OBJECT_ID, id]]);
              for (const [property, field] of properties) {
                let previous = geometry.rest[s]![j]![field];
                const values = times.map((t,i) => {
                  let value = perTime[i]![s]![j]![field];
                  if (field === 'inRotation' || field === 'outRotation') {
                    while (value - previous > Math.PI) value -= 2 * Math.PI;
                    while (value - previous < -Math.PI) value += 2 * Math.PI;
                  }
                  previous = value;
                  return {frame: toFrame(t), value};
                });
                writeDoubleTrack(property, values.filter((v,i) => i === 0 || i === values.length - 1
                  || v.value !== values[i-1]!.value || v.value !== values[i+1]!.value));
              }
            }
          }
        }
      }
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
  const writeTransition = (toName: string, duration: number, when: MachineTransition['when'] | undefined, stateIndex: Map<string, number>, exitAtEnd = false): void => {
    const stateToId = stateIndex.get(toName);
    if (stateToId === undefined) throw new Error(`export-rive: transition targets unknown state "${toName}"`);
    const properties: [number, number | string][] = [
      [STATE_TO_ID, stateToId],
      // state_transition_flags.hpp: early exit=32, enabled percentage exit=4|8.
      [TRANSITION_FLAGS, exitAtEnd ? 4 | 8 : 32],
      [TRANSITION_DURATION, Math.round(duration * 1000)],
    ];
    if (exitAtEnd) properties.push([TRANSITION_EXIT_TIME, 100]);
    w.object(STATE_TRANSITION, properties);
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
      // Release one-shot overlays; holding their last key would pin the face at
      // rest and suppress the expression's subsequent glances and breathing.
      if (state.clip && state.mode === 'once' && !clipsByName.get(state.clip)!.loop
        && layer.states[layer.entry]!.clip === null && !namedTransitionsByFrom.has(name)) {
        writeTransition(layer.entry, 0.12, undefined, stateIndex, true);
      }
    }
  }

  return w.toBytes();
}
