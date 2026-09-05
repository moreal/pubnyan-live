import { PNG } from 'pngjs';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { Renderer } from '#verify/renderer.ts';

let renderer: Renderer;
beforeAll(async () => {
  renderer = await Renderer.launch();
});
afterAll(async () => {
  await renderer.close();
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
<style>#r { animation: move 1s linear infinite; } @keyframes move { 0% { transform: translate(0px, 0px); } 100% { transform: translate(10px, 0px); } }</style>
<rect id="r" x="0" y="0" width="10" height="20" fill="#000"/></svg>`;

const pixel = (png: PNG, x: number, y: number) => png.data[(y * png.width + x) * 4];

test('renders white background, pauses animations at the requested time', async () => {
  const at0 = PNG.sync.read(await renderer.renderSvg(svg, 20, 20, 0));
  const at500 = PNG.sync.read(await renderer.renderSvg(svg, 20, 20, 500));
  expect(at0.width).toBe(20);
  expect(pixel(at0, 2, 10)).toBeLessThan(50); // black rect
  expect(pixel(at0, 15, 10)).toBe(255); // white background, not the host's dark scheme
  expect(pixel(at500, 2, 10)).toBe(255); // rect moved right by 5px
  expect(pixel(at500, 12, 10)).toBeLessThan(50);
});
