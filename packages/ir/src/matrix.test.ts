import { expect, test } from 'vitest';
import { apply, localMatrix, multiply, rotate, translate } from '#ir/matrix.ts';

test('multiply applies the right operand first', () => {
  const m = multiply(translate(10, 0), rotate(90));
  const [x, y] = apply(m, [1, 0]);
  expect(x).toBeCloseTo(10, 6);
  expect(y).toBeCloseTo(1, 6);
});

test('localMatrix rotates and scales about the pivot, then translates', () => {
  const m = localMatrix([5, 5], [1, 2], 90, [2, 2]);
  const [x, y] = apply(m, [6, 5]); // one unit right of pivot -> scaled to 2, rotated to +y, moved by (1,2)
  expect(x).toBeCloseTo(6, 6);
  expect(y).toBeCloseTo(9, 6);
});
