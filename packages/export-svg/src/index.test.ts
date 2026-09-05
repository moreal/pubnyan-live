import { describe, expect, test } from 'vitest';
import { exportSvg } from '#export-svg/index.ts';
import { clip, key, track } from '#ir/clip.ts';
import type { Rig } from '#ir/types.ts';

const rig: Rig = {
  name: 'r',
  artboard: { width: 100, height: 100 },
  parts: [
    { name: 'a', fill: '#000000', pivot: [5, 5], path: 'M0 0L10 0L10 10Z' },
    { name: 'b', fill: '#ffffff', pivot: [2, 2], parent: 'a', path: 'M0 0L4 0L4 4Z' },
    { name: 'ghost', fill: '#ffffff', pivot: [0, 0], parent: 'a', path: null },
  ],
  expressions: { normal: {}, wide: { b: 'M0 0L8 0L8 4Z' }, curve: { b: 'M0 0C1 1 2 2 3 3Z', ghost: 'M1 1L2 1L2 2Z' } },
};

describe('exportSvg', () => {
  test('nests children, uses native keyframes with eases for a single transform track', () => {
    const out = exportSvg(rig, clip('c', { rig: 'r', duration: 2 }, [track('a', 'rotation', [key(0, 0), key(2, 90, 'easeOut')])]));
    expect(out).toContain('viewBox="0 0 100 100"');
    expect(out).toContain('CC BY-SA 4.0');
    expect(out.indexOf('<g id="b"')).toBeGreaterThan(out.indexOf('<g id="a"'));
    expect(out).toContain('transform-origin: 0px 0px');
    expect(out).toContain('animation: a-t 2s linear infinite');
    expect(out).toContain('0% { transform: translate(5px, 5px) rotate(0deg) scale(1, 1) translate(-5px, -5px); animation-timing-function: cubic-bezier(0, 0, 0.58, 1); }');
    expect(out).toContain('100% { transform: translate(5px, 5px) rotate(90deg) scale(1, 1) translate(-5px, -5px); }');
    expect(out.match(/<g id="ghost"[^>]*><\/g>/)).not.toBeNull();
  });

  test('bakes per frame when a part has several transform tracks', () => {
    const out = exportSvg(rig, clip('c', { rig: 'r', duration: 1, fps: 10 }, [
      track('a', 'rotation', [key(0, 0), key(1, 90)]),
      track('a', 'scale', [key(0, [1, 1]), key(1, [2, 2], 'easeIn')]),
    ]));
    expect(out.match(/^\s+[\d.]+% \{ transform/gm)).toHaveLength(11);
    expect(out).not.toContain('cubic-bezier');
  });

  test('non-looping clips fill forwards', () => {
    const out = exportSvg(rig, clip('c', { rig: 'r', duration: 1, loop: false }, [track('a', 'opacity', [key(0, 1), key(1, 0)])]));
    expect(out).toContain('animation: a-o 1s linear 1 forwards');
    expect(out).toContain('@keyframes a-o');
  });

  test('morphs compatible shapes with d keyframes', () => {
    const out = exportSvg(rig, clip('c', { rig: 'r', duration: 1 }, [track('b', 'shape', [key(0, 'normal'), key(1, 'wide', 'easeInOut')])]));
    expect(out).toContain('d: path("M0 0L4 0L4 4Z")');
    expect(out).toContain('d: path("M0 0L8 0L8 4Z")');
    expect(out).toContain('@keyframes b-s');
  });

  test('crossfades incompatible shapes with one path per expression', () => {
    const out = exportSvg(rig, clip('c', { rig: 'r', duration: 1 }, [
      track('b', 'shape', [key(0, 'normal'), key(1, 'curve')]),
      track('ghost', 'shape', [key(0, 'normal'), key(1, 'curve')]),
    ]));
    expect(out).toContain('@keyframes b-s-normal');
    expect(out).toContain('@keyframes b-s-curve');
    expect(out).toContain('0% { opacity: 1; }');
    expect(out).toContain('100% { opacity: 0; }');
    expect(out.match(/<g id="b"[^>]*>(<path[^>]*>){2}/)).not.toBeNull();
    expect(out.match(/<g id="ghost"[^>]*>(<path[^>]*>){1}<\/g>/)).not.toBeNull();
  });
});
