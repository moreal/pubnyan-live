/**
 * Parser for `include/rive/generated/**​/*_base.hpp` headers from
 * https://github.com/rive-app/rive-runtime — see
 * `packages/export-rive/scripts/generate-keys.ts` for the pinned commit and
 * the sparse-checkout that feeds this parser.
 */

/** Rive's on-disk property backing types (`CoreFieldType` in the runtime). */
export type PropertyType = 'double' | 'uint' | 'string' | 'bool' | 'color';

export interface PropertyEntry {
  key: number;
  type: PropertyType;
}

export interface ClassKeys {
  typeKey: number;
  properties: Record<string, PropertyEntry>;
}

/** `Core<Name>Type::deserialize` / `::runtimeDeserialize` -> backing type. */
const DESERIALIZER_TYPE: Record<string, PropertyType> = {
  Double: 'double',
  Uint: 'uint',
  String: 'string',
  Bool: 'bool',
  Color: 'color',
};

/**
 * Fallback when a property has no `deserialize()` case to read the
 * `Core<Name>Type` call from (e.g. it's computed-only in this sample): infer
 * the backing type straight from the C++ field's declared type.
 */
const FIELD_TYPE: Record<string, PropertyType> = {
  float: 'double',
  uint32_t: 'uint',
  int: 'uint',
  bool: 'bool',
  'std::string': 'string',
  ColorInt: 'color',
};

/** Finds the `{ ... }` body starting at the `{` right after `match`, balancing braces. */
function extractBraceBody(source: string, openBraceIndex: number): string {
  let depth = 0;
  for (let i = openBraceIndex; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(openBraceIndex + 1, i);
    }
  }
  throw new Error('unbalanced braces');
}

function findDeserializeBody(classBody: string): string | undefined {
  const m = classBody.match(/deserialize\(uint16_t propertyKey, BinaryReader& reader\) override\s*(\{)/);
  if (!m || m.index === undefined) return undefined;
  const openBraceIndex = m.index + m[0].length - 1;
  return extractBraceBody(classBody, openBraceIndex);
}

/** propName -> backing type, read from `case <propName>PropertyKey: ... Core<X>Type::(deserialize|runtimeDeserialize)`. */
function parseDeserializerTypes(deserializeBody: string): Map<string, PropertyType> {
  const types = new Map<string, PropertyType>();
  const caseRe = /case\s+(\w+)PropertyKey:/g;
  const cases: { name: string; start: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = caseRe.exec(deserializeBody))) {
    cases.push({ name: m[1], start: m.index + m[0].length });
  }
  for (let i = 0; i < cases.length; i++) {
    const end = i + 1 < cases.length ? cases[i + 1].start : deserializeBody.length;
    const block = deserializeBody.slice(cases[i].start, end);
    const typeMatch = block.match(/Core(\w+)Type::(?:deserialize|runtimeDeserialize)/);
    if (typeMatch) {
      const backing = DESERIALIZER_TYPE[typeMatch[1]];
      if (backing) types.set(cases[i].name, backing);
    }
  }
  return types;
}

/** propName -> backing type, read from `<fieldType> m_<PropName> = ...;` field declarations. */
function parseFieldTypes(classBody: string): Map<string, PropertyType> {
  const types = new Map<string, PropertyType>();
  const fieldRe = /^\s*(float|uint32_t|int|bool|std::string|ColorInt)\s+m_(\w+)/gm;
  let m: RegExpExecArray | null;
  while ((m = fieldRe.exec(classBody))) {
    const [, fieldType, fieldName] = m;
    const propName = fieldName.charAt(0).toLowerCase() + fieldName.slice(1);
    const backing = FIELD_TYPE[fieldType];
    if (backing) types.set(propName, backing);
  }
  return types;
}

/**
 * Parses a `*_base.hpp` header into `{ [ClassName]: { typeKey, properties } }`,
 * one entry per `class <ClassName>Base` found in the file (`Base` is stripped
 * to match the concrete runtime class name).
 */
export function parseBaseHeader(source: string): Record<string, ClassKeys> {
  const out: Record<string, ClassKeys> = {};
  const classRe = /class\s+(\w+)Base\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = classRe.exec(source))) {
    const className = m[1];
    const openBraceIndex = source.indexOf('{', m.index);
    const classBody = extractBraceBody(source, openBraceIndex);

    const typeKeyMatch = classBody.match(/static const uint16_t typeKey = (\d+);/);
    if (!typeKeyMatch) continue;
    const typeKey = Number(typeKeyMatch[1]);

    const deserializeBody = findDeserializeBody(classBody);
    const deserializerTypes = deserializeBody ? parseDeserializerTypes(deserializeBody) : new Map();
    const fieldTypes = parseFieldTypes(classBody);

    const properties: Record<string, PropertyEntry> = {};
    const propRe = /static const uint16_t (\w+)PropertyKey = (\d+);/g;
    let p: RegExpExecArray | null;
    while ((p = propRe.exec(classBody))) {
      const [, propName, keyStr] = p;
      const type = deserializerTypes.get(propName) ?? fieldTypes.get(propName);
      if (!type) continue;
      properties[propName] = { key: Number(keyStr), type };
    }

    out[className] = { typeKey, properties };
  }
  return out;
}
