import { describe, expect, test } from 'vitest';
import { clip, key, track } from '#ir/clip.ts';
import type { Rig } from '#ir/types.ts';
import { exportRive } from '#export-rive/index.ts';
import { KEYS } from '#export-rive/keys.generated.ts';

const rig: Rig = {
  name: 'r',
  artboard: { width: 100, height: 100 },
  parts: [
    { name: 'a', fill: '#ff0000', pivot: [5, 5], path: 'M0 0C2 0 5 0 5 0C5 5 5 5 5 5C2 5 0 5 0 0Z' },
    { name: 'b', fill: '#00ff00', pivot: [2, 2], parent: 'a', path: 'M0 0C1 0 2 0 2 0C2 1 2 2 2 2C1 2 0 2 0 0Z' },
    { name: 'ghost', fill: '#0000ff', pivot: [0, 0], parent: 'a', path: null },
  ],
  expressions: { normal: {} },
};

type DecodedObject = { typeKey: number; properties: Map<number, number | string> };

/** Minimal `.riv` reader: everything `writer.ts` needs to encode, in reverse, self-contained (it
 * infers each property's backing type from the ToC bitmap rather than importing `keys.generated.ts`,
 * so this proves the bytes on the wire rather than re-checking the writer's internal property map). */
function decode(bytes: Buffer): DecodedObject[] {
  let i = 4; // "RIVE"
  i += 1; // major
  i += 1; // minor
  const readVaruint = (): number => {
    let result = 0;
    let shift = 0;
    for (;;) {
      const byte = bytes[i++]!;
      result += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) return result;
      shift += 7;
    }
  };
  readVaruint(); // fileId
  const propKeys: number[] = [];
  for (;;) {
    const k = readVaruint();
    if (k === 0) break;
    propKeys.push(k);
  }
  const TOC_TYPE_ORDER = ['uint', 'string', 'double', 'color'] as const;
  const typeByKey = new Map<number, (typeof TOC_TYPE_ORDER)[number]>();
  for (let b = 0; b < propKeys.length; b += 4) {
    const byte = bytes[i]!;
    i += 4; // one uint32 per group of up to 4 keys; only its low byte carries data (see writer.ts)
    for (let j = 0; j < 4 && b + j < propKeys.length; j++) typeByKey.set(propKeys[b + j]!, TOC_TYPE_ORDER[(byte >> (j * 2)) & 0b11]!);
  }
  const objects: DecodedObject[] = [];
  while (i < bytes.length) {
    const typeKey = readVaruint();
    const properties = new Map<number, number | string>();
    for (;;) {
      const propKey = readVaruint();
      if (propKey === 0) break;
      const type = typeByKey.get(propKey)!;
      if (type === 'uint') properties.set(propKey, readVaruint());
      else if (type === 'double') {
        properties.set(propKey, bytes.readFloatLE(i));
        i += 4;
      } else if (type === 'color') {
        properties.set(propKey, `#${bytes.readUInt32LE(i).toString(16).padStart(8, '0')}`);
        i += 4;
      } else {
        const len = readVaruint();
        properties.set(propKey, bytes.subarray(i, i + len).toString('utf8'));
        i += len;
      }
    }
    objects.push({ typeKey, properties });
  }
  return objects;
}

const NAME = KEYS.Component!.properties.name!.key;
const PARENT_ID = KEYS.Component!.properties.parentId!.key;
const NODE_X = KEYS.Node!.properties.x!.key;
const NODE_Y = KEYS.Node!.properties.y!.key;
const COLOR_VALUE = KEYS.SolidColor!.properties.colorValue!.key;

describe('exportRive', () => {
  test('every visible part becomes Node -> Shape -> (PointsPath, Fill -> SolidColor), parented through parentId', () => {
    const objects = decode(exportRive(rig, clip('c', { rig: 'r', duration: 1 }, [])));
    const byName = new Map(objects.filter((o) => o.properties.has(NAME)).map((o) => [o.properties.get(NAME) as string, o]));
    // `parentId` values are relative to the Artboard object (index 0 in its own object list, see
    // `index.ts`'s doc comment), not to this decoder's flat array which also has the Backboard.
    const artboardOffset = objects.findIndex((o) => o.typeKey === KEYS.Artboard!.typeKey);
    const indexOf = (o: DecodedObject) => objects.indexOf(o) - artboardOffset;

    const nodeA = byName.get('a')!;
    const nodeB = byName.get('b')!;
    const nodeGhost = byName.get('ghost')!;
    expect(nodeA.typeKey).toBe(KEYS.Node!.typeKey);
    expect(nodeB.typeKey).toBe(KEYS.Node!.typeKey);
    // Root part "a": Node x/y = its own pivot (no parent, artboard origin is (0, 0)).
    expect(nodeA.properties.get(NODE_X)).toBeCloseTo(5);
    expect(nodeA.properties.get(NODE_Y)).toBeCloseTo(5);
    // Child part "b": Node x/y = the delta from its rig parent's pivot, not its own absolute pivot.
    expect(nodeB.properties.get(PARENT_ID)).toBe(indexOf(nodeA));
    expect(nodeB.properties.get(NODE_X)).toBeCloseTo(2 - 5);
    expect(nodeB.properties.get(NODE_Y)).toBeCloseTo(2 - 5);
    expect(nodeGhost.properties.get(PARENT_ID)).toBe(indexOf(nodeA));

    const shapeA = objects.find((o) => o.typeKey === KEYS.Shape!.typeKey && o.properties.get(PARENT_ID) === indexOf(nodeA))!;
    expect(shapeA).toBeDefined();
    // "ghost" has no rest path: no Shape/Path/Fill under its Node, just the Node itself for hierarchy.
    expect(objects.some((o) => o.typeKey === KEYS.Shape!.typeKey && o.properties.get(PARENT_ID) === indexOf(nodeGhost))).toBe(false);

    const pathA = objects.find((o) => o.typeKey === KEYS.PointsPath!.typeKey && o.properties.get(PARENT_ID) === indexOf(shapeA))!;
    expect(pathA).toBeDefined();
    const verticesA = objects.filter((o) => o.typeKey === KEYS.CubicDetachedVertex!.typeKey && o.properties.get(PARENT_ID) === indexOf(pathA));
    // "a"'s path is 3 cubics closing back to the start: 3 vertices, not 4.
    expect(verticesA).toHaveLength(3);

    const fillA = objects.find((o) => o.typeKey === KEYS.Fill!.typeKey && o.properties.get(PARENT_ID) === indexOf(shapeA))!;
    expect(fillA).toBeDefined();
    const solidA = objects.find((o) => o.typeKey === KEYS.SolidColor!.typeKey && o.properties.get(PARENT_ID) === indexOf(fillA))!;
    expect(solidA.properties.get(COLOR_VALUE)).toBe('#ffff0000');
  });

  test('rejects a part whose declared parent is not in the rig', () => {
    const badRig: Rig = { ...rig, parts: [{ name: 'x', fill: '#000000', pivot: [0, 0], parent: 'missing', path: null }] };
    expect(() => exportRive(badRig, clip('c', { rig: 'r', duration: 1 }, []))).toThrow(/unknown parent/);
  });
});
