import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { getRig } from './index.ts';
import { readSourceSvg } from '#rig-extract/svg-source.ts';
import { selectPath } from '#rig-extract/parts-map.ts';
import { Renderer } from '#render/renderer.ts';

// Splitting the black source into joints must not redraw the mascot at rest.
test('articulated silhouette preserves the original outline within raster antialiasing', async () => {
  const source = readSourceSvg(await readFile(new URL('../vendor/visual-identity/exports/pubnyan-normal-transparent.svg', import.meta.url), 'utf8'));
  const original = selectPath(source, 'path17#outer');
  const rig = getRig('pubnyan');
  const pieces = rig.parts.filter((p) => ['body', 'head', 'ear-l', 'ear-r'].includes(p.name));
  const renderer = await Renderer.launch();
  try {
    const difference = await renderer.evaluate<number>(`<script>
      const draw=(paths,offset)=>{const canvas=document.createElement('canvas');canvas.width=406;canvas.height=351;const c=canvas.getContext('2d');c.translate(offset,offset);for(const d of paths)c.fill(new Path2D(d));return c.getImageData(0,0,406,351).data;};
      const before=draw(${JSON.stringify([original])},16), after=draw(${JSON.stringify(pieces.map(p => p.path))},0);
      let changed=0;for(let i=3;i<before.length;i+=4)if(Math.abs(before[i]-after[i])>32)changed++;
      window.__result=changed;window.__done=true;
    </script>`);
    expect(difference).toBeLessThan(80);
  } finally { await renderer.close(); }
});
