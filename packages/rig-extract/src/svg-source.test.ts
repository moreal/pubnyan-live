import { expect, test } from 'vitest';
import { readSourceSvg, splitSubpaths } from '#rig-extract/svg-source.ts';

const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs><clipPath id="c"><path id="clip" d="M0 0H100V100H0Z"/></clipPath></defs>
  <g transform="translate(-10,-20)">
    <path id="p1" style="fill:#FFFFFF;fill-rule:nonzero" transform="matrix(2,0,0,-2,10,30)" d="M 0,0 L 10,0 L 10,10 Z m 10,10 l 1,0 l 0,1 z" clip-path="url(#c)"/>
    <path id="p2" fill="#000000" d="M 5,5 L 6,5 L 6,5.2 Z"/>
  </g>
</svg>`;

// Note: after `Z` the current point returns to the subpath start, so `m 10,10` starts at (10,10), not (10,10)+(10,10).
test('reads paths in world space, splits subpaths, skips clipPaths, drops degenerate subpaths', () => {
  const paths = readSourceSvg(xml);
  expect(paths.map((p) => p.id)).toEqual(['p1', 'p2']);
  const [p1, p2] = paths;
  expect(p1.fill).toBe('#ffffff');
  expect(p1.subpaths).toEqual([
    { d: 'M0 10L20 10L20 -10Z', bbox: [0, -10, 20, 10] },
    { d: 'M20 -10L22 -10L22 -12Z', bbox: [20, -12, 22, -10] },
  ]);
  expect(p2.fill).toBe('#000000');
  expect(p2.subpaths).toEqual([]);
});

test('splitSubpaths closes open subpaths and keeps curves absolute', () => {
  const subs = splitSubpaths('M0 0C1 1 2 2 3 3L5 5');
  expect(subs).toHaveLength(1);
  expect(subs[0].d).toBe('M0 0C1 1 2 2 3 3L5 5Z');
});
