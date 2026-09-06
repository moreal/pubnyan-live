import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { staticParts } from '#ir/sample.ts';
import { renderStaticSvg } from '#ir/svg.ts';
import { assertValid, validateRig } from '#ir/validate.ts';
import { buildRig } from '#rig-extract/build-rig.ts';
import { inspectSvg } from '#rig-extract/inspect.ts';
import type { PartsMap } from '#rig-extract/parts-map.ts';
import { readSourceSvg, type SourcePath } from '#rig-extract/svg-source.ts';
import { Renderer } from '#verify/renderer.ts';

const ROOT = new URL('../../../', import.meta.url).pathname;
const RIG_DIR = join(ROOT, 'rig');

async function extract(): Promise<void> {
  const map = JSON.parse(await readFile(join(RIG_DIR, 'parts.map.json'), 'utf8')) as PartsMap;
  const cache = new Map<string, SourcePath[]>();
  const load = async (dir: string, file: string) => {
    const key = `${dir}/${file}`;
    if (!cache.has(key)) cache.set(key, readSourceSvg(await readFile(join(ROOT, dir, file), 'utf8')));
    return cache.get(key)!;
  };
  const renderer = await Renderer.launch();
  try {
    for (const [name, def] of Object.entries(map.rigs)) {
      const files: Record<string, SourcePath[]> = {};
      for (const e of Object.values(def.expressions)) files[e.file] = await load(map.source, e.file);
      if (def.overridesFile) {
        if (!map.overrides) throw new Error(`rig "${name}" has overridesFile but the parts map has no "overrides" source`);
        files[def.overridesFile] = await load(map.overrides, def.overridesFile);
      }
      const rig = buildRig(name, def, files);
      assertValid(validateRig(rig), `rig ${name}`);
      await writeFile(join(RIG_DIR, `${name}.rig.json`), JSON.stringify(rig, null, 2) + '\n');
      await mkdir(join(RIG_DIR, 'preview'), { recursive: true });
      for (const expr of Object.keys(rig.expressions)) {
        const svg = renderStaticSvg(staticParts(rig, expr), rig.artboard);
        await writeFile(join(RIG_DIR, 'preview', `${name}-${expr}.svg`), svg);
        await writeFile(join(RIG_DIR, 'preview', `${name}-${expr}.png`), await renderer.renderSvg(svg, rig.artboard.width, rig.artboard.height));
      }
      console.log(`${name}: ${rig.parts.length} parts, expressions: ${Object.keys(rig.expressions).join(', ')}`);
    }
  } finally {
    await renderer.close();
  }
}

async function inspect(file: string): Promise<void> {
  const paths = readSourceSvg(await readFile(file, 'utf8'));
  const svg = inspectSvg(paths);
  const outDir = join(RIG_DIR, 'inspect');
  await mkdir(outDir, { recursive: true });
  const stem = basename(file, '.svg');
  await writeFile(join(outDir, `${stem}.svg`), svg);
  const renderer = await Renderer.launch();
  try {
    await writeFile(join(outDir, `${stem}.png`), await renderer.renderPage(svg, 1600));
  } finally {
    await renderer.close();
  }
  for (const p of paths) console.log(p.id, p.fill, p.subpaths.map((s) => `[${s.bbox.join(',')}]`).join(' '));
  console.log(`wrote ${join(outDir, `${stem}.png`)}`);
}

const [command, arg] = process.argv.slice(2);
if (command === 'extract') await extract();
else if (command === 'inspect' && arg) await inspect(arg);
else {
  console.error('usage: cli.ts extract | inspect <file.svg>');
  process.exit(2);
}
