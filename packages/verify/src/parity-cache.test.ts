import { PNG } from 'pngjs';
import { expect, test, vi } from 'vitest';
import { clip } from '#ir/clip.ts';
import type { Rig } from '#ir/types.ts';
import type { Renderer } from '#render/renderer.ts';
import { checkParity, type Target } from '#verify/parity.ts';

const rig: Rig = { name: 'fixture', artboard: { width: 4, height: 4 }, parts: [], expressions: {} };
const animation = clip('cached-reference', { rig: rig.name, duration: 1 }, []);
const times = [0, 0.5, 1];
function png(value: number): Buffer {
  const frame = new PNG({ width: 4, height: 4 });
  for (let i = 0; i < frame.data.length; i += 4) {
    frame.data[i] = frame.data[i + 1] = frame.data[i + 2] = value;
    frame.data[i + 3] = 255;
  }
  return PNG.sync.write(frame);
}
const white = png(255), black = png(0);
function fixture() {
  const renderSvg = vi.fn(async () => white);
  const renderer = { renderSvg } as unknown as Renderer;
  const target: Target = {
    name: 'fixture',
    export: async () => [],
    renderFrame: vi.fn(async (_renderer, _rig, _clip, t) => t === 0 ? white : black),
  };
  return { renderer, renderSvg, target };
}

test('reuses exactly one reference render per sample across targets', async () => {
  const { renderer, renderSvg, target } = fixture();
  const first = await checkParity(renderer, rig, animation, target, times);
  expect(renderSvg).toHaveBeenCalledTimes(times.length);
  const second = await checkParity(renderer, rig, animation, { ...target, name: 'second' }, times, first.referenceFrames);
  const third = await checkParity(renderer, rig, animation, { ...target, name: 'third' }, times, first.referenceFrames);
  expect(renderSvg).toHaveBeenCalledTimes(times.length);
  expect(target.renderFrame).toHaveBeenCalledTimes(times.length * 3);
  expect(second).toEqual({ ...first, target: 'second' });
  expect(third).toEqual({ ...first, target: 'third' });
  expect(first.pass).toBe(false);
  expect(first.worst.t).toBe(0.5); // Equal later differences retain the first worst sample.
  expect(first.worst.ratio).toBe(1);
});

test.each(['some', 'all'] as const)('cached references preserve results when %s samples are skipped', async (scope) => {
  const { renderer, renderSvg, target } = fixture();
  target.supportsTime = (_clip, t) => scope === 'some' && t === 0;
  const original = await checkParity(renderer, rig, animation, target, times);
  renderSvg.mockClear();
  const cached = await checkParity(renderer, rig, animation, target, times, Object.freeze([...original.referenceFrames]));
  expect(cached).toEqual(original);
  expect(renderSvg).not.toHaveBeenCalled();
  expect(cached.skipped).toEqual(scope === 'some' ? [0.5, 1] : times);
  expect(cached.pass).toBe(scope === 'some');
  expect(cached.worst.t).toBe(0);
  expect(cached.worst.ratio).toBe(0);
});

test.each([0, 2, 4])('rejects %s cached frames for three times before rendering', async (count) => {
  const { renderer, renderSvg, target } = fixture();
  await expect(checkParity(renderer, rig, animation, target, times, Array.from({ length: count }, () => white)))
    .rejects.toThrow(/reference frame count.*sample time count/);
  expect(renderSvg).not.toHaveBeenCalled();
  expect(target.renderFrame).not.toHaveBeenCalled();
});

test('empty supplied references preserve the empty-sample result', async () => {
  const { renderer, renderSvg, target } = fixture();
  const original = await checkParity(renderer, rig, animation, target, []);
  expect(await checkParity(renderer, rig, animation, target, [], [])).toEqual(original);
  expect(original.pass).toBe(true);
  expect(renderSvg).not.toHaveBeenCalled();
  expect(target.renderFrame).not.toHaveBeenCalled();
});
