# pubnyan-live Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build phases 1 to 3 of the spec: repo scaffold, a clean named rig extracted from the visual-identity submodule, the motion IR with sampling, the animated-SVG exporter, the headless verify loop, and the first two clips (`spinner`, `idle`). Phases 4 to 6 are seeded into `docs/backlog.md` for the agents.

**Architecture:** One npm package. `packages/*` are plain directories addressed through package.json `imports` aliases (`#ir/*`, `#rig-extract/*`, `#export-svg/*`, `#verify/*`, `#motion/*`, `#rig/*`). Rig JSON is generated from the submodule SVGs by a hand-authored mapping; clips are TypeScript files that produce validated JSON; `sampleClip()` is the single source of truth every exporter is checked against by rendering frames in headless Chrome and diffing pixels.

**Tech Stack:** Node 26 (native TypeScript execution, no build step), TypeScript 7 (`tsc --noEmit` only), vitest 5, svgpath 2.6, svg-path-bbox 2.1, @xmldom/xmldom 0.9, puppeteer 25, pixelmatch 7, pngjs 7, @flue/runtime and @flue/cli 2.0.3.

**Spec:** `docs/superpowers/specs/2026-09-05-pubnyan-live-design.md` (read its "Revisions" section: it records the decisions below that refine the original text).

## Global Constraints

- Node `>=26`. Run TypeScript directly with `node file.ts`; never add a bundler or a build step.
- Every import of a local `.ts` file uses the `.ts` extension. Cross-directory imports use the `#` aliases, never long relative paths.
- TypeScript must stay erasable: no `enum`, no parameter properties, no namespaces (`erasableSyntaxOnly: true`).
- Rig paths are absolute path data using only `M`, `L`, `C`, `Z`, rounded to 2 decimals.
- Coordinates: viewer's left is `-l`, viewer's right is `-r`. Artboard origin is top-left, y grows downward.
- Every exported artifact embeds the attribution string from `#ir/svg.ts` (`ATTRIBUTION`): pubnyan by Bak Eunji, CC BY-SA 4.0.
- Parity threshold: at most 0.2% of pixels differ per sampled frame (`PARITY_MAX_RATIO = 0.002` in `packages/verify/src/config.ts`).
- Headless Chrome pages set `background:#fff` on `<body>` explicitly (the host's dark colour scheme leaks in otherwise).
- Commits: conventional prefixes (`feat:`, `test:`, `docs:`, `chore:`), one task per commit, never commit `dist/verify/` or `.env`.
- Never edit `vendor/visual-identity/`; it is a submodule.

## Source artwork facts the code relies on

Each `vendor/visual-identity/exports/pubnyan-<expr>-transparent.svg` has a layer `<g transform="translate(...)">` holding one group with the real paths, each with `transform="matrix(1.3333333,0,0,-1.3333333,tx,ty)"` and a `clip-path` referencing a full-page rectangle. Several hundred other paths live inside `<clipPath>` elements and must be ignored. The black silhouette path has holes where the white parts sit, and the white parts have holes where black features sit. The rig ignores the holes (`#outer` selector) and layers parts instead, which reproduces the image exactly. Expression files have different widths; they are aligned on the nose. Degenerate zero-size subpaths exist in the shy file and are dropped.

Path ids per expression (verified by rendering each path highlighted):

| part | normal | angry | curious | cry | shy |
|---|---|---|---|---|---|
| body | path17#outer | path55#outer | path37#outer | path81#outer | path103#outer |
| face | path7#outer | path45#outer | path31#outer | path63#outer | path87#outer |
| eye-l.white | path11#outer | path47#outer | path27#outer | path59#outer | path85#outer |
| eye-r.white | path9#outer | path43#outer | path29#outer | path65#outer | path83#outer |
| ring-gap-l | path15 | path53 | path35 | path79 | path97 |
| ring-gap-r | path13 | path51 | path33 | path77 | path95 |
| eye-l.pupil | path21 | (hidden) | (hidden) | path69 | (hidden) |
| eye-r.pupil | path19 | (hidden) | (hidden) | path71 | (hidden) |
| nose | path23 | path49 | path39 | path73 | path89 |
| mouth | path25 | path57 | path41 | path75 | path111 |
| tear-l | (hidden) | (hidden) | (hidden) | path61 | (hidden) |
| tear-r | (hidden) | (hidden) | (hidden) | path67 | (hidden) |

`starorbit-transparent-287x202.svg` holds the ring alone: `path834` (ring, two subpaths: outer and inner hole, keep both) and `path836` (star).

## File structure

```
package.json, tsconfig.json, vitest.config.ts, flue.config.ts, .env.example, .gitignore
.github/workflows/ci.yml
README.md, AGENTS.md, docs/backlog.md
vendor/visual-identity/                 submodule
rig/parts.map.json                      hand-authored mapping (Task 8)
rig/pubnyan.rig.json, rig/starorbit.rig.json   generated, committed
rig/preview/*.svg|png                   generated, committed (svg only)
motion/index.ts, motion/clips/spinner.clip.ts, motion/clips/idle.clip.ts
packages/ir/src/types.ts                Rig, Clip, Track, Key, Machine types
packages/ir/src/validate.ts             validateRig, assertValid
packages/ir/src/easing.ts               EASES table, easeValue
packages/ir/src/clip.ts                 clip/track/key builders, validateClip
packages/ir/src/machine.ts              machine builder, validateMachine
packages/ir/src/matrix.ts               2D affine helpers
packages/ir/src/path.ts                 parsePath, serializePath, interpolatePath
packages/ir/src/sample.ts               sampleClip and friends
packages/ir/src/svg.ts                  renderStaticSvg, ATTRIBUTION
packages/rig-extract/src/svg-source.ts  readSourceSvg, splitSubpaths
packages/rig-extract/src/parts-map.ts   PartsMap types, selectPath
packages/rig-extract/src/build-rig.ts   buildRig
packages/rig-extract/src/inspect.ts     highlight montage
packages/rig-extract/src/cli.ts         extract | inspect
packages/export-svg/src/index.ts        exportSvg
packages/export-svg/src/cli.ts          writes dist/svg
packages/verify/src/config.ts           thresholds
packages/verify/src/renderer.ts         puppeteer wrapper
packages/verify/src/reference.ts        reference frames from sampleClip
packages/verify/src/parity.ts           compareFrames, sampleTimes, checkParity, Target
packages/verify/src/targets/svg.ts      svgTarget
packages/verify/src/contact-sheet.ts
packages/verify/src/cli.ts              npm run verify
dist/svg/*.svg                          committed export output
dist/verify/                            gitignored
```

---

### Task 1: Repository scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `.env.example`, `flue.config.ts`, `README.md`, `AGENTS.md`, `.github/workflows/ci.yml`, `packages/ir/src/smoke.test.ts`
- Create (by `git submodule add`): `.gitmodules`, `vendor/visual-identity`

**Interfaces:**
- Produces: the `#ir/*`, `#rig-extract/*`, `#export-svg/*`, `#verify/*`, `#motion/*`, `#rig/*` import aliases; scripts `test`, `check:types`, `rig:extract`, `rig:inspect`, `export:svg`, `verify`.

- [ ] **Step 1: Add the submodule and the Flue scaffold**

```bash
cd /Users/moreal/github/moreal/pubnyan-live
git submodule add https://github.com/hackers-pub/visual-identity vendor/visual-identity
npx -y @flue/cli@2.0.3 init --target node --force .
rm src/agents/hello.ts
```

Expected: `vendor/visual-identity/exports/pubnyan-normal-transparent.svg` exists; Flue wrote `flue.config.ts`, `src/db.ts`, `.env`, `AGENTS.md`, `README.md`, `package.json`, `tsconfig.json`, `.gitignore`. Keep `src/db.ts` and `flue.config.ts` as written. Overwrite the rest below.

- [ ] **Step 2: Write package.json**

```json
{
  "name": "pubnyan-live",
  "private": true,
  "type": "module",
  "engines": { "node": ">=26" },
  "imports": {
    "#ir/*": "./packages/ir/src/*",
    "#rig-extract/*": "./packages/rig-extract/src/*",
    "#export-svg/*": "./packages/export-svg/src/*",
    "#verify/*": "./packages/verify/src/*",
    "#motion/*": "./motion/*",
    "#rig/*": "./rig/*"
  },
  "scripts": {
    "test": "vitest run --passWithNoTests",
    "check:types": "tsc --noEmit",
    "rig:extract": "node packages/rig-extract/src/cli.ts extract",
    "rig:inspect": "node packages/rig-extract/src/cli.ts inspect",
    "export:svg": "node packages/export-svg/src/cli.ts",
    "verify": "node packages/verify/src/cli.ts"
  },
  "dependencies": {
    "@flue/runtime": "^2.0.3",
    "@xmldom/xmldom": "^0.9.12",
    "pixelmatch": "^7.2.0",
    "pngjs": "^7.0.0",
    "puppeteer": "^25.10.0",
    "svg-path-bbox": "^2.1.0",
    "svgpath": "^2.6.0"
  },
  "devDependencies": {
    "@flue/cli": "^2.0.3",
    "@types/node": "^26.4.1",
    "@types/pngjs": "^6.0.5",
    "typescript": "^7.0.2",
    "vitest": "^5.0.0"
  }
}
```

- [ ] **Step 3: Write tsconfig.json and vitest.config.ts**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext", "DOM"],
    "types": ["node"],
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "resolveJsonModule": true,
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["packages", "motion", "rig", "src", "flue.config.ts", "vitest.config.ts"]
}
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'motion/**/*.test.ts'],
    testTimeout: 60_000,
  },
});
```

- [ ] **Step 4: Write .gitignore and .env.example**

```
# .gitignore
node_modules/
data/
dist/verify/
rig/preview/*.png
rig/inspect/
.env
```

```
# .env.example  (copy to .env; loaded by `flue run`)
ANTHROPIC_API_KEY=""
```

- [ ] **Step 5: Write README.md**

```markdown
# pubnyan-live

Animations of pubnyan, the [Hackers' Pub](https://hackers.pub/) mascot, defined once in a small motion DSL and exported to animated SVG, Lottie, Rive, and video.

## Layout

- `vendor/visual-identity/` — the source artwork (git submodule).
- `rig/` — `parts.map.json` names the artwork's paths; `*.rig.json` is generated from it by `npm run rig:extract`.
- `motion/` — the single definition: `clips/*.clip.ts` and `machine.ts`.
- `packages/` — `ir` (types, validation, sampling), `rig-extract`, `export-*`, `verify`.
- `dist/` — exported output per target.
- `docs/backlog.md` — the work queue shared by humans and agents.

## Commands

```
npm install
git submodule update --init
npm run rig:extract     # regenerate rig/*.rig.json and rig/preview/
npm run export:svg      # write dist/svg/<clip>.svg
npm run verify          # export every target, check parity against the reference sampler
npm test
npm run check:types
```

## Attribution

The pubnyan artwork is © 2025 Bak Eunji, licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), from [hackers-pub/visual-identity](https://github.com/hackers-pub/visual-identity). Every file under `dist/` carries this attribution and is licensed under the same terms.
```

- [ ] **Step 6: Write AGENTS.md**

```markdown
# AGENTS.md

Rules for any agent (Flue, pi, Claude Code) working in this repository.

## What this repo is

pubnyan animations. One motion definition in `motion/` is exported to several targets. `npm run verify` is the arbiter: it renders every target and the reference sampler in headless Chrome and diffs them.

## Rules

- Never edit `vendor/visual-identity/` (submodule) or `rig/*.rig.json` by hand. Change `rig/parts.map.json` and run `npm run rig:extract`.
- Do not edit `packages/*` unless the backlog item you are working on says so. Animation work lives in `motion/clips/`.
- Run `npm run verify` before committing. Commit only when it passes. Look at `dist/verify/<clip>-contact.png` and judge the motion visually, not just the numbers.
- Pick work from `docs/backlog.md` top to bottom. Mark an item `[x]` in the same commit that completes it.
- Commit on a branch named `agent/<item-slug>`. Never commit `dist/verify/` or `.env`.
- Keep amplitudes small: pubnyan is a calm cat. The ring and the star mouth are the focal elements.

## Commands

- `npm run rig:extract` / `npm run rig:inspect <file.svg>`
- `npm run export:svg`, `npm run verify`, `npm test`, `npm run check:types`
- `npx flue run src/agents/director.ts -m next --id pubnyan` — run the director once (phase 6).
```

- [ ] **Step 7: Write the CI workflow and a smoke test**

```yaml
# .github/workflows/ci.yml
name: ci
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { submodules: true }
      - uses: actions/setup-node@v4
        with: { node-version: 26 }
      - run: npm ci
      - run: npm run check:types
      - run: npm test
      - run: npm run verify
```

```ts
// packages/ir/src/smoke.test.ts
import { expect, test } from 'vitest';

test('toolchain runs TypeScript tests', () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 8: Install and verify the toolchain**

Run: `npm install && npm run check:types && npm test`
Expected: install succeeds (puppeteer downloads Chrome for Testing), `tsc` prints nothing, vitest reports 1 passed.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold repo, submodule, toolchain, Flue config"
```

---

### Task 2: IR types and rig validation

**Files:**
- Create: `packages/ir/src/types.ts`, `packages/ir/src/validate.ts`
- Test: `packages/ir/src/validate.test.ts`
- Delete: `packages/ir/src/smoke.test.ts`

**Interfaces:**
- Produces: all types below; `validateRig(rig): string[]`; `assertValid(errors, label): void`; `isVec2`, `isPathData`.

- [ ] **Step 1: Write the types**

```ts
// packages/ir/src/types.ts
export type Vec2 = [number, number];
/** SVG-style affine matrix [a, b, c, d, e, f]: x' = a*x + c*y + e, y' = b*x + d*y + f. */
export type Matrix = [number, number, number, number, number, number];

export interface RigPart {
  name: string;
  fill: string;
  /** Rotation and scale centre, in artboard coordinates. */
  pivot: Vec2;
  /** Transforms of the parent apply to this part. Parent must be declared earlier in `parts`. */
  parent?: string;
  /** Default absolute path data (M/L/C/Z). null = hidden unless an expression supplies a path. */
  path: string | null;
}

export interface Rig {
  name: string;
  artboard: { width: number; height: number };
  /** Draw order, bottom first. */
  parts: RigPart[];
  /** expression name -> part name -> path data (null = hidden in this expression). Missing part = default path. */
  expressions: Record<string, Record<string, string | null>>;
}

