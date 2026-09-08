#!/usr/bin/env node
// Assembles the GitHub Pages site in dist/site:
//   /                → the landing page from site/
//   /assets/<target> → the exported clips (dist/svg, dist/lottie, dist/rive, dist/video)
//   /assets/still/   → the resting poses from rig/preview/ (posters, reduced-motion stand-ins)
//   /vendor/         → the Rive and Lottie web runtimes the landing page embeds
//   /_storybook/     → the Storybook build from dist/storybook (when present)
// Run `npm run storybook:build` first (with STORYBOOK_BASE=<pages base>/_storybook/) so the
// Storybook build resolves its own chunks under the subpath.
import { cp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = join(ROOT, 'dist', 'site');

const exists = (path) => stat(path).then(() => true, () => false);

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

await cp(join(ROOT, 'site'), OUT, { recursive: true });
console.log('copied site/ -> dist/site/');

for (const target of ['svg', 'lottie', 'rive', 'video']) {
  const src = join(ROOT, 'dist', target);
  if (!(await exists(src))) {
    throw new Error(`dist/${target} is missing; run npm run storybook:assets first`);
  }
  await cp(src, join(OUT, 'assets', target), { recursive: true });
  console.log(`copied dist/${target} -> dist/site/assets/${target}`);
}

// Still poses from rig/preview/ are the posters behind every player and the reduced-motion stand-ins.
await mkdir(join(OUT, 'assets', 'still'), { recursive: true });
for (const pose of ['normal', 'angry', 'curious', 'cry', 'shy', 'happy']) {
  const src = join(ROOT, 'rig', 'preview', `pubnyan-${pose}.svg`);
  if (await exists(src)) await cp(src, join(OUT, 'assets', 'still', `${pose}.svg`));
}
console.log('copied rig/preview/pubnyan-*.svg -> dist/site/assets/still/');

const vendor = [
  ['node_modules/@rive-app/canvas/rive.js', 'vendor/rive.js'],
  ['node_modules/@rive-app/canvas/rive.wasm', 'vendor/rive.wasm'],
  ['node_modules/lottie-web/build/player/lottie_svg.min.js', 'vendor/lottie_svg.min.js'],
];
for (const [from, to] of vendor) {
  await mkdir(join(OUT, 'vendor'), { recursive: true });
  await cp(join(ROOT, from), join(OUT, to));
  console.log(`copied ${from} -> dist/site/${to}`);
}

const storybook = join(ROOT, 'dist', 'storybook');
if (await exists(storybook)) {
  await cp(storybook, join(OUT, '_storybook'), { recursive: true });
  console.log('copied dist/storybook -> dist/site/_storybook');
} else {
  console.warn('dist/storybook not found; the site is built without /_storybook/');
}

// GitHub Pages runs Jekyll by default, which drops paths starting with "_" (like /_storybook/).
await writeFile(join(OUT, '.nojekyll'), '');
console.log('wrote dist/site/.nojekyll');
