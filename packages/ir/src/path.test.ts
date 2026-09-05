import { expect, test } from 'vitest';
import { interpolatePath, parsePath, serializePath } from '#ir/path.ts';

test('parses implicit repeated commands the way svgpath prints them', () => {
  expect(parsePath('M1 2L3 4 5 6C1 1 2 2 3 3 4 4 5 5 6 6Z')).toEqual([
    ['M', 1, 2], ['L', 3, 4], ['L', 5, 6], ['C', 1, 1, 2, 2, 3, 3], ['C', 4, 4, 5, 5, 6, 6], ['Z'],
  ]);
});

test('parses the attached-negative form svgpath prints', () => {
  expect(parsePath('M-10 0L0 0 0 10-10 10Z')).toEqual([['M', -10, 0], ['L', 0, 0], ['L', 0, 10], ['L', -10, 10], ['Z']]);
});

test('serializes with trimmed decimals', () => {
  expect(serializePath([['M', 1.005, 2], ['L', 3.5, -4.123456], ['Z']])).toBe('M1 2L3.5 -4.12Z');
});

test('rejects relative and unsupported commands', () => {
  expect(() => parsePath('m1 2')).toThrow(/absolute/);
  expect(() => parsePath('M1 2A1 1 0 0 0 3 4')).toThrow(/unsupported/);
});

test('interpolates compatible paths and returns null otherwise', () => {
  expect(interpolatePath('M0 0L10 0Z', 'M0 0L20 10Z', 0.5)).toBe('M0 0L15 5Z');
  expect(interpolatePath('M0 0L10 0Z', 'M0 0C1 1 2 2 3 3Z', 0.5)).toBeNull();
});