export type EaseName = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'inOutSine' | 'outQuint' | 'outBack';
export type Property = 'position' | 'rotation' | 'scale' | 'opacity' | 'shape';
export type TrackValue<P extends Property> = P extends 'position' | 'scale' ? Vec2 : P extends 'shape' ? string : number;

export interface Key<V> {
  /** seconds */
  t: number;
  v: V;
  /** Easing of the segment that ENDS at this key (from the previous key). Linear when omitted. */
  ease?: EaseName;
}

export interface Track<P extends Property = Property> {
  part: string;
  property: P;
  keys: Key<TrackValue<P>>[];
}

export interface Clip {
  name: string;
  rig: string;
  /** seconds */
  duration: number;
  fps: number;
  loop: boolean;
  tracks: Track[];
}

export type MachineInput =
  | { type: 'enum'; values: string[]; default: string }
  | { type: 'trigger' }
  | { type: 'bool'; default: boolean };

export interface MachineState {
  /** Clip to play, or null for an empty state. */
  clip: string | null;
  mode: 'loop' | 'once';
}

export interface MachineTransition {
  from: string | '*';
  to: string;
  when: { input: string; equals: string | boolean } | { input: string; fired: true };
  /** crossfade seconds */
  duration: number;
}

export interface MachineLayer {
  entry: string;
  states: Record<string, MachineState>;
  transitions: MachineTransition[];
}

