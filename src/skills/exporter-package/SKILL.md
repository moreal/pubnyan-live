---
name: exporter-package
description: "How exporter packages are laid out and verified: the Target interface, parity, registration. Use for any export-* backlog item."
---
# Exporter packages

`packages/export-svg` is the model. Copy its shape, not its output format.

## Layout

- `packages/export-<target>/src/index.ts` — the pure function: `exportSvg(rig: Rig, clip: Clip): string`. No I/O, no `dist/` paths; it takes a rig and a clip and returns the file's contents (a string, an object, or a `Buffer` — whatever the format is).
- `src/cli.ts` — writes every clip in `#motion/index.ts` to `dist/<target>/`. Copy `packages/export-svg/src/cli.ts`.
- `src/index.test.ts` — unit tests on a tiny hand-written rig, asserting structure. Copy `packages/export-svg/src/index.test.ts`.
- Packages have no `package.json` of their own. Add the alias to the root `package.json` `imports` (`"#export-lottie/*": "./packages/export-lottie/src/*"`) and import through `#` aliases everywhere (`#ir/types.ts`, `#verify/parity.ts`); only files inside `src/` use relative `.ts` paths.
- New runtime dependencies: `npm install --save <pkg>@<version>`, then commit `package.json` and `package-lock.json` with the change. Install scripts also need an `allowScripts` entry (see README).

## Verification target

`packages/verify/src/parity.ts` defines what verify consumes:

```ts
export interface Target {
  name: string;
  export(rig: Rig, clip: Clip, outDir: string): Promise<string[]>;      // writes files, returns paths
  renderFrame(renderer: Renderer, rig: Rig, clip: Clip, t: number): Promise<Buffer>;  // PNG at artboard size, t in seconds
}
```

Write it in `packages/verify/src/targets/<target>.ts` (see `targets/svg.ts`) and register it in `packages/verify/src/targets/index.ts`:

```ts
export const TARGETS: Target[] = [svgTarget, lottieTarget];
```

`renderFrame` runs the real runtime in headless Chrome through `Renderer` (`renderHtml`/`renderSvg`, `packages/verify/src/renderer.ts`); load the player from `node_modules/...` by inlining its script text into the page, then seek to `t` and screenshot at `rig.artboard.width x height`.

## Parity

- Ground truth is `referenceFrame()`: `sampleClip(rig, clip, t)` drawn as a static SVG. Your frame is diffed against it with pixelmatch; the run fails if any sampled frame exceeds `PARITY_MAX_RATIO` (0.002, `packages/verify/src/config.ts`).
- Sample times come from `sampleTimes(clip)`: 0, every key time, `clip.duration`, and the midpoint of each consecutive pair — the midpoints are where a wrong ease shows.
- `packages/verify/src/fixtures/clips.ts` adds clips that reach branches the shipped clips do not: shape morph, crossfade with a hidden part, opacity on a parent. They are verified but never exported, so a new target must handle them too.
- Eases are cubic beziers from `EASES` in `packages/ir/src/easing.ts` (`[x1, y1, x2, y2]`, the same form CSS, Lottie, and Rive consume). Never re-derive them; a key's ease belongs to the segment ENDING at that key.
- Prove it with `run_checks` (`npm run check`), then read `dist/verify/<clip>-contact.png`: the reference row and your target's row must be indistinguishable.
