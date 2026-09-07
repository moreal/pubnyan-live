export type Vec2 = [number, number];
/** SVG-style affine matrix [a, b, c, d, e, f]: x' = a*x + c*y + e, y' = b*x + d*y + f. */
export type Matrix = [number, number, number, number, number, number];

export interface RigPart {
  name: string;
  fill: string;
  /** Rotation and scale centre, in artboard coordinates. */
  pivot: Vec2;
  /** Transforms of the parent apply to this part. Parent must be declared earlier in `parts`. */
  parent?: string;
  /** Default absolute path data (M/L/C/Z). null = hidden unless an expression supplies a path. */
  path: string | null;
}

export interface Rig {
  name: string;
  artboard: { width: number; height: number };
  /** Licence and credit for the artwork the rig was traced from. */
  attribution?: string;
  /** Draw order, bottom first. */
  parts: RigPart[];
  /** expression name -> part name -> path data (null = hidden in this expression). Missing part = default path. */
  expressions: Record<string, Record<string, string | null>>;
}

export type EaseName =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'inOutSine'
  | 'outQuint'
  | 'outBack'
  | 'outCubic'
  | 'inOutCubic'
  | 'inOutQuad'
  | 'inBack'
  | 'inOutBack'
  | 'outSine';
export type Property = 'position' | 'rotation' | 'scale' | 'opacity' | 'shape';
export type TrackValue<P extends Property> = P extends 'position' | 'scale' ? Vec2 : P extends 'shape' ? string : number;

export interface Key<V> {
  /** seconds */
  t: number;
  v: V;
  /** Easing of the segment that ENDS at this key (from the previous key). Linear when omitted. */
  ease?: EaseName;
}

export interface Track<P extends Property = Property> {
  part: string;
  property: P;
  keys: Key<TrackValue<P>>[];
}

export interface Clip {
  name: string;
  rig: string;
  /** seconds */
  duration: number;
  fps: number;
  loop: boolean;
  tracks: Track[];
}

export type MachineInput =
  | { type: 'enum'; values: string[]; default: string }
  | { type: 'trigger' }
  | { type: 'bool'; default: boolean };

export interface MachineState {
  /** Clip to play, or null for an empty state. */
  clip: string | null;
  mode: 'loop' | 'once';
}

export interface MachineTransition {
  from: string | '*';
  to: string;
  when: { input: string; equals: string | boolean } | { input: string; fired: true };
  /** crossfade seconds */
  duration: number;
}

export interface MachineLayer {
  entry: string;
  states: Record<string, MachineState>;
  transitions: MachineTransition[];
}

export interface Machine {
  rig: string;
  inputs: Record<string, MachineInput>;
  layers: Record<string, MachineLayer>;
}
