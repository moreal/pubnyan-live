/**
 * Binary writer for Rive's `.riv` runtime file format:
 * https://rive.app/docs/runtimes/advanced-topic/format
 *
 * A `.riv` file is:
 *   - header: fingerprint "RIVE", major version, minor version, file id (all varuint except the
 *     4-byte fingerprint)
 *   - a table of contents (ToC): every property key used anywhere in the file, each as a varuint,
 *     terminated by a 0; then a bitmap packing each ToC entry's backing type into 2 bits (4 per
 *     byte, one byte per `uint32` read — see `RuntimeHeader::read` in the runtime), so a reader
 *     that doesn't recognize a property key can still skip its value.
 *   - a flat stream of objects: each starts with its core type key (varuint), then repeats
 *     `propertyKey (varuint), value` until a propertyKey of 0 terminates the object. Hierarchy is
 *     expressed through a `parentId` property (the parent's index in this same flat stream, own
 *     artboard-relative — the artboard itself is implicitly index 0) rather than nesting.
 *
 * Every backing type here maps to one of 4 wire encodings (2 bits, matching the ToC bitmap):
 *   - uint:   varuint (also used for `bool` and `Id`/`parentId`-style references)
 *   - string: varuint byte length, then the raw UTF-8 bytes
 *   - double: 4-byte little-endian float32 (despite the JS-facing name; see `CoreDoubleType`)
 *   - color:  4-byte little-endian uint32, 0xAARRGGBB
 */
import { KEYS } from '#export-rive/keys.generated.ts';
import type { PropertyType } from '#export-rive/parse-header.ts';

export const RIVE_MAJOR_VERSION = 7;
export const RIVE_MINOR_VERSION = 0;

/** The 4 backing types the ToC's 2-bit bitmap can encode, in `RuntimeHeader::read`'s field-index order. */
const TOC_TYPE_ORDER: PropertyType[] = ['uint', 'string', 'double', 'color'];

/** propertyKey -> backing type, built once from every class's properties. Property keys are unique file-wide. */
const PROPERTY_TYPES: Map<number, PropertyType> = (() => {
  const map = new Map<number, PropertyType>();
  for (const { properties } of Object.values(KEYS)) {
    for (const { key, type } of Object.values(properties)) {
      const tocType = type === 'bool' ? 'uint' : type;
      const existing = map.get(key);
      if (existing !== undefined && existing !== tocType) {
        throw new Error(`property key ${key} used with conflicting backing types ${existing} and ${tocType}`);
      }
      map.set(key, tocType);
    }
  }
  return map;
})();

function propertyType(propertyKey: number): PropertyType {
  const type = PROPERTY_TYPES.get(propertyKey);
  if (type === undefined) throw new Error(`unknown property key ${propertyKey}: not in keys.generated.ts`);
  return type;
}

/** A single object property: `[propertyKey, value]`. `value`'s JS type must match the property's backing type
 * (`string` for string/color-as-hex, `number` for uint/double). Colors are `"#RRGGBB"` or `"#RRGGBBAA"`. */
export type ObjectProperty = [propertyKey: number, value: number | string];

export class RivWriter {
  private readonly chunks: Buffer[] = [];
  /** Property keys used by `object()`, in first-use order, for the ToC. */
  private readonly usedPropertyKeys: number[] = [];
  private readonly seenPropertyKeys = new Set<number>();

  /** Unsigned LEB128, the varint form used throughout the format. */
  varuint(value: number): Buffer {
    if (!Number.isInteger(value) || value < 0) throw new Error(`varuint expects a non-negative integer, got ${value}`);
    const bytes: number[] = [];
    let v = value;
    do {
      let byte = v & 0x7f;
      v = Math.floor(v / 128); // v >>> 7 breaks past 2^31; every value here fits in a double
      if (v !== 0) byte |= 0x80;
      bytes.push(byte);
    } while (v !== 0);
    return Buffer.from(bytes);
  }

