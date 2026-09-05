import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { parseBaseHeader } from '#export-rive/parse-header.ts';

const sample = readFileSync(fileURLToPath(new URL('./fixtures/sample_base.hpp', import.meta.url)), 'utf8');

describe('parseBaseHeader', () => {
  test('reads the typeKey and strips Base from the class name', () => {
    const classes = parseBaseHeader(sample);
    expect(Object.keys(classes)).toEqual(['Sample']);
    expect(classes.Sample.typeKey).toBe(999);
  });

  test('infers backing types from the deserialize() Core*Type calls', () => {
    const { properties } = parseBaseHeader(sample).Sample;
    expect(properties.width).toEqual({ key: 100, type: 'double' });
    expect(properties.isVisible).toEqual({ key: 101, type: 'bool' });
    expect(properties.label).toEqual({ key: 102, type: 'string' });
    expect(properties.count).toEqual({ key: 104, type: 'uint' });
  });

  test('colorValue is a color even though its C++ field is declared int, per the CoreColorType deserializer', () => {
    const { properties } = parseBaseHeader(sample).Sample;
    expect(properties.colorValue).toEqual({ key: 103, type: 'color' });
  });

  test('falls back to the field type when deserialize() has no case for the property', () => {
    const { properties } = parseBaseHeader(sample).Sample;
    expect(properties.tint).toEqual({ key: 105, type: 'color' });
  });

  test('parses every class in a multi-class file', () => {
    const source = `
      class FooBase : public Component {
        public:
          static const uint16_t typeKey = 1;
          static const uint16_t xPropertyKey = 5;
        protected:
          float m_X = 0.0f;
      };
      class BarBase : public Component {
        public:
          static const uint16_t typeKey = 2;
          static const uint16_t namePropertyKey = 6;
        protected:
          std::string m_Name = "";
      };
    `;
    const classes = parseBaseHeader(source);
    expect(classes.Foo).toEqual({ typeKey: 1, properties: { x: { key: 5, type: 'double' } } });
    expect(classes.Bar).toEqual({ typeKey: 2, properties: { name: { key: 6, type: 'string' } } });
  });
});
