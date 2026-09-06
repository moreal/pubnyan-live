import { afterAll, beforeAll, expect, test } from 'vitest';
import { exportRiveSpike } from '#export-rive/index.ts';
import { checkRiveFile } from '#export-rive/rive-check.ts';
import { Renderer } from '#render/renderer.ts';

let renderer: Renderer;
beforeAll(async () => {
  renderer = await Renderer.launch();
});
afterAll(async () => {
  await renderer.close();
});

test('the spike .riv bytes load with @rive-app/canvas and report the artboard', async () => {
  const bytes = exportRiveSpike({ artboardName: 'pubnyan-spike', width: 100, height: 100, fill: '#ff8800' });
  const result = await checkRiveFile(renderer, bytes);
  expect(result.artboardNames).toEqual(['pubnyan-spike']);
});