  /** Length-prefixed UTF-8 string: `varuint(byteLength)` then the raw bytes. */
  string(value: string): Buffer {
    const body = Buffer.from(value, 'utf8');
    return Buffer.concat([this.varuint(body.length), body]);
  }

  /** 4-byte little-endian IEEE754 single precision float (Rive's "double" backing type, despite the name). */
  float32(value: number): Buffer {
    const buf = Buffer.alloc(4);
    buf.writeFloatLE(value, 0);
    return buf;
  }

  /** 4-byte little-endian `0xAARRGGBB`, from `"#RRGGBB"` or `"#RRGGBBAA"` (alpha defaults to opaque). */
  color(hex: string): Buffer {
    const m = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(hex);
    if (!m) throw new Error(`color expects "#RRGGBB" or "#RRGGBBAA", got ${hex}`);
    const rgb = Number.parseInt(m[1]!, 16);
    const a = m[2] !== undefined ? Number.parseInt(m[2], 16) : 0xff;
    const argb = ((a << 24) | rgb) >>> 0;
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(argb, 0);
    return buf;
  }

  private encodeValue(propertyKey: number, value: number | string): Buffer {
    const type = propertyType(propertyKey);
    switch (type) {
      case 'uint':
        if (typeof value !== 'number') throw new Error(`property ${propertyKey} is uint, got ${typeof value}`);
        return this.varuint(value);
      case 'double':
        if (typeof value !== 'number') throw new Error(`property ${propertyKey} is double, got ${typeof value}`);
        return this.float32(value);
      case 'string':
        if (typeof value !== 'string') throw new Error(`property ${propertyKey} is string, got ${typeof value}`);
        return this.string(value);
      case 'color':
        if (typeof value !== 'string') throw new Error(`property ${propertyKey} is color, got ${typeof value}`);
        return this.color(value);
      case 'bool':
        // Never reached: propertyType() folds bool into uint for the wire (see PROPERTY_TYPES above).
        throw new Error('unreachable');
    }
  }

  /** Appends one object to the file's flat object stream: `typeKey`, then each property, then a 0 terminator. */
  object(typeKey: number, properties: ObjectProperty[]): void {
    const parts: Buffer[] = [this.varuint(typeKey)];
    for (const [propertyKey, value] of properties) {
      if (!this.seenPropertyKeys.has(propertyKey)) {
        this.seenPropertyKeys.add(propertyKey);
        this.usedPropertyKeys.push(propertyKey);
      }
      parts.push(this.varuint(propertyKey), this.encodeValue(propertyKey, value));
    }
    parts.push(this.varuint(0));
    this.chunks.push(Buffer.concat(parts));
  }

  /** Assembles the header, ToC, and object stream into the final `.riv` bytes. */
  toBytes(fileId = 0): Buffer {
    const parts: Buffer[] = [
      Buffer.from('RIVE', 'ascii'),
      this.varuint(RIVE_MAJOR_VERSION),
      this.varuint(RIVE_MINOR_VERSION),
      this.varuint(fileId),
    ];
    for (const key of this.usedPropertyKeys) parts.push(this.varuint(key));
    parts.push(this.varuint(0));

    // 2-bit backing-type bitmap: `RuntimeHeader::read` refills a uint32 (4 bytes) every 4 entries
    // but only ever uses its lowest byte (bits 0..6 in steps of 2), so only the low byte of each
    // 4-byte read carries data; the rest is padding.
    for (let i = 0; i < this.usedPropertyKeys.length; i += 4) {
      let byte = 0;
      for (let j = 0; j < 4 && i + j < this.usedPropertyKeys.length; j++) {
        const type = propertyType(this.usedPropertyKeys[i + j]!);
        const bits = TOC_TYPE_ORDER.indexOf(type);
        byte |= bits << (j * 2);
      }
      const word = Buffer.alloc(4);
      word.writeUInt8(byte, 0);
      parts.push(word);
    }

    // A combined artboard can exceed the engine's function-argument limit.
    return Buffer.concat(parts.concat(this.chunks));
  }
}