export interface Machine {
  rig: string;
  inputs: Record<string, MachineInput>;
  layers: Record<string, MachineLayer>;
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// packages/ir/src/validate.test.ts
import { describe, expect, test } from 'vitest';
import type { Rig } from '#ir/types.ts';
import { assertValid, validateRig } from '#ir/validate.ts';

const good: Rig = {
  name: 'test',
  artboard: { width: 100, height: 100 },
  parts: [
    { name: 'body', fill: '#000000', pivot: [50, 100], path: 'M0 0L100 0L100 100L0 100Z' },
    { name: 'eye', fill: '#ffffff', pivot: [30, 30], parent: 'body', path: 'M20 20L40 20L40 40Z' },
    { name: 'tear', fill: '#ffffff', pivot: [0, 0], parent: 'body', path: null },
  ],
  expressions: { normal: {}, cry: { tear: 'M0 0L1 0L1 1Z', eye: null } },
};

describe('validateRig', () => {
  test('accepts a well-formed rig', () => {
    expect(validateRig(good)).toEqual([]);
  });

  test('rejects duplicate names, bad fills, unknown parents, parent declared later', () => {
    const bad: Rig = {
      ...good,
      parts: [
        { name: 'eye', fill: '#fff', pivot: [0, 0], parent: 'body', path: null },
        { name: 'body', fill: '#000000', pivot: [0, 0], path: 'M0 0Z' },
        { name: 'body', fill: '#000000', pivot: [0, 0], parent: 'ghost', path: 'M0 0Z' },
      ],
    };
    const errors = validateRig(bad);
    expect(errors.some((e) => e.includes('duplicate'))).toBe(true);
    expect(errors.some((e) => e.includes('#rrggbb'))).toBe(true);
    expect(errors.some((e) => e.includes('"ghost"'))).toBe(true);
    expect(errors.some((e) => e.includes('"body" must be declared before'))).toBe(true);
  });

  test('rejects expressions naming unknown parts or relative path data', () => {
    const errors = validateRig({ ...good, expressions: { x: { nope: null, eye: 'm 1 2 l 3 4' } } });
    expect(errors).toHaveLength(2);
  });

  test('assertValid throws with all messages', () => {
    expect(() => assertValid(['a', 'b'], 'rig test')).toThrow(/rig test.*\n- a\n- b/s);
    expect(() => assertValid([], 'ok')).not.toThrow();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run packages/ir/src/validate.test.ts`
Expected: FAIL, cannot resolve `#ir/validate.ts`.

- [ ] **Step 4: Write validate.ts**

```ts
// packages/ir/src/validate.ts
import type { Rig, Vec2 } from '#ir/types.ts';

export const isVec2 = (v: unknown): v is Vec2 =>
  Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n));

/** Absolute path data restricted to M/L/C/Z. Rejects relative commands and arcs. */
export const isPathData = (d: unknown): d is string =>
  typeof d === 'string' && /^M[0-9.\s\-eMLCZ]*$/.test(d);

export function validateRig(rig: Rig): string[] {
  const errors: string[] = [];
  if (!rig.name) errors.push('rig.name is required');
  if (!(rig.artboard?.width > 0 && rig.artboard?.height > 0)) errors.push('artboard width and height must be positive');
  if (!Array.isArray(rig.parts) || rig.parts.length === 0) errors.push('rig needs at least one part');
  const seen = new Set<string>();
  for (const [i, part] of (rig.parts ?? []).entries()) {
    const at = `parts[${i}] (${part.name})`;
    if (!part.name) errors.push(`${at}: name is required`);
    if (seen.has(part.name)) errors.push(`${at}: duplicate part name`);
    if (!/^#[0-9a-f]{6}$/i.test(part.fill)) errors.push(`${at}: fill must be #rrggbb`);
    if (!isVec2(part.pivot)) errors.push(`${at}: pivot must be [x, y]`);
    if (part.parent !== undefined && !seen.has(part.parent)) {
      errors.push(`${at}: parent "${part.parent}" must be declared before this part`);
    }
    if (part.path !== null && !isPathData(part.path)) errors.push(`${at}: path must be null or absolute M/L/C/Z path data`);
    seen.add(part.name);
  }
  for (const [expr, map] of Object.entries(rig.expressions ?? {})) {
    for (const [name, d] of Object.entries(map)) {
      if (!seen.has(name)) errors.push(`expressions.${expr}: unknown part "${name}"`);
      if (d !== null && !isPathData(d)) errors.push(`expressions.${expr}.${name}: path must be null or absolute M/L/C/Z path data`);
    }
  }
  return errors;
}

export function assertValid(errors: string[], label: string): void {
  if (errors.length > 0) throw new Error(`${label} is invalid:\n- ${errors.join('\n- ')}`);
}
```

- [ ] **Step 5: Run tests, then delete the smoke test**

Run: `rm packages/ir/src/smoke.test.ts && npx vitest run packages/ir`
Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add packages/ir
git commit -m "feat(ir): rig, clip, and machine types with rig validation"
```

---

### Task 3: Easing library

**Files:**
- Create: `packages/ir/src/easing.ts`
- Test: `packages/ir/src/easing.test.ts`

**Interfaces:**
- Produces: `EASES: Record<EaseName, [x1, y1, x2, y2]>`, `easeValue(name, x): number`, `EASE_NAMES: EaseName[]`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/ir/src/easing.test.ts
import { describe, expect, test } from 'vitest';
import { EASES, EASE_NAMES, easeValue } from '#ir/easing.ts';

describe('easeValue', () => {
  test('every ease maps 0 to 0 and 1 to 1', () => {
    for (const name of EASE_NAMES) {
      expect(easeValue(name, 0)).toBe(0);
      expect(easeValue(name, 1)).toBe(1);
    }
  });

  test('linear is identity', () => {
    expect(easeValue('linear', 0.3)).toBeCloseTo(0.3, 6);
  });

  test('symmetric eases pass through the midpoint', () => {
    expect(easeValue('easeInOut', 0.5)).toBeCloseTo(0.5, 4);
    expect(easeValue('inOutSine', 0.5)).toBeCloseTo(0.5, 4);
  });

  test('easeOut is ahead of linear, easeIn behind', () => {
    expect(easeValue('easeOut', 0.5)).toBeGreaterThan(0.5);
    expect(easeValue('easeIn', 0.5)).toBeLessThan(0.5);
  });

  test('outBack overshoots', () => {
    const peak = Math.max(...Array.from({ length: 101 }, (_, i) => easeValue('outBack', i / 100)));
    expect(peak).toBeGreaterThan(1.05);
  });

  test('table matches CSS cubic-bezier form', () => {
    expect(EASES.easeInOut).toEqual([0.42, 0, 0.58, 1]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/ir/src/easing.test.ts`
Expected: FAIL, cannot resolve `#ir/easing.ts`.

- [ ] **Step 3: Write easing.ts**

```ts
// packages/ir/src/easing.ts
import type { EaseName } from '#ir/types.ts';

/** Cubic bezier control points (x1, y1, x2, y2), the same form CSS, Lottie, and Rive consume. */
export const EASES: Record<EaseName, [number, number, number, number]> = {
  linear: [0, 0, 1, 1],
  easeIn: [0.42, 0, 1, 1],
  easeOut: [0, 0, 0.58, 1],
  easeInOut: [0.42, 0, 0.58, 1],
  inOutSine: [0.37, 0, 0.63, 1],
  outQuint: [0.22, 1, 0.36, 1],
  outBack: [0.34, 1.56, 0.64, 1],
};

export const EASE_NAMES = Object.keys(EASES) as EaseName[];

/** Eased progress for x in [0, 1]. Solves the bezier x(t) = x by bisection, then returns y(t). */
export function easeValue(name: EaseName, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (name === 'linear') return x;
  const [x1, y1, x2, y2] = EASES[name];
  const at = (p1: number, p2: number, t: number) => 3 * p1 * t * (1 - t) * (1 - t) + 3 * p2 * t * t * (1 - t) + t * t * t;
  let lo = 0;
  let hi = 1;
  let t = x;
  for (let i = 0; i < 48; i++) {
    const bx = at(x1, x2, t);
    if (Math.abs(bx - x) < 1e-7) break;
    if (bx < x) lo = t;
    else hi = t;
    t = (lo + hi) / 2;
  }
  return at(y1, y2, t);
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/ir/src/easing.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/ir/src/easing.ts packages/ir/src/easing.test.ts
git commit -m "feat(ir): named cubic-bezier easings"
```

---

### Task 4: Clip and machine DSL with validation

**Files:**
- Create: `packages/ir/src/clip.ts`, `packages/ir/src/machine.ts`
- Test: `packages/ir/src/clip.test.ts`, `packages/ir/src/machine.test.ts`

**Interfaces:**
- Consumes: types from Task 2, `EASES` from Task 3.
- Produces: `clip(name, opts, tracks): Clip`, `track(part, property, keys): Track`, `key(t, v, ease?): Key`, `validateClip(clip, rig): string[]`, `machine(def): Machine`, `validateMachine(machine, rig, clips): string[]`.

- [ ] **Step 1: Write the failing clip tests**

```ts
// packages/ir/src/clip.test.ts
import { describe, expect, test } from 'vitest';
import { clip, key, track, validateClip } from '#ir/clip.ts';
import type { Rig } from '#ir/types.ts';

const rig: Rig = {
  name: 'r',
  artboard: { width: 10, height: 10 },
  parts: [{ name: 'a', fill: '#000000', pivot: [0, 0], path: 'M0 0L1 0L1 1Z' }],
  expressions: { normal: {}, angry: { a: 'M0 0L2 0L2 2Z' } },
};

describe('clip DSL', () => {
  test('builders fill defaults', () => {
    const c = clip('idle', { rig: 'r', duration: 2 }, [track('a', 'rotation', [key(0, 0), key(2, 10, 'easeOut')])]);
    expect(c).toEqual({
      name: 'idle', rig: 'r', duration: 2, fps: 30, loop: true,
      tracks: [{ part: 'a', property: 'rotation', keys: [{ t: 0, v: 0 }, { t: 2, v: 10, ease: 'easeOut' }] }],
    });
    expect(validateClip(c, rig)).toEqual([]);
  });

  test('rejects wrong rig, unknown part, bad times, bad values, duplicate tracks', () => {
    const c = clip('x', { rig: 'other', duration: 1, fps: 0 }, [
      track('ghost', 'opacity', [key(0, 1)]),
      track('a', 'opacity', [key(0.5, 2), key(0.5, 1)]),
      track('a', 'opacity', [key(0, 1)]),
      track('a', 'scale', [key(0, [1, 1, 1] as unknown as [number, number])]),
      track('a', 'shape', [key(0, 'normal'), key(3, 'sad')]),
      track('a', 'rotation', [key(0, 0, 'bouncy' as never)]),
    ]);
    const errors = validateClip(c, rig);
    for (const needle of ['rig "other"', 'fps', '"ghost"', 'strictly increasing', 'opacity', 'duplicate track', '[x, y]', 'expression "sad"', 'within [0, 1]', 'ease "bouncy"']) {
      expect(errors.join('\n')).toContain(needle);
    }
  });

  test('rejects empty tracks and empty keys', () => {
    expect(validateClip(clip('x', { rig: 'r', duration: 1 }, []), rig)).toContain('clip needs at least one track');
    expect(validateClip(clip('x', { rig: 'r', duration: 1 }, [track('a', 'opacity', [])]), rig).join()).toContain('at least one key');
  });
});
```

- [ ] **Step 2: Write the failing machine tests**

```ts
// packages/ir/src/machine.test.ts
import { describe, expect, test } from 'vitest';
import { clip } from '#ir/clip.ts';
import { machine, validateMachine } from '#ir/machine.ts';
import type { Rig } from '#ir/types.ts';

const rig: Rig = { name: 'r', artboard: { width: 1, height: 1 }, parts: [{ name: 'a', fill: '#000000', pivot: [0, 0], path: 'M0 0Z' }], expressions: {} };
const clips = [clip('idle', { rig: 'r', duration: 1 }, [{ part: 'a', property: 'opacity', keys: [{ t: 0, v: 1 }] }])];

describe('machine', () => {
  test('accepts a consistent machine', () => {
    const m = machine({
      rig: 'r',
      inputs: { react: { type: 'trigger' }, loading: { type: 'bool', default: false }, mood: { type: 'enum', values: ['a', 'b'], default: 'a' } },
      layers: {
        base: {
          entry: 'idle',
          states: { idle: { clip: 'idle', mode: 'loop' }, none: { clip: null, mode: 'once' } },
          transitions: [
            { from: 'idle', to: 'none', when: { input: 'react', fired: true }, duration: 0.2 },
            { from: '*', to: 'idle', when: { input: 'loading', equals: false }, duration: 0 },
          ],
        },
      },
    });
    expect(validateMachine(m, rig, clips)).toEqual([]);
  });

  test('reports unknown states, clips, inputs, and type mismatches', () => {
    const m = machine({
      rig: 'r',
      inputs: { mood: { type: 'enum', values: ['a'], default: 'zzz' } },
      layers: { l: { entry: 'nope', states: { s: { clip: 'missing', mode: 'loop' } }, transitions: [
        { from: 's', to: 'gone', when: { input: 'what', equals: true }, duration: -1 },
        { from: 's', to: 's', when: { input: 'mood', equals: true }, duration: 0 },
      ] } },
    });
    const errors = validateMachine(m, rig, clips).join('\n');
    for (const needle of ['default "zzz"', 'entry "nope"', 'clip "missing"', 'state "gone"', 'input "what"', 'duration', 'enum "mood" must equal a string']) {
      expect(errors).toContain(needle);
    }
  });
});
```

- [ ] **Step 3: Run to verify both fail**

Run: `npx vitest run packages/ir/src/clip.test.ts packages/ir/src/machine.test.ts`
Expected: FAIL on unresolved imports.

- [ ] **Step 4: Write clip.ts**

```ts
// packages/ir/src/clip.ts
import { EASES } from '#ir/easing.ts';
import type { Clip, EaseName, Key, Property, Rig, Track, TrackValue } from '#ir/types.ts';
import { isVec2 } from '#ir/validate.ts';

export const PROPERTIES: Property[] = ['position', 'rotation', 'scale', 'opacity', 'shape'];

export function key<V>(t: number, v: V, ease?: EaseName): Key<V> {
  return ease === undefined ? { t, v } : { t, v, ease };
}

export function track<P extends Property>(part: string, property: P, keys: Key<TrackValue<P>>[]): Track<P> {
  return { part, property, keys };
}

export function clip(
  name: string,
  opts: { rig: string; duration: number; fps?: number; loop?: boolean },
  tracks: Track[],
): Clip {
  return { name, rig: opts.rig, duration: opts.duration, fps: opts.fps ?? 30, loop: opts.loop ?? true, tracks };
}

export function validateClip(c: Clip, rig: Rig): string[] {
  const errors: string[] = [];
  if (!c.name) errors.push('clip.name is required');
  if (c.rig !== rig.name) errors.push(`clip "${c.name}" targets rig "${c.rig}" but was validated against "${rig.name}"`);
  if (!(c.duration > 0)) errors.push('duration must be positive');
  if (!Number.isInteger(c.fps) || c.fps < 1 || c.fps > 120) errors.push('fps must be an integer in 1..120');
  if (c.tracks.length === 0) errors.push('clip needs at least one track');
  const parts = new Set(rig.parts.map((p) => p.name));
  const seen = new Set<string>();
  for (const [i, tr] of c.tracks.entries()) {
    const at = `tracks[${i}] (${tr.part}.${tr.property})`;
    if (!parts.has(tr.part)) errors.push(`${at}: unknown part "${tr.part}"`);
    if (!PROPERTIES.includes(tr.property)) errors.push(`${at}: unknown property`);
    const id = `${tr.part}.${tr.property}`;
    if (seen.has(id)) errors.push(`${at}: duplicate track for ${id}`);
    seen.add(id);
    if (tr.keys.length === 0) errors.push(`${at}: needs at least one key`);
    let last = -Infinity;
    for (const [k, kf] of tr.keys.entries()) {
      const kat = `${at} keys[${k}]`;
      if (!(kf.t >= 0 && kf.t <= c.duration)) errors.push(`${kat}: t=${kf.t} must be within [0, ${c.duration}]`);
      if (!(kf.t > last)) errors.push(`${kat}: key times must be strictly increasing`);
      last = kf.t;
      if (kf.ease !== undefined && !(kf.ease in EASES)) errors.push(`${kat}: unknown ease "${kf.ease}"`);
      errors.push(...valueErrors(tr.property, kf.v, rig).map((e) => `${kat}: ${e}`));
    }
  }
  return errors;
}

function valueErrors(property: Property, v: unknown, rig: Rig): string[] {
  switch (property) {
    case 'position':
    case 'scale':
      return isVec2(v) ? [] : [`${property} value must be [x, y]`];
    case 'rotation':
      return typeof v === 'number' && Number.isFinite(v) ? [] : ['rotation must be a finite number of degrees'];
    case 'opacity':
      return typeof v === 'number' && v >= 0 && v <= 1 ? [] : ['opacity must be a number in 0..1'];
    case 'shape':
      return typeof v === 'string' && (v === 'default' || v in rig.expressions) ? [] : [`unknown expression "${String(v)}"`];
  }
}
```

- [ ] **Step 5: Write machine.ts**

```ts
// packages/ir/src/machine.ts
import type { Clip, Machine, Rig } from '#ir/types.ts';

export function machine(def: Machine): Machine {
  return def;
}

export function validateMachine(m: Machine, rig: Rig, clips: Clip[]): string[] {
  const errors: string[] = [];
  if (m.rig !== rig.name) errors.push(`machine targets rig "${m.rig}" but was validated against "${rig.name}"`);
  for (const [name, input] of Object.entries(m.inputs)) {
    if (input.type === 'enum' && !input.values.includes(input.default)) {
      errors.push(`input "${name}": default "${input.default}" is not one of its values`);
    }
  }
  const clipNames = new Set(clips.map((c) => c.name));
  for (const [layerName, layer] of Object.entries(m.layers)) {
    const at = `layer "${layerName}"`;
    if (!(layer.entry in layer.states)) errors.push(`${at}: entry "${layer.entry}" is not a state`);
    for (const [stateName, state] of Object.entries(layer.states)) {
      if (state.clip !== null && !clipNames.has(state.clip)) errors.push(`${at} state "${stateName}": unknown clip "${state.clip}"`);
    }
    for (const [i, tr] of layer.transitions.entries()) {
      const tat = `${at} transitions[${i}]`;
      if (tr.from !== '*' && !(tr.from in layer.states)) errors.push(`${tat}: unknown state "${tr.from}"`);
      if (!(tr.to in layer.states)) errors.push(`${tat}: unknown state "${tr.to}"`);
      if (!(tr.duration >= 0)) errors.push(`${tat}: duration must be >= 0`);
      const input = m.inputs[tr.when.input];
      if (!input) {
        errors.push(`${tat}: unknown input "${tr.when.input}"`);
        continue;
      }
      if ('fired' in tr.when && input.type !== 'trigger') errors.push(`${tat}: "fired" needs a trigger input`);
      if ('equals' in tr.when) {
        if (input.type === 'trigger') errors.push(`${tat}: trigger "${tr.when.input}" cannot be compared with equals`);
        if (input.type === 'enum' && typeof tr.when.equals !== 'string') errors.push(`${tat}: enum "${tr.when.input}" must equal a string`);
        if (input.type === 'enum' && typeof tr.when.equals === 'string' && !input.values.includes(tr.when.equals)) {
          errors.push(`${tat}: "${tr.when.equals}" is not a value of enum "${tr.when.input}"`);
        }
        if (input.type === 'bool' && typeof tr.when.equals !== 'boolean') errors.push(`${tat}: bool "${tr.when.input}" must equal a boolean`);
      }
    }
  }
  return errors;
}
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run packages/ir`
Expected: all pass (validate 4, easing 6, clip 3, machine 2).

- [ ] **Step 7: Commit**

```bash
git add packages/ir
git commit -m "feat(ir): clip and state-machine DSL with validation"
```

---

### Task 5: Matrix, path, and sampling

**Files:**
- Create: `packages/ir/src/matrix.ts`, `packages/ir/src/path.ts`, `packages/ir/src/sample.ts`, `packages/ir/src/svg.ts`
- Test: `packages/ir/src/matrix.test.ts`, `packages/ir/src/path.test.ts`, `packages/ir/src/sample.test.ts`

**Interfaces:**
- Produces:
  - `IDENTITY`, `multiply(m, n)` (apply n then m), `translate`, `rotate(deg)`, `scale`, `apply(m, p)`, `localMatrix(pivot, position, rotation, scale)`.
  - `parsePath(d): Segment[]`, `serializePath(segs): string`, `interpolatePath(a, b, p): string | null`.
  - `SampledPart { name, fill, d, opacity, matrix }`, `sampleClip(rig, clip, t): SampledPart[]`, `locate(keys, t)`, `sampleNumeric`, `sampleVec2`, `resolvePath(rig, part, expression)`, `wrapTime(clip, t)`, `REST`.
  - `renderStaticSvg(parts, artboard): string`, `ATTRIBUTION`.

- [ ] **Step 1: Write the failing matrix and path tests**

```ts
// packages/ir/src/matrix.test.ts
import { expect, test } from 'vitest';
import { apply, localMatrix, multiply, rotate, translate } from '#ir/matrix.ts';

test('multiply applies the right operand first', () => {
  const m = multiply(translate(10, 0), rotate(90));
  const [x, y] = apply(m, [1, 0]);
  expect(x).toBeCloseTo(10, 6);
  expect(y).toBeCloseTo(1, 6);
});

test('localMatrix rotates and scales about the pivot, then translates', () => {
  const m = localMatrix([5, 5], [1, 2], 90, [2, 2]);
  const [x, y] = apply(m, [6, 5]); // one unit right of pivot -> scaled to 2, rotated to +y, moved by (1,2)
  expect(x).toBeCloseTo(6, 6);
  expect(y).toBeCloseTo(9, 6);
});
```

```ts
// packages/ir/src/path.test.ts
import { expect, test } from 'vitest';
import { interpolatePath, parsePath, serializePath } from '#ir/path.ts';

test('parses implicit repeated commands the way svgpath prints them', () => {
  expect(parsePath('M1 2L3 4 5 6C1 1 2 2 3 3 4 4 5 5 6 6Z')).toEqual([
    ['M', 1, 2], ['L', 3, 4], ['L', 5, 6], ['C', 1, 1, 2, 2, 3, 3], ['C', 4, 4, 5, 5, 6, 6], ['Z'],
  ]);
});

test('parses the attached-negative form svgpath prints', () => {
  expect(parsePath('M-10 0L0 0 0 10-10 10Z')).toEqual([['M', -10, 0], ['L', 0, 0], ['L', 0, 10], ['L', -10, 10], ['Z']]);
});

test('serializes with trimmed decimals', () => {
  expect(serializePath([['M', 1.005, 2], ['L', 3.5, -4.123456], ['Z']])).toBe('M1 2L3.5 -4.12Z');
});

test('rejects relative and unsupported commands', () => {
  expect(() => parsePath('m1 2')).toThrow(/absolute/);
  expect(() => parsePath('M1 2A1 1 0 0 0 3 4')).toThrow(/unsupported/);
});

test('interpolates compatible paths and returns null otherwise', () => {
  expect(interpolatePath('M0 0L10 0Z', 'M0 0L20 10Z', 0.5)).toBe('M0 0L15 5Z');
  expect(interpolatePath('M0 0L10 0Z', 'M0 0C1 1 2 2 3 3Z', 0.5)).toBeNull();
});
```

- [ ] **Step 2: Write matrix.ts and path.ts**

```ts
// packages/ir/src/matrix.ts
import type { Matrix, Vec2 } from '#ir/types.ts';

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** m · n : apply n first, then m. */
export function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export const translate = (x: number, y: number): Matrix => [1, 0, 0, 1, x, y];
export const scale = (sx: number, sy: number): Matrix => [sx, 0, 0, sy, 0, 0];

export function rotate(deg: number): Matrix {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, s, -s, c, 0, 0];
}

export function apply(m: Matrix, p: Vec2): Vec2 {
  return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
}

/** translate(position) · translate(pivot) · rotate · scale · translate(-pivot): the CSS transform-origin model. */
export function localMatrix(pivot: Vec2, position: Vec2, rotation: number, sc: Vec2): Matrix {
  let m = translate(position[0] + pivot[0], position[1] + pivot[1]);
  m = multiply(m, rotate(rotation));
  m = multiply(m, scale(sc[0], sc[1]));
  return multiply(m, translate(-pivot[0], -pivot[1]));
}
```

```ts
// packages/ir/src/path.ts
export type Segment =
  | ['M', number, number]
  | ['L', number, number]
  | ['C', number, number, number, number, number, number]
  | ['Z'];

const TOKEN = /[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g;

/** Parses absolute M/L/C/Z path data, including svgpath's implicit command repetition ("L1 2 3 4"). */
export function parsePath(d: string): Segment[] {
  const tokens = d.match(TOKEN) ?? [];
  const out: Segment[] = [];
  let i = 0;
  let cmd = '';
  const num = (): number => {
    const v = Number(tokens[i++]);
    if (!Number.isFinite(v)) throw new Error(`path: expected a number at token ${i - 1} in "${d.slice(0, 40)}"`);
    return v;
  };
  while (i < tokens.length) {
    const tk = tokens[i];
    if (/[A-Za-z]/.test(tk)) {
      if (tk !== tk.toUpperCase()) throw new Error(`path: relative command "${tk}" not allowed; rig paths are absolute`);
      if (!'MLCZ'.includes(tk)) throw new Error(`path: unsupported command "${tk}"; use M, L, C, Z`);
      cmd = tk;
      i++;
      if (cmd === 'Z') {
        out.push(['Z']);
        cmd = '';
      }
      continue;
    }
    if (cmd === 'M') {
      out.push(['M', num(), num()]);
      cmd = 'L';
    } else if (cmd === 'L') {
      out.push(['L', num(), num()]);
    } else if (cmd === 'C') {
      out.push(['C', num(), num(), num(), num(), num(), num()]);
    } else {
      throw new Error(`path: number without a command in "${d.slice(0, 40)}"`);
    }
  }
  return out;
}

const fmt = (n: number, precision: number) => String(Number(n.toFixed(precision)));

export function serializePath(segs: Segment[], precision = 2): string {
  return segs.map((s) => s[0] + (s.slice(1) as number[]).map((n) => fmt(n, precision)).join(' ')).join('');
}

/** Linear blend of two paths with identical command sequences; null when they differ. */
export function interpolatePath(a: string, b: string, p: number): string | null {
  const sa = parsePath(a);
  const sb = parsePath(b);
  if (sa.length !== sb.length) return null;
  const out: Segment[] = [];
  for (let i = 0; i < sa.length; i++) {
    const x = sa[i];
    const y = sb[i];
    if (x[0] !== y[0]) return null;
    const nums = (x.slice(1) as number[]).map((v, k) => v + ((y as number[])[k + 1] - v) * p);
    out.push([x[0], ...nums] as Segment);
  }
  return serializePath(out);
}
```

- [ ] **Step 3: Run matrix and path tests**

Run: `npx vitest run packages/ir/src/matrix.test.ts packages/ir/src/path.test.ts`
Expected: 7 passed.

- [ ] **Step 4: Write the failing sample tests**

```ts
// packages/ir/src/sample.test.ts
import { describe, expect, test } from 'vitest';
import { clip, key, track } from '#ir/clip.ts';
import { apply } from '#ir/matrix.ts';
import { locate, sampleClip } from '#ir/sample.ts';
import type { Rig } from '#ir/types.ts';

const rig: Rig = {
  name: 'r',
  artboard: { width: 100, height: 100 },
  parts: [
    { name: 'body', fill: '#000000', pivot: [50, 50], path: 'M0 0L100 0L100 100L0 100Z' },
    { name: 'eye', fill: '#ffffff', pivot: [30, 30], parent: 'body', path: 'M20 20L40 20L40 40Z' },
    { name: 'tear', fill: '#ffffff', pivot: [0, 0], parent: 'body', path: null },
  ],
  expressions: {
    normal: {},
    wide: { eye: 'M10 20L50 20L50 40Z' },
    cry: { eye: 'M20 20C1 1 2 2 3 3Z', tear: 'M0 0L1 0L1 1Z' },
  },
};

describe('locate', () => {
  const keys = [key(1, 0), key(3, 10, 'easeInOut')];
  test('holds before the first and after the last key', () => {
    expect(locate(keys, 0)).toMatchObject({ from: keys[0], to: keys[0], p: 0 });
    expect(locate(keys, 9)).toMatchObject({ from: keys[1], to: keys[1], p: 0 });
  });
  test('eases into the target key', () => {
    expect(locate(keys, 2).p).toBeCloseTo(0.5, 4);
    expect(locate(keys, 1.5).p).toBeLessThan(0.25);
  });
});

describe('sampleClip', () => {
  test('rest pose is identity with default paths, hidden parts omitted', () => {
    const c = clip('c', { rig: 'r', duration: 1 }, [track('body', 'opacity', [key(0, 1)])]);
    const parts = sampleClip(rig, c, 0);
    expect(parts.map((p) => p.name)).toEqual(['body', 'eye']);
    expect(parts[0].matrix).toEqual([1, 0, 0, 1, 0, 0]);
    expect(parts[1].d).toBe('M20 20L40 20L40 40Z');
  });

  test('children inherit the parent transform', () => {
    const c = clip('c', { rig: 'r', duration: 2 }, [track('body', 'rotation', [key(0, 0), key(2, 180)])]);
    const eye = sampleClip(rig, c, 1).find((p) => p.name === 'eye')!;
    const [x, y] = apply(eye.matrix, [30, 30]); // body pivot 50,50 rotated 90deg: (30,30) -> (70,30)
    expect(x).toBeCloseTo(70, 6);
    expect(y).toBeCloseTo(30, 6);
  });

  test('loop wraps time, non-loop clamps', () => {
    const tracks = [track('body', 'opacity', [key(0, 0), key(1, 1)])];
    expect(sampleClip(rig, clip('l', { rig: 'r', duration: 1 }, tracks), 1.25)[0].opacity).toBeCloseTo(0.25, 6);
    expect(sampleClip(rig, clip('o', { rig: 'r', duration: 1, loop: false }, tracks), 5)[0].opacity).toBe(1);
  });

  test('compatible shapes morph, incompatible ones crossfade', () => {
    const morph = clip('m', { rig: 'r', duration: 1 }, [track('eye', 'shape', [key(0, 'normal'), key(1, 'wide')])]);
    expect(sampleClip(rig, morph, 0.5).find((p) => p.name === 'eye')!.d).toBe('M15 20L45 20L45 40Z');

    const fade = clip('f', { rig: 'r', duration: 1 }, [track('eye', 'shape', [key(0, 'normal'), key(1, 'cry')])]);
    const eyes = sampleClip(rig, fade, 0.25).filter((p) => p.name === 'eye');
    expect(eyes.map((p) => p.opacity)).toEqual([0.75, 0.25]);
  });

  test('hidden-by-default parts appear when an expression provides a path', () => {
    const c = clip('t', { rig: 'r', duration: 1 }, [track('tear', 'shape', [key(0, 'normal'), key(1, 'cry')])]);
    expect(sampleClip(rig, c, 0).some((p) => p.name === 'tear')).toBe(false);
    const tear = sampleClip(rig, c, 0.5).find((p) => p.name === 'tear')!;
    expect(tear.opacity).toBeCloseTo(0.5, 6);
  });

  test('part opacity multiplies crossfade opacity', () => {
    const c = clip('t', { rig: 'r', duration: 1 }, [
      track('eye', 'shape', [key(0, 'normal'), key(1, 'cry')]),
      track('eye', 'opacity', [key(0, 0.5)]),
    ]);
    expect(sampleClip(rig, c, 0.5).filter((p) => p.name === 'eye').map((p) => p.opacity)).toEqual([0.25, 0.25]);
  });
});
```

- [ ] **Step 5: Write sample.ts and svg.ts**

```ts
// packages/ir/src/sample.ts
import { easeValue } from '#ir/easing.ts';
import { IDENTITY, localMatrix, multiply } from '#ir/matrix.ts';
import { interpolatePath } from '#ir/path.ts';
import type { Clip, Key, Matrix, Property, Rig, RigPart, Track, Vec2 } from '#ir/types.ts';

export interface SampledPart {
  name: string;
  fill: string;
  d: string;
  opacity: number;
  matrix: Matrix;
}

export const REST = { position: [0, 0] as Vec2, rotation: 0, scale: [1, 1] as Vec2, opacity: 1, shape: 'default' };

/** The keys around t and the eased progress from `from` to `to`. Holds outside the key range. */
export function locate<V>(keys: Key<V>[], t: number): { from: Key<V>; to: Key<V>; p: number } {
  if (t <= keys[0].t) return { from: keys[0], to: keys[0], p: 0 };
  const last = keys[keys.length - 1];
  if (t >= last.t) return { from: last, to: last, p: 0 };
  let i = 0;
  while (keys[i + 1].t <= t) i++;
  const from = keys[i];
  const to = keys[i + 1];
  return { from, to, p: easeValue(to.ease ?? 'linear', (t - from.t) / (to.t - from.t)) };
}

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

export function sampleNumeric(track: Track<'rotation' | 'opacity'>, t: number): number {
  const { from, to, p } = locate(track.keys, t);
  return lerp(from.v, to.v, p);
}

export function sampleVec2(track: Track<'position' | 'scale'>, t: number): Vec2 {
  const { from, to, p } = locate(track.keys, t);
  return [lerp(from.v[0], to.v[0], p), lerp(from.v[1], to.v[1], p)];
}

export function wrapTime(clip: Clip, t: number): number {
  if (clip.loop) return ((t % clip.duration) + clip.duration) % clip.duration;
  return Math.min(Math.max(t, 0), clip.duration);
}

export function resolvePath(rig: Rig, part: RigPart, expression: string): string | null {
  if (expression === 'default') return part.path;
  const e = rig.expressions[expression];
  if (!e) throw new Error(`unknown expression "${expression}" in rig "${rig.name}"`);
  return e[part.name] === undefined ? part.path : e[part.name];
}

export type TracksByProperty = Partial<{ [P in Property]: Track<P> }>;

export function groupTracks(clip: Clip): Map<string, TracksByProperty> {
  const byPart = new Map<string, TracksByProperty>();
  for (const tr of clip.tracks) {
    const m = byPart.get(tr.part) ?? {};
    (m as Record<string, Track>)[tr.property] = tr;
    byPart.set(tr.part, m);
  }
  return byPart;
}

/** Shape of a part at time t: one entry (static or morphed) or two entries crossfading. */
export function sampleShape(rig: Rig, part: RigPart, track: Track<'shape'> | undefined, t: number): { d: string; opacity: number }[] {
  if (!track) return part.path ? [{ d: part.path, opacity: 1 }] : [];
  const { from, to, p } = locate(track.keys, t);
  const a = resolvePath(rig, part, from.v);
  const b = resolvePath(rig, part, to.v);
  if (p === 0 || from.v === to.v) return a ? [{ d: a, opacity: 1 }] : [];
  if (a && b) {
    const m = interpolatePath(a, b, p);
    if (m) return [{ d: m, opacity: 1 }];
  }
  const out: { d: string; opacity: number }[] = [];
  if (a) out.push({ d: a, opacity: 1 - p });
  if (b) out.push({ d: b, opacity: p });
  return out;
}

export function sampleClip(rig: Rig, clip: Clip, time: number): SampledPart[] {
  const t = wrapTime(clip, time);
  const byPart = groupTracks(clip);
  const world = new Map<string, Matrix>();
  const out: SampledPart[] = [];
  for (const part of rig.parts) {
    const tracks = byPart.get(part.name) ?? {};
    const position = tracks.position ? sampleVec2(tracks.position, t) : REST.position;
    const rotation = tracks.rotation ? sampleNumeric(tracks.rotation, t) : REST.rotation;
    const sc = tracks.scale ? sampleVec2(tracks.scale, t) : REST.scale;
    const opacity = tracks.opacity ? sampleNumeric(tracks.opacity, t) : REST.opacity;
    const parent = part.parent ? world.get(part.parent) : undefined;
    const matrix = multiply(parent ?? IDENTITY, localMatrix(part.pivot, position, rotation, sc));
    world.set(part.name, matrix);
    for (const shape of sampleShape(rig, part, tracks.shape, t)) {
      const o = opacity * shape.opacity;
      if (o <= 0) continue;
      out.push({ name: part.name, fill: part.fill, d: shape.d, opacity: o, matrix });
    }
  }
  return out;
}
```

```ts
// packages/ir/src/svg.ts
import type { SampledPart } from '#ir/sample.ts';

export const ATTRIBUTION =
  "pubnyan, the Hackers' Pub mascot, by Bak Eunji. CC BY-SA 4.0. https://github.com/hackers-pub/visual-identity";

const fmt = (n: number) => String(Number(n.toFixed(4)));

/** A static SVG of sampled parts: the reference every exporter is compared against. */
export function renderStaticSvg(parts: SampledPart[], artboard: { width: number; height: number }): string {
  const body = parts
    .map((p) => {
      const opacity = p.opacity < 1 ? ` opacity="${fmt(p.opacity)}"` : '';
      return `<path d="${p.d}" fill="${p.fill}"${opacity} transform="matrix(${p.matrix.map(fmt).join(' ')})"/>`;
    })
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${artboard.width} ${artboard.height}" width="${artboard.width}" height="${artboard.height}">\n<desc>${ATTRIBUTION}</desc>\n${body}\n</svg>`;
}
```

- [ ] **Step 6: Run all ir tests and the type check**

Run: `npx vitest run packages/ir && npm run check:types`
Expected: all pass; tsc silent.

- [ ] **Step 7: Commit**

```bash
git add packages/ir
git commit -m "feat(ir): affine math, path morphing, clip sampling, static SVG reference"
```


---

### Task 6: Read source SVGs into world-space subpaths

**Files:**
- Create: `packages/rig-extract/src/svg-source.ts`
- Test: `packages/rig-extract/src/svg-source.test.ts`

**Interfaces:**
- Produces: `SourceSubpath { d: string; bbox: [minX, minY, maxX, maxY] }`, `SourcePath { id: string; fill: string; subpaths: SourceSubpath[] }`, `readSourceSvg(xml: string): SourcePath[]`, `splitSubpaths(d: string): SourceSubpath[]`.
- Behaviour: composes every ancestor `transform` (innermost first), converts to absolute M/L/C/Z rounded to 2 decimals, splits on `M`, appends `Z` to unclosed subpaths, drops subpaths whose bbox area is below 1 (export artifacts), skips paths inside `clipPath`, `defs`, `mask`, `symbol`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/rig-extract/src/svg-source.test.ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/rig-extract`
Expected: FAIL, cannot resolve `#rig-extract/svg-source.ts`.

- [ ] **Step 3: Write svg-source.ts**

```ts
// packages/rig-extract/src/svg-source.ts
import { DOMParser } from '@xmldom/xmldom';
import { svgPathBbox } from 'svg-path-bbox';
import svgpath from 'svgpath';

export interface SourceSubpath {
  d: string;
  bbox: [number, number, number, number];
}

export interface SourcePath {
  id: string;
  fill: string;
  subpaths: SourceSubpath[];
}

const SKIP_ANCESTORS = new Set(['clipPath', 'defs', 'mask', 'symbol']);
const round2 = (n: number) => Number(n.toFixed(2));

export function readSourceSvg(xml: string): SourcePath[] {
  const doc = new DOMParser().parseFromString(xml, 'image/svg+xml');
  const out: SourcePath[] = [];
  const paths = doc.getElementsByTagName('path');
  for (let i = 0; i < paths.length; i++) {
    const el = paths.item(i)!;
    const transforms: string[] = [];
    let skip = false;
    for (let n: Node | null = el; n && n.nodeType === 1; n = n.parentNode) {
      const e = n as Element;
      if (SKIP_ANCESTORS.has(e.localName ?? e.nodeName)) {
        skip = true;
        break;
      }
      const tf = e.getAttribute('transform');
      if (tf) transforms.push(tf);
    }
    const d = el.getAttribute('d');
    if (skip || !d) continue;
    let p = svgpath(d);
    for (const tf of transforms) p = p.transform(tf);
    const absolute = p.abs().unshort().unarc().round(2).toString();
    out.push({ id: el.getAttribute('id') ?? `path-${i}`, fill: readFill(el), subpaths: splitSubpaths(absolute) });
  }
  return out;
}

function readFill(el: Element): string {
  const style = el.getAttribute('style') ?? '';
  const fromStyle = /(?:^|;)\s*fill\s*:\s*(#[0-9a-f]{6})/i.exec(style)?.[1];
  const fill = fromStyle ?? el.getAttribute('fill') ?? '#000000';
  return fill.toLowerCase();
}

/** Splits absolute path data on M, closes each subpath, drops zero-area artifacts. */
export function splitSubpaths(d: string): SourceSubpath[] {
  const groups: string[][] = [];
  svgpath(d).iterate((seg) => {
    const text = seg[0] + seg.slice(1).join(' ');
    if (seg[0] === 'M') groups.push([]);
    groups[groups.length - 1].push(text);
  });
  const out: SourceSubpath[] = [];
  for (const g of groups) {
    let sub = g.join('');
    if (!sub.endsWith('Z')) sub += 'Z';
    const [minX, minY, maxX, maxY] = svgPathBbox(sub).map(round2) as [number, number, number, number];
    if ((maxX - minX) * (maxY - minY) < 1) continue;
    out.push({ d: sub, bbox: [minX, minY, maxX, maxY] });
  }
  return out;
}
```

- [ ] **Step 4: Run tests and type check**

Run: `npx vitest run packages/rig-extract && npm run check:types`
Expected: 2 passed; tsc silent. If tsc complains about `seg.slice(1).join`, cast: `(seg as unknown as (string | number)[]).slice(1)`.

- [ ] **Step 5: Commit**

```bash
git add packages/rig-extract
git commit -m "feat(rig-extract): read Inkscape SVG paths into world-space subpaths"
```

---

### Task 7: Parts map selectors and rig building

**Files:**
- Create: `packages/rig-extract/src/parts-map.ts`, `packages/rig-extract/src/build-rig.ts`
- Test: `packages/rig-extract/src/build-rig.test.ts`

**Interfaces:**
- Consumes: `SourcePath` from Task 6; `Rig`, `RigPart`, `Vec2` from Task 2.
- Produces:
  - `PartsMap { source: string; rigs: Record<string, PartsMapRig> }`, `PartsMapRig { artboard; default: string; align?: { part: string }; parts: PartsMapPart[]; expressions: Record<string, { file: string; map: Record<string, string | string[]> }> }`, `PartsMapPart { name; fill; parent?; pivot? }`.
  - `selectPath(paths: SourcePath[], selector: string | string[]): string` with selectors `id`, `id#outer`, `id#rest`, `id#<n>`.
  - `buildRig(name: string, def: PartsMapRig, files: Record<string, SourcePath[]>): Rig`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/rig-extract/src/build-rig.test.ts
import { describe, expect, test } from 'vitest';
import { parsePath } from '#ir/path.ts';
import { validateRig } from '#ir/validate.ts';
import { buildRig } from '#rig-extract/build-rig.ts';
import { selectPath, type PartsMapRig } from '#rig-extract/parts-map.ts';
import type { SourcePath } from '#rig-extract/svg-source.ts';

const square: SourcePath = {
  id: 'p1', fill: '#000000',
  subpaths: [
    { d: 'M0 0L10 0L10 10L0 10Z', bbox: [0, 0, 10, 10] },
    { d: 'M2 2L4 2L4 4Z', bbox: [2, 2, 4, 4] },
  ],
};
const noseA: SourcePath = { id: 'n', fill: '#000000', subpaths: [{ d: 'M4 4L6 4L6 6L4 6Z', bbox: [4, 4, 6, 6] }] };
const noseB: SourcePath = { id: 'n', fill: '#000000', subpaths: [{ d: 'M14 4L16 4L16 6L14 6Z', bbox: [14, 4, 16, 6] }] };
const files = { 'a.svg': [square, noseA], 'b.svg': [square, noseB] };

const def: PartsMapRig = {
  artboard: { width: 20, height: 20 },
  default: 'normal',
  align: { part: 'nose' },
  parts: [
    { name: 'body', fill: '#000000', pivot: [5, 10] },
    { name: 'hole', fill: '#ffffff', parent: 'body' },
    { name: 'nose', fill: '#000000', parent: 'body' },
    { name: 'extra', fill: '#ffffff', parent: 'body' },
  ],
  expressions: {
    normal: { file: 'a.svg', map: { body: 'p1#outer', hole: 'p1#rest', nose: 'n' } },
    shifted: { file: 'b.svg', map: { body: 'p1#outer', nose: 'n', extra: ['p1#1', 'n'] } },
  },
};

describe('selectPath', () => {
  test('outer, rest, index, whole, list', () => {
    expect(selectPath([square], 'p1#outer')).toBe('M0 0L10 0L10 10L0 10Z');
    expect(selectPath([square], 'p1#rest')).toBe('M2 2L4 2L4 4Z');
    expect(selectPath([square], 'p1#1')).toBe('M2 2L4 2L4 4Z');
    expect(selectPath([square], 'p1')).toBe('M0 0L10 0L10 10L0 10ZM2 2L4 2L4 4Z');
    expect(selectPath([square, noseA], ['p1#1', 'n'])).toBe('M2 2L4 2L4 4ZM4 4L6 4L6 6L4 6Z');
  });
  test('errors name the selector', () => {
    expect(() => selectPath([square], 'zzz#outer')).toThrow(/no path with id "zzz"/);
    expect(() => selectPath([square], 'p1#9')).toThrow(/out of range/);
  });
});

describe('buildRig', () => {
  const rig = buildRig('t', def, files);
  test('produces a valid rig with parts in order, default paths, pivots, hierarchy', () => {
    expect(validateRig(rig)).toEqual([]);
    expect(rig.parts.map((p) => p.name)).toEqual(['body', 'hole', 'nose', 'extra']);
    expect(rig.parts[0]).toEqual({ name: 'body', fill: '#000000', pivot: [5, 10], path: 'M0 0L10 0L10 10L0 10Z' });
    expect(rig.parts[1]).toEqual({ name: 'hole', fill: '#ffffff', pivot: [3, 3], parent: 'body', path: 'M2 2L4 2L4 4Z' });
    expect(rig.parts[3].path).toBeNull();
    expect(rig.parts[3].pivot).toEqual([0, 0]);
  });
  test('records every expression fully, aligning on the align part', () => {
    expect(Object.keys(rig.expressions)).toEqual(['normal', 'shifted']);
    expect(rig.expressions.normal.extra).toBeNull();
    expect(rig.expressions.shifted.hole).toBeNull();
    expect(parsePath(rig.expressions.shifted.nose!)[0]).toEqual(['M', 4, 4]); // shifted by -10 to match normal's nose
    expect(parsePath(rig.expressions.shifted.body!)[1]).toEqual(['L', 0, 0]); // whole expression shifted together
    expect(parsePath(rig.expressions.shifted.extra!)).toHaveLength(9); // 4 segments + 5 segments
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/rig-extract/src/build-rig.test.ts`
Expected: FAIL, unresolved imports.

- [ ] **Step 3: Write parts-map.ts**

```ts
// packages/rig-extract/src/parts-map.ts
import type { Vec2 } from '#ir/types.ts';
import type { SourcePath, SourceSubpath } from '#rig-extract/svg-source.ts';

export interface PartsMapPart {
  name: string;
  fill: string;
  parent?: string;
  /** Defaults to the bbox centre of the part's default path. */
  pivot?: Vec2;
}

export interface PartsMapExpression {
  /** File name inside `source`. */
  file: string;
  /** part name -> selector(s). Unmapped parts are hidden in this expression. */
  map: Record<string, string | string[]>;
}

export interface PartsMapRig {
  artboard: { width: number; height: number };
  /** Expression whose paths become the parts' default paths. */
  default: string;
  /** Translate every other expression so this part's bbox centre matches the default expression. */
  align?: { part: string };
  parts: PartsMapPart[];
  expressions: Record<string, PartsMapExpression>;
}

export interface PartsMap {
  source: string;
  rigs: Record<string, PartsMapRig>;
}

const area = (s: SourceSubpath) => (s.bbox[2] - s.bbox[0]) * (s.bbox[3] - s.bbox[1]);

/**
 * Selector grammar: `id` (all subpaths), `id#outer` (largest bbox), `id#rest` (all but outer), `id#<n>` (nth).
 * A list of selectors concatenates.
 */
export function selectPath(paths: SourcePath[], selector: string | string[]): string {
  if (Array.isArray(selector)) return selector.map((s) => selectPath(paths, s)).join('');
  const [id, which = 'all'] = selector.split('#');
  const path = paths.find((p) => p.id === id);
  if (!path) throw new Error(`selector "${selector}": no path with id "${id}"`);
  const subs = path.subpaths;
  if (subs.length === 0) throw new Error(`selector "${selector}": path has no usable subpaths`);
  const outer = subs.reduce((a, b) => (area(b) > area(a) ? b : a));
  let chosen: SourceSubpath[];
  if (which === 'all') chosen = subs;
  else if (which === 'outer') chosen = [outer];
  else if (which === 'rest') chosen = subs.filter((s) => s !== outer);
  else {
    const n = Number(which);
    if (!Number.isInteger(n) || n < 0 || n >= subs.length) {
      throw new Error(`selector "${selector}": subpath index out of range (0..${subs.length - 1})`);
    }
    chosen = [subs[n]];
  }
  if (chosen.length === 0) throw new Error(`selector "${selector}" selected nothing`);
  return chosen.map((s) => s.d).join('');
}
```

- [ ] **Step 4: Write build-rig.ts**

```ts
// packages/rig-extract/src/build-rig.ts
import { svgPathBbox } from 'svg-path-bbox';
import svgpath from 'svgpath';
import type { Rig, RigPart, Vec2 } from '#ir/types.ts';
import { selectPath, type PartsMapRig } from '#rig-extract/parts-map.ts';
import type { SourcePath } from '#rig-extract/svg-source.ts';

const round2 = (n: number) => Number(n.toFixed(2));

function center(d: string): Vec2 {
  const [minX, minY, maxX, maxY] = svgPathBbox(d);
  return [round2((minX + maxX) / 2), round2((minY + maxY) / 2)];
}

export function buildRig(name: string, def: PartsMapRig, files: Record<string, SourcePath[]>): Rig {
  const expressions: Record<string, Record<string, string | null>> = {};
  for (const [expr, e] of Object.entries(def.expressions)) {
    const paths = files[e.file];
    if (!paths) throw new Error(`expression "${expr}": file "${e.file}" was not loaded`);
    const map: Record<string, string | null> = {};
    for (const part of def.parts) {
      const sel = e.map[part.name];
      map[part.name] = sel === undefined ? null : selectPath(paths, sel);
    }
    for (const mapped of Object.keys(e.map)) {
      if (!def.parts.some((p) => p.name === mapped)) throw new Error(`expression "${expr}" maps unknown part "${mapped}"`);
    }
    expressions[expr] = map;
  }
  const base = expressions[def.default];
  if (!base) throw new Error(`default expression "${def.default}" is not defined`);

  if (def.align) {
    const refPath = base[def.align.part];
    if (!refPath) throw new Error(`align part "${def.align.part}" is hidden in the default expression`);
    const ref = center(refPath);
    for (const [expr, map] of Object.entries(expressions)) {
      if (expr === def.default) continue;
      const own = map[def.align.part];
      if (!own) throw new Error(`align part "${def.align.part}" is hidden in expression "${expr}"`);
      const c = center(own);
      const dx = ref[0] - c[0];
      const dy = ref[1] - c[1];
      for (const part of Object.keys(map)) {
        const d = map[part];
        if (d) map[part] = svgpath(d).translate(dx, dy).round(2).toString();
      }
    }
  }

  const parts: RigPart[] = def.parts.map((p) => {
    const path = base[p.name];
    const part: RigPart = { name: p.name, fill: p.fill, pivot: p.pivot ?? (path ? center(path) : [0, 0]), path };
    if (p.parent !== undefined) part.parent = p.parent;
    return part;
  });
  return { name, artboard: def.artboard, parts, expressions };
}
```

- [ ] **Step 5: Run tests and type check**

Run: `npx vitest run packages/rig-extract && npm run check:types`
Expected: 4 passed; tsc silent. Note: `toEqual` treats a missing `parent` key and `parent: undefined` the same, which is why `part.parent` is only set when defined (keeps the JSON clean).

- [ ] **Step 6: Commit**

```bash
git add packages/rig-extract
git commit -m "feat(rig-extract): selectors and rig building with nose alignment"
```

---

### Task 8: Headless renderer, extract/inspect CLI, and the pubnyan parts map

**Files:**
- Create: `packages/verify/src/renderer.ts`, `packages/rig-extract/src/inspect.ts`, `packages/rig-extract/src/cli.ts`, `rig/parts.map.json`, `rig/README.md`
- Modify: `packages/ir/src/sample.ts` (add `staticParts`)
- Generated and committed: `rig/pubnyan.rig.json`, `rig/starorbit.rig.json`, `rig/preview/*.svg`
- Test: `packages/verify/src/renderer.test.ts`

**Interfaces:**
- Produces: `class Renderer { static launch(): Promise<Renderer>; renderSvg(svg, width, height, pauseAtMs?): Promise<Buffer>; renderHtml(html, width, height, pauseAtMs?): Promise<Buffer>; renderPage(html, width?): Promise<Buffer>; close(): Promise<void> }`; `staticParts(rig, expression): SampledPart[]`; `inspectSvg(paths: SourcePath[]): string` (montage SVG); scripts `rig:extract`, `rig:inspect`.

- [ ] **Step 1: Write the renderer and its test**

```ts
// packages/verify/src/renderer.ts
import puppeteer, { type Browser, type Page } from 'puppeteer';

/** One headless Chrome page reused for every frame. Pages always get an explicit white background. */
export class Renderer {
  private constructor(private readonly browser: Browser, private readonly page: Page) {}

  static async launch(): Promise<Renderer> {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    return new Renderer(browser, page);
  }

  async renderHtml(html: string, width: number, height: number, pauseAtMs?: number): Promise<Buffer> {
    const w = Math.ceil(width);
    const h = Math.ceil(height);
    await this.page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await this.page.setContent(`<!doctype html><html><body style="margin:0;background:#fff">${html}</body></html>`);
    if (pauseAtMs !== undefined) {
      await this.page.evaluate((ms) => {
        for (const a of document.getAnimations()) {
          a.pause();
          a.currentTime = ms;
        }
      }, pauseAtMs);
    }
    return Buffer.from(await this.page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: w, height: h } }));
  }

  renderSvg(svg: string, width: number, height: number, pauseAtMs?: number): Promise<Buffer> {
    return this.renderHtml(svg, width, height, pauseAtMs);
  }

  /** Full-page screenshot, for contact sheets and montages. */
  async renderPage(html: string, width = 1400): Promise<Buffer> {
    await this.page.setViewport({ width, height: 800, deviceScaleFactor: 1 });
    await this.page.setContent(`<!doctype html><html><body style="margin:0;background:#fff">${html}</body></html>`);
    return Buffer.from(await this.page.screenshot({ type: 'png', fullPage: true }));
  }

  async close(): Promise<void> {
    await this.browser.close();
  }
}
```

```ts
// packages/verify/src/renderer.test.ts
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
```

Run: `npx vitest run packages/verify`
Expected: 1 passed (Chrome launches; first run may take a few seconds).

- [ ] **Step 2: Add staticParts to sample.ts**

Append to `packages/ir/src/sample.ts`:

```ts
/** Every visible part of an expression at rest: identity transforms, full opacity. */
export function staticParts(rig: Rig, expression: string): SampledPart[] {
  const out: SampledPart[] = [];
  for (const part of rig.parts) {
    const d = resolvePath(rig, part, expression);
    if (d) out.push({ name: part.name, fill: part.fill, d, opacity: 1, matrix: IDENTITY });
  }
  return out;
}
```

- [ ] **Step 3: Write inspect.ts**

```ts
// packages/rig-extract/src/inspect.ts
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
```

- [ ] **Step 4: Write cli.ts**

```ts
// packages/rig-extract/src/cli.ts
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
  const load = async (file: string) => {
    if (!cache.has(file)) cache.set(file, readSourceSvg(await readFile(join(ROOT, map.source, file), 'utf8')));
    return cache.get(file)!;
  };
  const renderer = await Renderer.launch();
  try {
    for (const [name, def] of Object.entries(map.rigs)) {
      const files: Record<string, SourcePath[]> = {};
      for (const e of Object.values(def.expressions)) files[e.file] = await load(e.file);
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
```

- [ ] **Step 5: Inspect the source files and confirm the selector table**

Run:
```bash
npm run rig:inspect -- vendor/visual-identity/exports/pubnyan-normal-transparent.svg
npm run rig:inspect -- vendor/visual-identity/exports/pubnyan-cry-transparent.svg
npm run rig:inspect -- vendor/visual-identity/exports/starorbit-transparent-287x202.svg
```
Open `rig/inspect/pubnyan-normal-transparent.png` and check the highlighted subpaths against the table in "Source artwork facts" (e.g. `path17#5` is the big silhouette, `path7#2` the white star face). Do the same for cry (`path61#0` tear-l, `path67#0` tear-r). If a subpath index differs from the table, fix the selector in the next step, not the table.

- [ ] **Step 6: Write rig/parts.map.json**

```json
{
  "source": "vendor/visual-identity/exports",
  "rigs": {
    "pubnyan": {
      "artboard": { "width": 374, "height": 319 },
      "default": "normal",
      "align": { "part": "nose" },
      "parts": [
        { "name": "body", "fill": "#000000", "pivot": [187, 314] },
        { "name": "face", "fill": "#ffffff", "parent": "body" },
        { "name": "eye-l.white", "fill": "#ffffff", "parent": "body" },
        { "name": "eye-r.white", "fill": "#ffffff", "parent": "body" },
        { "name": "ring-gap-l", "fill": "#ffffff", "parent": "body" },
        { "name": "ring-gap-r", "fill": "#ffffff", "parent": "body" },
        { "name": "tear-l", "fill": "#ffffff", "parent": "body" },
        { "name": "tear-r", "fill": "#ffffff", "parent": "body" },
        { "name": "eye-l.pupil", "fill": "#000000", "parent": "body" },
        { "name": "eye-r.pupil", "fill": "#000000", "parent": "body" },
        { "name": "nose", "fill": "#000000", "parent": "body" },
        { "name": "mouth", "fill": "#000000", "parent": "body" }
      ],
      "expressions": {
        "normal": {
          "file": "pubnyan-normal-transparent.svg",
          "map": {
            "body": "path17#outer", "face": "path7#outer",
            "eye-l.white": "path11#outer", "eye-r.white": "path9#outer",
            "ring-gap-l": "path15", "ring-gap-r": "path13",
            "eye-l.pupil": "path21", "eye-r.pupil": "path19",
            "nose": "path23", "mouth": "path25"
          }
        },
        "angry": {
          "file": "pubnyan-angry-transparent.svg",
          "map": {
            "body": "path55#outer", "face": "path45#outer",
            "eye-l.white": "path47#outer", "eye-r.white": "path43#outer",
            "ring-gap-l": "path53", "ring-gap-r": "path51",
            "nose": "path49", "mouth": "path57"
          }
        },
        "curious": {
          "file": "pubnyan-curious-transparent.svg",
          "map": {
            "body": "path37#outer", "face": "path31#outer",
            "eye-l.white": "path27#outer", "eye-r.white": "path29#outer",
            "ring-gap-l": "path35", "ring-gap-r": "path33",
            "nose": "path39", "mouth": "path41"
          }
        },
        "cry": {
          "file": "pubnyan-cry-transparent.svg",
          "map": {
            "body": "path81#outer", "face": "path63#outer",
            "eye-l.white": "path59#outer", "eye-r.white": "path65#outer",
            "ring-gap-l": "path79", "ring-gap-r": "path77",
            "tear-l": "path61", "tear-r": "path67",
            "eye-l.pupil": "path69", "eye-r.pupil": "path71",
            "nose": "path73", "mouth": "path75"
          }
        },
        "shy": {
          "file": "pubnyan-shy-transparent.svg",
          "map": {
            "body": "path103#outer", "face": "path87#outer",
            "eye-l.white": "path85#outer", "eye-r.white": "path83#outer",
            "ring-gap-l": "path97", "ring-gap-r": "path95",
            "nose": "path89", "mouth": "path111"
          }
        }
      }
    },
    "starorbit": {
      "artboard": { "width": 288, "height": 203 },
      "default": "rest",
      "parts": [
        { "name": "ring", "fill": "#000000" },
        { "name": "star", "fill": "#000000" }
      ],
      "expressions": {
        "rest": {
          "file": "starorbit-transparent-287x202.svg",
          "map": { "ring": "path834", "star": "path836" }
        }
      }
    }
  }
}
```

- [ ] **Step 7: Write rig/README.md**

```markdown
# rig/

`parts.map.json` names the paths in the visual-identity SVGs. `npm run rig:extract` turns it into `*.rig.json` and previews.

## pubnyan parts (draw order, bottom first)

| part | notes |
|---|---|
| body | black silhouette: head, ears, whiskers, body and the orbital ring are ONE shape in the source. Pivot at bottom centre. Every other part is its child. |
| face | white star-shaped muzzle |
| eye-l.white, eye-r.white | white eye shapes; the expression variants change shape (slits, crescents, closed lines) |
| ring-gap-l, ring-gap-r | white slivers where the ring's inner edge shows; animate these to suggest the ring turning |
| tear-l, tear-r | hidden except in `cry` |
| eye-l.pupil, eye-r.pupil | hidden in angry, curious, shy |
| nose, mouth | black features on the face |

Expressions: normal, angry, curious, cry, shy. Files are aligned on the nose centre. Left and right are the viewer's.

Selectors: `id` = all subpaths, `id#outer` = largest subpath (the outline; holes are dropped because parts are layered instead), `id#rest`, `id#n`. Check selectors with `npm run rig:inspect -- <file.svg>` and look at `rig/inspect/<file>.png`.

## starorbit parts

`ring` (outer and inner subpaths, keep both so the hole stays transparent) and `star`.
```

- [ ] **Step 8: Extract and check the previews**

Run: `npm run rig:extract`
Expected output:
```
pubnyan: 12 parts, expressions: normal, angry, curious, cry, shy
starorbit: 2 parts, expressions: rest
```
Open `rig/preview/pubnyan-normal.png` and compare it with `vendor/visual-identity/preview.png`: same cat, same features, no missing eyes or extra shapes. Open `pubnyan-cry.png` (tears present, pupils present), `pubnyan-angry.png` (no pupils, slit eyes), `starorbit-rest.png` (ring with a transparent centre, star in front). If a part is wrong, fix the selector in `parts.map.json` using the inspect montage and re-run.

Then confirm the JSON shape:
```bash
node -e "const r=require('./rig/pubnyan.rig.json'); console.log(r.parts.map(p=>p.name).join(','), Object.keys(r.expressions).join(','), r.parts.every(p=>p.path===null||/^M/.test(p.path)))"
```
Expected: the 12 names, the 5 expressions, `true`.

- [ ] **Step 9: Run the full test suite and commit**

Run: `npm test && npm run check:types`
Expected: all pass.

```bash
git add rig packages/rig-extract packages/verify packages/ir/src/sample.ts
git commit -m "feat(rig): pubnyan and starorbit rigs extracted from visual-identity"
```
(`rig/preview/*.png` and `rig/inspect/` are gitignored; the SVG previews are committed.)

---

### Task 9: Animated SVG exporter and the spinner clip

**Files:**
- Create: `packages/export-svg/src/index.ts`, `packages/export-svg/src/cli.ts`, `motion/index.ts`, `motion/clips/spinner.clip.ts`, `motion/README.md`
- Test: `packages/export-svg/src/index.test.ts`

**Interfaces:**
- Consumes: `Rig`, `Clip`, `groupTracks`, `sampleVec2`, `sampleNumeric`, `resolvePath`, `REST`, `interpolatePath`, `EASES`, `ATTRIBUTION`.
- Produces: `exportSvg(rig: Rig, clip: Clip): string`; `motion/index.ts` exporting `rigs`, `clips`, `getRig(name)`; script `export:svg` writing `dist/svg/<clip>.svg` and `dist/svg/manifest.json`.
- Output structure: one `<g id="<part>">` per part, nested inside its parent's `<g>`, with `transform-origin: 0 0` and the pivot baked into the transform (`translate(pos+pivot) rotate scale translate(-pivot)`, identical to `localMatrix`) and CSS animations; the part's `<path>` first, then children. Transform keyframes are native when the part has exactly one transform track, baked per frame otherwise. Shape tracks become `d: path()` keyframes when every consecutive pair morphs, else one `<path>` per expression with opacity crossfades.

- [ ] **Step 1: Write the failing test**

```ts
// packages/export-svg/src/index.test.ts
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
    expect(out).not.toContain('<g id="ghost"><path');
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/export-svg`
Expected: FAIL, cannot resolve `#export-svg/index.ts`.

- [ ] **Step 3: Write index.ts**

```ts
// packages/export-svg/src/index.ts
import { EASES } from '#ir/easing.ts';
import { interpolatePath } from '#ir/path.ts';
import { REST, groupTracks, resolvePath, sampleNumeric, sampleVec2, type TracksByProperty } from '#ir/sample.ts';
import { ATTRIBUTION } from '#ir/svg.ts';
import type { Clip, EaseName, Key, Rig, RigPart, Track, Vec2 } from '#ir/types.ts';

const fmt = (n: number) => String(Number(n.toFixed(4)));
const cssName = (s: string) => s.replace(/[^a-z0-9]+/gi, '-');
const bezier = (e: EaseName) => `cubic-bezier(${EASES[e].join(', ')})`;

interface Stop {
  pct: number;
  decl: string;
  /** Ease of the segment ending at this stop. */
  ease?: EaseName;
}

function keyframes(id: string, stops: Stop[]): string {
  const frames = [...stops];
  if (frames[0].pct > 0) frames.unshift({ ...frames[0], pct: 0, ease: undefined });
  if (frames[frames.length - 1].pct < 100) frames.push({ ...frames[frames.length - 1], pct: 100, ease: undefined });
  const lines = frames.map((f, i) => {
    const next = frames[i + 1];
    const timing = next?.ease && next.ease !== 'linear' ? ` animation-timing-function: ${bezier(next.ease)};` : '';
    return `  ${fmt(f.pct)}% { ${f.decl};${timing} }`;
  });
  return `@keyframes ${id} {\n${lines.join('\n')}\n}`;
}

/** Same composition as ir/matrix.ts localMatrix(), so no reliance on transform-origin semantics for nested groups. */
const transformDecl = (pivot: Vec2, position: Vec2, rotation: number, sc: Vec2) =>
  `transform: translate(${fmt(position[0] + pivot[0])}px, ${fmt(position[1] + pivot[1])}px) rotate(${fmt(rotation)}deg) scale(${fmt(sc[0])}, ${fmt(sc[1])}) translate(${fmt(-pivot[0])}px, ${fmt(-pivot[1])}px)`;

function keyStops<V>(keys: Key<V>[], duration: number, decl: (v: V) => string): Stop[] {
  return keys.map((k) => ({ pct: (k.t / duration) * 100, decl: decl(k.v), ease: k.ease }));
}

function transformStops(part: RigPart, tracks: TracksByProperty, clip: Clip): Stop[] | null {
  const present = [tracks.position, tracks.rotation, tracks.scale].filter((t): t is Track => t !== undefined);
  if (present.length === 0) return null;
  if (present.length === 1) {
    const only = present[0];
    if (only.property === 'position') return keyStops(only.keys as Key<Vec2>[], clip.duration, (v) => transformDecl(part.pivot, v, REST.rotation, REST.scale));
    if (only.property === 'rotation') return keyStops(only.keys as Key<number>[], clip.duration, (v) => transformDecl(part.pivot, REST.position, v, REST.scale));
    return keyStops(only.keys as Key<Vec2>[], clip.duration, (v) => transformDecl(part.pivot, REST.position, REST.rotation, v));
  }
  const frames = Math.max(1, Math.round(clip.duration * clip.fps));
  const stops: Stop[] = [];
  for (let f = 0; f <= frames; f++) {
    const t = (f / frames) * clip.duration;
    const position = tracks.position ? sampleVec2(tracks.position, t) : REST.position;
    const rotation = tracks.rotation ? sampleNumeric(tracks.rotation, t) : REST.rotation;
    const sc = tracks.scale ? sampleVec2(tracks.scale, t) : REST.scale;
    stops.push({ pct: (f / frames) * 100, decl: transformDecl(part.pivot, position, rotation, sc) });
  }
  return stops;
}

function shapeMarkup(rig: Rig, part: RigPart, track: Track<'shape'> | undefined, clip: Clip, timing: string, rules: string[]): string {
  const id = cssName(part.name);
  const path = (d: string, style = '') => `<path d="${d}" fill="${part.fill}"${style ? ` style="${style}"` : ''}/>`;
  if (!track) return part.path ? path(part.path) : '';
  const paths = track.keys.map((k) => resolvePath(rig, part, k.v));
  const morphable = paths.every((d, i) => i === 0 || (d !== null && paths[i - 1] !== null && interpolatePath(paths[i - 1]!, d, 0) !== null));
  if (morphable) {
    rules.push(keyframes(`${id}-s`, keyStops(track.keys, clip.duration, (v) => `d: path("${resolvePath(rig, part, v)}")`)));
    return path(paths[0]!, `animation: ${id}-s ${timing}`);
  }
  const expressions = [...new Set(track.keys.map((k) => k.v))];
  return expressions
    .map((expr) => {
      const d = resolvePath(rig, part, expr);
      if (!d) return '';
      const anim = `${id}-s-${cssName(expr)}`;
      rules.push(keyframes(anim, keyStops(track.keys, clip.duration, (v) => `opacity: ${v === expr ? 1 : 0}`)));
      return path(d, `animation: ${anim} ${timing}`);
    })
    .join('');
}

export function exportSvg(rig: Rig, clip: Clip): string {
  const byPart = groupTracks(clip);
  const children = new Map<string | undefined, RigPart[]>();
  for (const part of rig.parts) children.set(part.parent, [...(children.get(part.parent) ?? []), part]);
  const timing = `${fmt(clip.duration)}s linear ${clip.loop ? 'infinite' : '1 forwards'}`;
  const rules: string[] = [];

  const render = (part: RigPart): string => {
    const id = cssName(part.name);
    const tracks = byPart.get(part.name) ?? {};
    const anims: string[] = [];
    const tStops = transformStops(part, tracks, clip);
    if (tStops) {
      rules.push(keyframes(`${id}-t`, tStops));
      anims.push(`${id}-t ${timing}`);
    }
    if (tracks.opacity) {
      rules.push(keyframes(`${id}-o`, keyStops(tracks.opacity.keys, clip.duration, (v) => `opacity: ${fmt(v)}`)));
      anims.push(`${id}-o ${timing}`);
    }
    const shape = shapeMarkup(rig, part, tracks.shape, clip, timing, rules);
    const kids = (children.get(part.name) ?? []).map(render).join('');
    const style = ['transform-box: view-box', 'transform-origin: 0px 0px'];
    if (anims.length) style.push(`animation: ${anims.join(', ')}`);
    return `<g id="${id}" style="${style.join('; ')}">${shape}${kids}</g>`;
  };

  const body = (children.get(undefined) ?? []).map(render).join('\n');
  const { width, height } = rig.artboard;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    `<title>${clip.name}</title>`,
    `<desc>${ATTRIBUTION}</desc>`,
    `<style>\n${rules.join('\n')}\n</style>`,
    body,
    `</svg>`,
  ].join('\n');
}
```

- [ ] **Step 4: Run the exporter tests**

Run: `npx vitest run packages/export-svg && npm run check:types`
Expected: 5 passed; tsc silent. If the morph test's `d: path(...)` assertion fails because `resolvePath` returns the collapsed svgpath form, that is only possible with generated rigs; the fixture uses explicit `L` commands, so investigate `keyStops` rather than the fixture.

- [ ] **Step 5: Write the spinner clip, motion index, and README**

```ts
// motion/clips/spinner.clip.ts
import { clip, key, track } from '#ir/clip.ts';

/** Loading spinner: the star turns once per cycle and breathes; the ring holds still. */
export default clip('spinner', { rig: 'starorbit', duration: 2, fps: 30, loop: true }, [
  track('star', 'rotation', [key(0, 0), key(2, 360)]),
  track('star', 'scale', [key(0, [1, 1]), key(1, [1.12, 1.12], 'inOutSine'), key(2, [1, 1], 'inOutSine')]),
]);
```

```ts
// motion/index.ts
import type { Clip, Rig } from '#ir/types.ts';
import pubnyanRig from '#rig/pubnyan.rig.json' with { type: 'json' };
import starorbitRig from '#rig/starorbit.rig.json' with { type: 'json' };
import spinner from '#motion/clips/spinner.clip.ts';

export const rigs: Record<string, Rig> = {
  pubnyan: pubnyanRig as Rig,
  starorbit: starorbitRig as Rig,
};

export const clips: Clip[] = [spinner];

export function getRig(name: string): Rig {
  const rig = rigs[name];
  if (!rig) throw new Error(`unknown rig "${name}"; known: ${Object.keys(rigs).join(', ')}`);
  return rig;
}
```

```markdown
# motion/

The single definition of every pubnyan animation. Exporters read this; nothing else is hand-authored per target.

## Clips

One file per clip in `clips/`, default-exporting `clip(name, { rig, duration, fps?, loop? }, tracks)`. Register it in `index.ts`.

- `track(part, property, keys)` — `property` is `position` ([dx, dy] px), `rotation` (degrees, about the part's pivot), `scale` ([sx, sy]), `opacity` (0..1), or `shape` (an expression name, or `default`).
- `key(t, value, ease?)` — `t` in seconds. The ease belongs to the segment that ends at this key. Names: `linear`, `easeIn`, `easeOut`, `easeInOut`, `inOutSine`, `outQuint`, `outBack`.
- Parts and pivots: see `rig/README.md`. Children move with their parent (`body` is the parent of everything in pubnyan).
- A looping clip must end where it starts.
- Shape keys morph when both expressions have the same path structure, otherwise they crossfade.

Run `npm run verify` after editing. It exports every target, compares frames against the reference sampler, and writes `dist/verify/<clip>-contact.png` for you to look at.
```

- [ ] **Step 6: Write the export CLI and run it**

```ts
// packages/export-svg/src/cli.ts
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { exportSvg } from '#export-svg/index.ts';
import { ATTRIBUTION } from '#ir/svg.ts';
import { clips, getRig } from '#motion/index.ts';

const ROOT = new URL('../../../', import.meta.url).pathname;
const OUT = join(ROOT, 'dist', 'svg');

await mkdir(OUT, { recursive: true });
const manifest: Record<string, unknown>[] = [];
for (const clip of clips) {
  const file = `${clip.name}.svg`;
  await writeFile(join(OUT, file), exportSvg(getRig(clip.rig), clip));
  manifest.push({ name: clip.name, rig: clip.rig, duration: clip.duration, fps: clip.fps, loop: clip.loop, file });
  console.log(`wrote dist/svg/${file}`);
}
await writeFile(join(OUT, 'manifest.json'), JSON.stringify({ attribution: ATTRIBUTION, clips: manifest }, null, 2) + '\n');
```

Run: `npm run export:svg`
Expected: `wrote dist/svg/spinner.svg`. Open `dist/svg/spinner.svg` in a browser: the star rotates and pulses over the ring.

- [ ] **Step 7: Commit**

```bash
git add packages/export-svg motion dist/svg
git commit -m "feat(export-svg): animated SVG exporter and the spinner clip"
```

---

### Task 10: Verify loop: reference frames, parity, contact sheets

**Files:**
- Create: `packages/verify/src/config.ts`, `packages/verify/src/reference.ts`, `packages/verify/src/parity.ts`, `packages/verify/src/targets/svg.ts`, `packages/verify/src/contact-sheet.ts`, `packages/verify/src/cli.ts`
- Test: `packages/verify/src/parity.test.ts`, `packages/verify/src/targets/svg.test.ts`

**Interfaces:**
- Produces:
  - `PARITY_MAX_RATIO = 0.002`, `PIXEL_THRESHOLD = 0.1`, `SAMPLE_COUNT = 8`.
  - `referenceFrame(renderer, rig, clip, t): Promise<Buffer>`.
  - `Target { name: string; export(rig, clip, outDir): Promise<string[]>; renderFrame(renderer, rig, clip, t): Promise<Buffer> }`.
  - `compareFrames(a: Buffer, b: Buffer): { width; height; diffPixels; ratio; diff: Buffer }`, `sampleTimes(clip, n?): number[]`, `checkParity(renderer, rig, clip, target, times?): Promise<ParityResult>` where `ParityResult { target; clip; pass; frames: { t; diffPixels; ratio }[]; worst: { t; ratio; diff: Buffer }; referenceFrames: Buffer[]; targetFrames: Buffer[] }`.
  - `contactSheet(renderer, times, rows: { label: string; frames: Buffer[] }[]): Promise<Buffer>`.
  - `TARGETS: Target[]` in `cli.ts` (currently `[svgTarget]`); later exporters append here.

- [ ] **Step 1: Write config.ts, reference.ts, and the svg target**

```ts
// packages/verify/src/config.ts
/** Maximum fraction of differing pixels per sampled frame. */
export const PARITY_MAX_RATIO = 0.002;
/** pixelmatch per-pixel colour distance threshold (0..1). */
export const PIXEL_THRESHOLD = 0.1;
/** Frames sampled per clip. */
export const SAMPLE_COUNT = 8;
```

```ts
// packages/verify/src/reference.ts
import { sampleClip } from '#ir/sample.ts';
import { renderStaticSvg } from '#ir/svg.ts';
import type { Clip, Rig } from '#ir/types.ts';
import type { Renderer } from '#verify/renderer.ts';

/** The ground truth: sampleClip() drawn as a static SVG. */
export function referenceFrame(renderer: Renderer, rig: Rig, clip: Clip, t: number): Promise<Buffer> {
  return renderer.renderSvg(renderStaticSvg(sampleClip(rig, clip, t), rig.artboard), rig.artboard.width, rig.artboard.height);
}
```

```ts
// packages/verify/src/targets/svg.ts
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { exportSvg } from '#export-svg/index.ts';
import type { Target } from '#verify/parity.ts';

export const svgTarget: Target = {
  name: 'svg',
  async export(rig, clip, outDir) {
    await mkdir(outDir, { recursive: true });
    const file = join(outDir, `${clip.name}.svg`);
    await writeFile(file, exportSvg(rig, clip));
    return [file];
  },
  renderFrame(renderer, rig, clip, t) {
    return renderer.renderSvg(exportSvg(rig, clip), rig.artboard.width, rig.artboard.height, t * 1000);
  },
};
```

- [ ] **Step 2: Write the failing parity tests**

```ts
// packages/verify/src/parity.test.ts
import { PNG } from 'pngjs';
import { expect, test } from 'vitest';
import { clip, key, track } from '#ir/clip.ts';
import { compareFrames, sampleTimes } from '#verify/parity.ts';

function png(width: number, height: number, paint: (x: number, y: number) => number): Buffer {
  const img = new PNG({ width, height });
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    const v = paint(x, y);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  return PNG.sync.write(img);
}

test('compareFrames counts differing pixels', () => {
  const a = png(4, 4, () => 255);
  const b = png(4, 4, (x, y) => (x === 1 && y === 2 ? 0 : 255));
  expect(compareFrames(a, a).diffPixels).toBe(0);
  const r = compareFrames(a, b);
  expect(r.diffPixels).toBe(1);
  expect(r.ratio).toBeCloseTo(1 / 16, 6);
  expect(PNG.sync.read(r.diff).width).toBe(4);
});

test('compareFrames rejects mismatched sizes', () => {
  expect(() => compareFrames(png(4, 4, () => 0), png(5, 4, () => 0))).toThrow(/size/);
});

test('sampleTimes spans the clip without the seam for loops, with the end for one-shots', () => {
  const tracks = [track('a', 'opacity', [key(0, 1)])];
  expect(sampleTimes(clip('l', { rig: 'r', duration: 2 }, tracks), 4)).toEqual([0, 0.5, 1, 1.5]);
  expect(sampleTimes(clip('o', { rig: 'r', duration: 3, loop: false }, tracks), 4)).toEqual([0, 1, 2, 3]);
});
```

```ts
// packages/verify/src/targets/svg.test.ts
import { afterAll, beforeAll, expect, test } from 'vitest';
import { clips, getRig } from '#motion/index.ts';
import { checkParity } from '#verify/parity.ts';
import { Renderer } from '#verify/renderer.ts';
import { svgTarget } from '#verify/targets/svg.ts';

let renderer: Renderer;
beforeAll(async () => {
  renderer = await Renderer.launch();
});
afterAll(async () => {
  await renderer.close();
});

test('every registered clip matches the reference sampler in the svg target', async () => {
  for (const clip of clips) {
    const result = await checkParity(renderer, getRig(clip.rig), clip, svgTarget);
    expect(result.pass, `${clip.name}: worst frame t=${result.worst.t} ratio=${result.worst.ratio}`).toBe(true);
  }
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run packages/verify`
Expected: renderer test passes, the two new files fail to resolve `#verify/parity.ts`.

- [ ] **Step 4: Write parity.ts**

```ts
// packages/verify/src/parity.ts
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import type { Clip, Rig } from '#ir/types.ts';
import { PARITY_MAX_RATIO, PIXEL_THRESHOLD, SAMPLE_COUNT } from '#verify/config.ts';
import { referenceFrame } from '#verify/reference.ts';
import type { Renderer } from '#verify/renderer.ts';

export interface Target {
  name: string;
  /** Write the target's files for this clip; returns the paths written. */
  export(rig: Rig, clip: Clip, outDir: string): Promise<string[]>;
  /** Render the target's own output at time t (seconds) to a PNG of artboard size. */
  renderFrame(renderer: Renderer, rig: Rig, clip: Clip, t: number): Promise<Buffer>;
}

export interface FrameDiff {
  width: number;
  height: number;
  diffPixels: number;
  ratio: number;
  diff: Buffer;
}

export function compareFrames(a: Buffer, b: Buffer): FrameDiff {
  const pa = PNG.sync.read(a);
  const pb = PNG.sync.read(b);
  if (pa.width !== pb.width || pa.height !== pb.height) {
    throw new Error(`frame size mismatch: ${pa.width}x${pa.height} vs ${pb.width}x${pb.height}`);
  }
  const diff = new PNG({ width: pa.width, height: pa.height });
  const diffPixels = pixelmatch(pa.data, pb.data, diff.data, pa.width, pa.height, { threshold: PIXEL_THRESHOLD });
  return { width: pa.width, height: pa.height, diffPixels, ratio: diffPixels / (pa.width * pa.height), diff: PNG.sync.write(diff) };
}

export function sampleTimes(clip: Clip, n = SAMPLE_COUNT): number[] {
  const steps = clip.loop ? n : n - 1;
  return Array.from({ length: n }, (_, i) => Number(((i * clip.duration) / steps).toFixed(4)));
}

export interface ParityResult {
  target: string;
  clip: string;
  pass: boolean;
  frames: { t: number; diffPixels: number; ratio: number }[];
  worst: { t: number; ratio: number; diff: Buffer };
  referenceFrames: Buffer[];
  targetFrames: Buffer[];
}

export async function checkParity(renderer: Renderer, rig: Rig, clip: Clip, target: Target, times = sampleTimes(clip)): Promise<ParityResult> {
  const referenceFrames: Buffer[] = [];
  const targetFrames: Buffer[] = [];
  const frames: ParityResult['frames'] = [];
  let worst: ParityResult['worst'] | undefined;
  for (const t of times) {
    const ref = await referenceFrame(renderer, rig, clip, t);
    const got = await target.renderFrame(renderer, rig, clip, t);
    const d = compareFrames(ref, got);
    referenceFrames.push(ref);
    targetFrames.push(got);
    frames.push({ t, diffPixels: d.diffPixels, ratio: d.ratio });
    if (!worst || d.ratio > worst.ratio) worst = { t, ratio: d.ratio, diff: d.diff };
  }
  return { target: target.name, clip: clip.name, pass: worst!.ratio <= PARITY_MAX_RATIO, frames, worst: worst!, referenceFrames, targetFrames };
}
```

- [ ] **Step 5: Run the verify tests**

Run: `npx vitest run packages/verify`
Expected: all pass, including the spinner parity integration test. If the spinner fails with a ratio slightly above the threshold, print `result.frames` and look at the worst frame: a real defect shows a displaced star, whereas antialiasing noise is a thin outline. Fix the exporter, not the threshold.

- [ ] **Step 6: Write contact-sheet.ts and cli.ts**

```ts
// packages/verify/src/contact-sheet.ts
import type { Renderer } from '#verify/renderer.ts';

const img = (png: Buffer) => `<img src="data:image/png;base64,${png.toString('base64')}" style="width:160px;height:auto;display:block;border:1px solid #ddd">`;

/** One row per source (reference first), one column per sampled time. */
export function contactSheet(renderer: Renderer, times: number[], rows: { label: string; frames: Buffer[] }[]): Promise<Buffer> {
  const head = `<tr><th></th>${times.map((t) => `<th style="font:12px sans-serif">${t}s</th>`).join('')}</tr>`;
  const body = rows
    .map((r) => `<tr><th style="font:12px sans-serif;text-align:left;padding-right:8px">${r.label}</th>${r.frames.map((f) => `<td>${img(f)}</td>`).join('')}</tr>`)
    .join('');
  return renderer.renderPage(`<table style="border-collapse:collapse;padding:8px">${head}${body}</table>`, 200 + times.length * 170);
}
```

```ts
// packages/verify/src/cli.ts
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateClip } from '#ir/clip.ts';
import { assertValid, validateRig } from '#ir/validate.ts';
import { clips, getRig, rigs } from '#motion/index.ts';
import { contactSheet } from '#verify/contact-sheet.ts';
import { checkParity, sampleTimes, type Target } from '#verify/parity.ts';
import { Renderer } from '#verify/renderer.ts';
import { svgTarget } from '#verify/targets/svg.ts';

/** Every exporter under test. New targets register here. */
export const TARGETS: Target[] = [svgTarget];

const ROOT = new URL('../../../', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');
const VERIFY_DIR = join(DIST, 'verify');

for (const rig of Object.values(rigs)) assertValid(validateRig(rig), `rig ${rig.name}`);
for (const clip of clips) assertValid(validateClip(clip, getRig(clip.rig)), `clip ${clip.name}`);

await mkdir(VERIFY_DIR, { recursive: true });
const renderer = await Renderer.launch();
const report: { clip: string; target: string; pass: boolean; worstT: number; worstRatio: number }[] = [];
let failed = false;
try {
  for (const clip of clips) {
    const rig = getRig(clip.rig);
    const times = sampleTimes(clip);
    const rows: { label: string; frames: Buffer[] }[] = [];
    for (const target of TARGETS) {
      await target.export(rig, clip, join(DIST, target.name));
      const result = await checkParity(renderer, rig, clip, target, times);
      if (rows.length === 0) rows.push({ label: 'reference', frames: result.referenceFrames });
      rows.push({ label: target.name, frames: result.targetFrames });
      await writeFile(join(VERIFY_DIR, `${clip.name}-${target.name}-worst.png`), result.worst.diff);
      report.push({ clip: clip.name, target: target.name, pass: result.pass, worstT: result.worst.t, worstRatio: result.worst.ratio });
      failed ||= !result.pass;
      console.log(`${result.pass ? 'PASS' : 'FAIL'} ${clip.name} / ${target.name}: worst ${(result.worst.ratio * 100).toFixed(3)}% at t=${result.worst.t}s`);
    }
    await writeFile(join(VERIFY_DIR, `${clip.name}-contact.png`), await contactSheet(renderer, times, rows));
  }
} finally {
  await renderer.close();
}
await writeFile(join(VERIFY_DIR, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`contact sheets in dist/verify/; report.json written`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 7: Run verify and look at the output**

Run: `npm run verify`
Expected:
```
PASS spinner / svg: worst 0.0xx% at t=...
contact sheets in dist/verify/; report.json written
```
Open `dist/verify/spinner-contact.png`: two rows (reference, svg) that look identical, the star rotating through the columns.

- [ ] **Step 8: Run everything and commit**

Run: `npm test && npm run check:types`
Expected: all pass.

```bash
git add packages/verify dist/svg
git commit -m "feat(verify): headless parity checks and contact sheets against the reference sampler"
```

---

### Task 11: Idle clip, backlog seed, spec revisions

**Files:**
- Create: `motion/clips/idle.clip.ts`, `docs/backlog.md`
- Modify: `motion/index.ts` (register idle), `dist/svg/` (regenerated)

- [ ] **Step 1: Write the idle clip**

```ts
// motion/clips/idle.clip.ts
import { clip, key, track } from '#ir/clip.ts';

/**
 * Idle loop, 4 s. Breathing on the body (everything inherits it), one blink at 3 s,
 * and the ring gaps narrowing alternately to suggest the ring turning slowly.
 */
const blink = (part: string) =>
  track(part, 'scale', [key(0, [1, 1]), key(3, [1, 1]), key(3.1, [1, 0.08], 'easeIn'), key(3.22, [1, 1], 'easeOut')]);

export default clip('idle', { rig: 'pubnyan', duration: 4, fps: 30, loop: true }, [
  track('body', 'scale', [key(0, [1, 1]), key(2, [1.008, 1.018], 'inOutSine'), key(4, [1, 1], 'inOutSine')]),
  blink('eye-l.white'),
  blink('eye-r.white'),
  blink('eye-l.pupil'),
  blink('eye-r.pupil'),
  track('ring-gap-l', 'scale', [key(0, [1, 1]), key(2, [0.85, 1], 'inOutSine'), key(4, [1, 1], 'inOutSine')]),
  track('ring-gap-r', 'scale', [key(0, [0.85, 1]), key(2, [1, 1], 'inOutSine'), key(4, [0.85, 1], 'inOutSine')]),
]);
```

Register it: in `motion/index.ts` add `import idle from '#motion/clips/idle.clip.ts';` and change to `export const clips: Clip[] = [spinner, idle];`.

- [ ] **Step 2: Verify and inspect**

Run: `npm run verify`
Expected: `PASS spinner / svg` and `PASS idle / svg`. Open `dist/verify/idle-contact.png`: the cat breathes imperceptibly across columns, the 3.0 s column shows the eyes closed to a line, ring gaps differ between the 0 s and 2 s columns. If a blink frame fails parity, the sampled time landed inside the 0.22 s blink where CSS and the sampler disagree on easing: check that `keyframes()` assigns `animation-timing-function` from the NEXT stop's ease.

- [ ] **Step 3: Seed docs/backlog.md**

```markdown
# Backlog

Work queue shared by humans and agents. Top item first. Mark `[x]` in the commit that completes an item. Every item ends with `npm run verify` green and a look at the contact sheet.

## Phase 4: Lottie

- [ ] **export-lottie: static frame.** `packages/export-lottie/src/index.ts` with `exportLottie(rig, clip): LottieJson`. One shape layer per part (parent via `parent` index), each with a single path shape (`ty: "sh"`) built from the rig path's cubic segments and a fill (`ty: "fl"`). Transform anchor = pivot. Register `lottieTarget` in `packages/verify/src/cli.ts`; its `renderFrame` loads lottie-web from `node_modules/lottie-web/build/player/lottie.min.js` into the page (inline the script text), calls `goToAndStop(t * 1000, false)`. Parity on `spinner` at t=0 passes.
- [ ] **export-lottie: transform keyframes.** Position, rotation, scale, opacity tracks become animated properties (`a: 1`) with bezier tangents from `EASES` (`o` and `i` handles: `o = {x: [x1], y: [y1]}`, `i = {x: [x2], y: [y2]}` on the outgoing keyframe). Parity on `spinner` and `idle` passes.
- [ ] **export-lottie: shape keyframes.** Morphable shape tracks animate the path; incompatible ones become one layer per expression with opacity keyframes (mirror `export-svg`). Parity passes on a test clip that morphs `normal -> angry -> normal` on `mouth`.
- [ ] **motion/machine.ts.** Write the pubnyan machine from the spec (`expression` enum, `react` trigger, `loading` bool; layers idle, expression, reaction) with `validateMachine` in `npm run verify`. States reference clips that exist at the time; add the clips first.
- [ ] **.lottie bundle.** `dist/lottie/pubnyan.lottie` (zip with `manifest.json`, `animations/*.json`, and a dotLottie state machine derived from `motion/machine.ts`). Load it with `@lottiefiles/dotlottie-web` in the page and confirm the listed animations and inputs.

## Phase 5: Rive

- [ ] **export-rive: key table.** Script `packages/export-rive/scripts/generate-keys.ts` that clones `rive-app/rive-runtime` at a pinned commit (record it in the script) with a sparse checkout of `include/rive/generated/` and parses every `*_base.hpp` for `typeKey` and `*PropertyKey` constants into `packages/export-rive/src/keys.generated.ts` (`{ [ClassName]: { typeKey, properties: { name: key } } }`). Property backing types are inferred from the C++ field type (`float` -> double, `uint32_t`/`int` -> uint, `bool` -> bool, `std::string` -> string, `ColorInt` -> color) and emitted alongside. Unit-test the parser on a checked-in sample header.
- [ ] **export-rive: writer core.** `packages/export-rive/src/writer.ts`: `RivWriter` with `varuint`, `string`, `float32`, `color`, and `object(typeKey, [[propKey, value]])` following https://rive.app/docs/runtimes/advanced-topic/format (header "RIVE", major 7, minor 0, file id, ToC of used property keys, 2-bit backing-type bitmap, objects each ending with a 0 terminator). Spike: one Backboard, one Artboard (width, height, name), one Shape with a Rectangle and a Fill + SolidColor. Load the bytes with `@rive-app/canvas` in the page; `rive.artboardNames` returns the artboard. Use `rivinfo` from the runtime repo if a load fails silently.
- [ ] **export-rive: rig shapes.** Every part as Shape > Path (PointsPath with CubicDetachedVertex objects from the rig's C segments) + Fill > SolidColor, parented through `parentId` to a Node per part (pivot handled by Node x/y plus path offset). Register `riveTarget` (render via `@rive-app/canvas` on a `<canvas>` at artboard size, `rive.scrub(animationName, t)`). Parity on a static frame passes.
- [ ] **export-rive: linear animations.** One LinearAnimation per clip with KeyedObject > KeyedProperty > KeyFrameDouble for x, y, rotation, scaleX, scaleY, opacity, using CubicEaseInterpolator objects for eases. Parity on `spinner` and `idle` passes.
- [ ] **export-rive: shape keyframes.** Morphs via keyed vertex properties; crossfade via opacity on per-expression shapes.
- [ ] **export-rive: state machine.** StateMachine with StateMachineNumber/Bool/Trigger inputs, one StateMachineLayer per machine layer, AnimationState per state, StateTransition with TransitionNumberCondition / TransitionBoolCondition / TransitionTriggerCondition, EntryState wired. Load in the runtime and assert `stateMachineInputs()` names match `motion/machine.ts`.

## Phase 6: Video and the agent loop

- [ ] **export-video.** `packages/export-video`: render each clip through the svg target at `clip.fps` to PNG frames in a temp dir, then `ffmpeg` to `dist/video/<clip>.mp4` (h264, yuv420p), `.webp` (animated), `.gif` (palette pass). Not a parity target; the verify CLI just runs it.
- [ ] **Flue agents.** `src/agents/director.ts`, `src/agents/animator.ts`, `src/agents/reviewer.ts`, tools in `src/tools/` (`read_backlog`, `mark_done`, `run_verify` calling `npm run verify` via `harness.sandbox`, `git_commit`), skills in `src/skills/{rig-reference,clip-dsl,pubnyan-motion}/SKILL.md`. API: `'use agent'` modules; `useModel('anthropic/claude-opus-5')` for the director; `useSubagent(defineSubagent({ name, description, agent: Animator, model: 'anthropic/claude-sonnet-5' }))`; `useSandbox(local(), { cwd: <repo root> })` from `@flue/runtime/node`; `useSkill(skill)` with `import skill from '../skills/clip-dsl/SKILL.md'`; `defineTool({ name, description, input: v.object(...), harness: true, async run({ data, harness }) { ... } })` with valibot. `usePersistentState('currentItem', null)` keeps the item across turns. Acceptance: `npx flue run src/agents/director.ts -m next --id pubnyan` completes one backlog item end to end on a throwaway item ("add a 1 s `wink` clip").
- [ ] **Agent loop scripts.** `npm run agent` loops `flue run ... -m next` until the director replies `BACKLOG EMPTY`; `.github/workflows/agent.yml` runs it on a schedule with `ANTHROPIC_API_KEY` from secrets and opens a PR from the `agent/*` branch.

## Animation work (for the agents, after phase 6)

- [ ] **Expression transitions.** Clips `to-angry`, `to-curious`, `to-cry`, `to-shy` (0.4 s, non-loop) morphing/crossfading eyes, mouth, face, tears from `normal`, and the reverse clips. Wire them into `motion/machine.ts`'s expression layer.
- [ ] **Reactions.** One-shot clips `nod` (body position y dip, 0.6 s), `tilt` (body rotation ±6°, 0.8 s), `ear-twitch` (not possible on the fused silhouette: instead a quick body scale-x squash, 0.3 s), `tail-flick` (ring-gap-r quick scale, 0.4 s). Wire into the reaction layer.
- [ ] **Better morphs.** Redraw eye and mouth expression paths with matching vertex counts in a separate SVG under `rig/overrides/` so `normal <-> angry/curious/shy` morph instead of crossfading; extend `parts.map.json` with an `overrides` source.
```

- [ ] **Step 4: Run everything and commit**

Run: `npm run verify && npm test && npm run check:types`
Expected: both clips PASS; tests pass; tsc silent.

```bash
git add motion dist/svg docs
git commit -m "feat(motion): idle clip; seed backlog for Lottie, Rive, video, and agents"
```

---

## Self-review notes

- Spec coverage: phases 1 to 3 map to Tasks 1 to 11; phases 4 to 6 and the milestone-1 clip list are backlog items with acceptance criteria. `motion/machine.ts` is deferred to the backlog because nothing in phases 1 to 3 consumes it; its types and validator exist (Task 4).
- Names used across tasks: `sampleClip`, `staticParts`, `groupTracks`, `resolvePath`, `sampleVec2`, `sampleNumeric`, `REST`, `interpolatePath`, `EASES`, `ATTRIBUTION`, `renderStaticSvg`, `Renderer.renderSvg/renderPage`, `Target`, `checkParity`, `sampleTimes`, `compareFrames`, `contactSheet`, `TARGETS`, `exportSvg`, `readSourceSvg`, `splitSubpaths`, `selectPath`, `buildRig`, `inspectSvg`, `clips`, `rigs`, `getRig`.
