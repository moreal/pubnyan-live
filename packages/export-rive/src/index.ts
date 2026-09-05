/**
 * Spike for the `.riv` writer core (see `#export-rive/writer.ts`): a hand-built file with one
 * Backboard, one Artboard, and one Shape containing a Rectangle and a Fill with a SolidColor.
 * Not driven by a rig or clip yet — that's the next backlog item ("rig shapes").
 */
import { KEYS } from '#export-rive/keys.generated.ts';
import { RivWriter } from '#export-rive/writer.ts';

const { typeKey: BACKBOARD } = KEYS.Backboard!;
const { typeKey: ARTBOARD } = KEYS.Artboard!;
const { typeKey: SHAPE } = KEYS.Shape!;
const { typeKey: RECTANGLE } = KEYS.Rectangle!;
const { typeKey: FILL } = KEYS.Fill!;
const { typeKey: SOLID_COLOR } = KEYS.SolidColor!;

const NAME = KEYS.Component!.properties.name!.key;
const PARENT_ID = KEYS.Component!.properties.parentId!.key;
const WIDTH = KEYS.LayoutComponent!.properties.width!.key;
const HEIGHT = KEYS.LayoutComponent!.properties.height!.key;
const PATH_WIDTH = KEYS.ParametricPath!.properties.width!.key;
const PATH_HEIGHT = KEYS.ParametricPath!.properties.height!.key;
const COLOR_VALUE = KEYS.SolidColor!.properties.colorValue!.key;

export interface RiveSpike {
  artboardName: string;
  width: number;
  height: number;
  fill: string;
}

/**
 * Builds the spike `.riv` bytes: Backboard, Artboard(width, height, name), Shape > Rectangle,
 * Shape > Fill > SolidColor. Object indices below are the artboard-relative indices `parentId`
 * references (the artboard is implicitly index 0 in its own object list).
 */
export function exportRiveSpike(spike: RiveSpike): Buffer {
  const w = new RivWriter();

  w.object(BACKBOARD, []);
  w.object(ARTBOARD, [
    [NAME, spike.artboardName],
    [WIDTH, spike.width],
    [HEIGHT, spike.height],
  ]);
  const artboard = 0;
  const shape = 1;
  w.object(SHAPE, [[PARENT_ID, artboard]]);
  w.object(RECTANGLE, [
    [PARENT_ID, shape],
    [PATH_WIDTH, spike.width],
    [PATH_HEIGHT, spike.height],
  ]);
  const fill = 3;
  w.object(FILL, [[PARENT_ID, shape]]);
  w.object(SOLID_COLOR, [
    [PARENT_ID, fill],
    [COLOR_VALUE, spike.fill],
  ]);

  return w.toBytes();
}
