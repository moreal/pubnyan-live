import { describe, expect, test } from 'vitest';
import { KEYS } from '#export-rive/keys.generated.ts';
import { RIVE_MAJOR_VERSION, RIVE_MINOR_VERSION, RivWriter } from '#export-rive/writer.ts';

describe('RivWriter primitives', () => {
  test('varuint encodes LEB128', () => {
    expect([...new RivWriter().varuint(0)]).toEqual([0x00]);
    expect([...new RivWriter().varuint(127)]).toEqual([0x7f]);
    expect([...new RivWriter().varuint(128)]).toEqual([0x80, 0x01]);
    expect([...new RivWriter().varuint(300)]).toEqual([0xac, 0x02]);
  });

  test('string is a varuint byte length then UTF-8 bytes', () => {
    expect([...new RivWriter().string('AB')]).toEqual([0x02, 0x41, 0x42]);
    expect([...new RivWriter().string('')]).toEqual([0x00]);
  });

  test('float32 is 4-byte little-endian IEEE754', () => {
    const buf = new RivWriter().float32(1);
    expect(buf.length).toBe(4);
    expect(buf.readFloatLE(0)).toBeCloseTo(1);
    expect(new RivWriter().float32(0.5).readFloatLE(0)).toBeCloseTo(0.5);
  });

  test('color is 4-byte little-endian 0xAARRGGBB, alpha defaults to opaque', () => {
    const buf = new RivWriter().color('#112233');
    expect(buf.readUInt32LE(0)).toBe(0xff112233);
    expect(new RivWriter().color('#11223344').readUInt32LE(0)).toBe(0x44112233);
  });

  test('color rejects malformed hex', () => {
    expect(() => new RivWriter().color('red')).toThrow();
  });
});

describe('RivWriter.object', () => {
  test('encodes typeKey, propertyKey/value pairs by the property\'s backing type, then a 0 terminator', () => {
    const w = new RivWriter();
    const nameKey = KEYS.Component!.properties.name!.key;
    w.object(KEYS.Artboard!.typeKey, [[nameKey, 'board']]);
    const bytes = w.toBytes();
    // Skip header + ToC to the object stream: typeKey, propKey, string("board"), terminator.
    const objectStream = bytes.subarray(bytes.length - (1 + 1 + 1 + 5 + 1));
    expect([...objectStream]).toEqual([KEYS.Artboard!.typeKey, nameKey, 5, ...Buffer.from('board'), 0]);
  });

  test('rejects a property key not in keys.generated.ts', () => {
    expect(() => new RivWriter().object(1, [[999_999, 0]])).toThrow(/unknown property key/);
  });
});

describe('RivWriter.toBytes header', () => {
  test('starts with the RIVE fingerprint, major/minor version, and file id', () => {
    const bytes = new RivWriter().toBytes(0);
    expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIVE');
    expect(bytes[4]).toBe(RIVE_MAJOR_VERSION);
    expect(bytes[5]).toBe(RIVE_MINOR_VERSION);
    expect(bytes[6]).toBe(0); // fileId varuint
    expect(bytes[7]).toBe(0); // empty property ToC, terminated immediately
  });

  test('the ToC lists each used property key once, then a 2-bit backing-type bitmap packed into whole uint32s', () => {
    const w = new RivWriter();
    w.object(KEYS.Artboard!.typeKey, [
      [KEYS.Component!.properties.name!.key, 'a'], // string -> bit pattern 1
      [KEYS.LayoutComponent!.properties.width!.key, 1], // double -> bit pattern 2
    ]);
    const bytes = w.toBytes(0);
    let i = 7; // past fingerprint(4) + major(1) + minor(1) + fileId(1)
    const nameKey = bytes[i++]!;
    const widthKey = bytes[i++]!;
    expect(nameKey).toBe(KEYS.Component!.properties.name!.key);
    expect(widthKey).toBe(KEYS.LayoutComponent!.properties.width!.key);
    expect(bytes[i++]).toBe(0); // ToC terminator
    // Bitmap: one uint32 (4 bytes) covering up to 4 property slots, low byte only.
    const bitmapByte = bytes[i]!;
    expect(bitmapByte & 0b11).toBe(1); // string
    expect((bitmapByte >> 2) & 0b11).toBe(2); // double
    expect(bytes.subarray(i, i + 4).length).toBe(4);
  });
});
