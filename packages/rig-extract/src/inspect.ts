import type { SourcePath } from '#rig-extract/svg-source.ts';

/**
 * A montage that draws the whole file in grey once per subpath, highlighting that subpath in red and
 * labelling it `id#index`. This is how `rig/parts.map.json` selectors are chosen and checked.
 */
export function inspectSvg(paths: SourcePath[], columns = 4): string {
  const all = paths.flatMap((p) => p.subpaths.map((s, i) => ({ id: p.id, index: i, d: s.d, bbox: s.bbox })));
  if (all.length === 0) return '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>';
  const minX = Math.min(...all.map((s) => s.bbox[0]));
  const minY = Math.min(...all.map((s) => s.bbox[1]));
  const w = Math.max(...all.map((s) => s.bbox[2])) - minX + 20;
  const h = Math.max(...all.map((s) => s.bbox[3])) - minY + 40;
  const cells = all.map((target, n) => {
    const col = n % columns;
    const row = Math.floor(n / columns);
    const body = all
      .map((s) => `<path d="${s.d}" fill="${s === target ? '#ff0000' : '#9a9a9a'}" fill-opacity="${s === target ? 1 : 0.5}"/>`)
      .join('');
    return `<g transform="translate(${col * w}, ${row * h})"><rect width="${w}" height="${h}" fill="#ffffff" stroke="#dddddd"/>` +
      `<text x="6" y="24" font-size="20" font-family="sans-serif" fill="#0000ff">${target.id}#${target.index}</text>` +
      `<g transform="translate(${10 - minX}, ${30 - minY})">${body}</g></g>`;
  });
  const rows = Math.ceil(all.length / columns);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w * columns}" height="${h * rows}" viewBox="0 0 ${w * columns} ${h * rows}">${cells.join('')}</svg>`;
}
