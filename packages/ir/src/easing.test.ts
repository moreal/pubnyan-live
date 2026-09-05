import { describe, expect, test } from 'vitest';
import { EASES, EASE_NAMES, easeValue } from '#ir/easing.ts';

describe('easeValue', () => {
  test('every ease maps 0 to 0 and 1 to 1', () => {
    for (const name of EASE_NAMES) {
      expect(easeValue(name, 0)).toBe(0);
      expect(easeValue(name, 1)).toBe(1);
    }
  });

  test('linear is identity', () => {
    expect(easeValue('linear', 0.3)).toBeCloseTo(0.3, 6);
  });

  test('symmetric eases pass through the midpoint', () => {
    expect(easeValue('easeInOut', 0.5)).toBeCloseTo(0.5, 4);
    expect(easeValue('inOutSine', 0.5)).toBeCloseTo(0.5, 4);
  });

  test('easeOut is ahead of linear, easeIn behind', () => {
    expect(easeValue('easeOut', 0.5)).toBeGreaterThan(0.5);
    expect(easeValue('easeIn', 0.5)).toBeLessThan(0.5);
  });

  test('outBack overshoots', () => {
    const peak = Math.max(...Array.from({ length: 101 }, (_, i) => easeValue('outBack', i / 100)));
    expect(peak).toBeGreaterThan(1.05);
  });

  test('table matches CSS cubic-bezier form', () => {
    expect(EASES.easeInOut).toEqual([0.42, 0, 0.58, 1]);
  });
});
