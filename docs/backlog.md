# Backlog

Work queue shared by humans and agents. Top item first. Mark `[x]` in the commit that completes an item. Every item ends with `npm run verify` green and a look at the contact sheet.

## Phase 4: Lottie

- [x] **export-lottie: static frame.** `packages/export-lottie/src/index.ts` with `exportLottie(rig, clip): LottieJson`. One shape layer per part (parent via `parent` index), each with a single path shape (`ty: "sh"`) built from the rig path's cubic segments and a fill (`ty: "fl"`). Transform anchor = pivot. Register `lottieTarget` in `packages/verify/src/cli.ts`; its `renderFrame` loads lottie-web from `node_modules/lottie-web/build/player/lottie.min.js` into the page (inline the script text), calls `goToAndStop(t * 1000, false)`. Parity on `spinner` at t=0 passes.
- [x] **export-lottie: transform keyframes.** Position, rotation, scale, opacity tracks become animated properties (`a: 1`) with bezier tangents from `EASES` (`o` and `i` handles: `o = {x: [x1], y: [y1]}`, `i = {x: [x2], y: [y2]}` on the outgoing keyframe). Parity on `spinner` and `idle` passes.
- [x] **export-lottie: shape keyframes.** Morphable shape tracks animate the path; incompatible ones become one layer per expression with opacity keyframes (mirror `export-svg`). Parity passes on a test clip that morphs `normal -> angry -> normal` on `mouth`.
- [x] **motion/machine.ts.** Write the pubnyan machine from the spec (`expression` enum, `react` trigger, `loading` bool; layers idle, expression, reaction) with `validateMachine` in `npm run verify`. States reference clips that exist at the time; add the clips first.
- [x] **.lottie bundle.** `dist/lottie/pubnyan.lottie` (zip with `manifest.json`, `animations/*.json`, and a dotLottie state machine derived from `motion/machine.ts`). Load it with `@lottiefiles/dotlottie-web` in the page and confirm the listed animations and inputs.

## Phase 5: Rive

- [ ] **export-rive: key table.** Script `packages/export-rive/scripts/generate-keys.ts` that clones `rive-app/rive-runtime` at a pinned commit (record it in the script) with a sparse checkout of `include/rive/generated/` and parses every `*_base.hpp` for `typeKey` and `*PropertyKey` constants into `packages/export-rive/src/keys.generated.ts` (`{ [ClassName]: { typeKey, properties: { name: key } } }`). Property backing types are inferred from the C++ field type (`float` -> double, `uint32_t`/`int` -> uint, `bool` -> bool, `std::string` -> string, `ColorInt` -> color) and emitted alongside. Unit-test the parser on a checked-in sample header.
- [ ] **export-rive: writer core.** `packages/export-rive/src/writer.ts`: `RivWriter` with `varuint`, `string`, `float32`, `color`, and `object(typeKey, [[propKey, value]])` following https://rive.app/docs/runtimes/advanced-topic/format (header "RIVE", major 7, minor 0, file id, ToC of used property keys, 2-bit backing-type bitmap, objects each ending with a 0 terminator). Spike: one Backboard, one Artboard (width, height, name), one Shape with a Rectangle and a Fill + SolidColor. Load the bytes with `@rive-app/canvas` in the page; `rive.artboardNames` returns the artboard. Use `rivinfo` from the runtime repo if a load fails silently.
- [ ] **export-rive: rig shapes.** Every part as Shape > Path (PointsPath with CubicDetachedVertex objects from the rig's C segments) + Fill > SolidColor, parented through `parentId` to a Node per part (pivot handled by Node x/y plus path offset). Register `riveTarget` (render via `@rive-app/canvas` on a `<canvas>` at artboard size, `rive.scrub(animationName, t)`). Parity on a static frame passes.
- [ ] **export-rive: linear animations.** One LinearAnimation per clip with KeyedObject > KeyedProperty > KeyFrameDouble for x, y, rotation, scaleX, scaleY, opacity, using CubicEaseInterpolator objects for eases. Parity on `spinner` and `idle` passes.
- [ ] **export-rive: shape keyframes.** Morphs via keyed vertex properties; crossfade via opacity on per-expression shapes.
- [ ] **export-rive: state machine.** StateMachine with StateMachineNumber/Bool/Trigger inputs, one StateMachineLayer per machine layer, AnimationState per state, StateTransition with TransitionNumberCondition / TransitionBoolCondition / TransitionTriggerCondition, EntryState wired. Load in the runtime and assert `stateMachineInputs()` names match `motion/machine.ts`.

## Phase 6: Video

- [ ] **export-video.** `packages/export-video`: render each clip through the svg target at `clip.fps` to PNG frames in a temp dir, then `ffmpeg` to `dist/video/<clip>.mp4` (h264, yuv420p), `.webp` (animated), `.gif` (palette pass). Not a parity target; the verify CLI just runs it.

## Phase 7 (done): agent loop

- [x] **Flue agents.** `src/agents/director.ts` (opus; delegates through `defineSubagent`, commits, marks items done) with the sonnet delegates `src/agents/implementer.ts` and `src/agents/reviewer.ts`; tools in `src/tools/`: `read_backlog`, `mark_done`, `run_checks` (`npm run check` through `harness.sandbox`), `git_commit` (runs the checks, then commits on `agent/backlog`); skills in `src/skills/{rig-reference,clip-dsl,pubnyan-motion,exporter-package}/SKILL.md`. `npx flue run src/agents/director.ts -m next --id pubnyan` completes one backlog item end to end.
- [x] **Agent loop scripts.** `scripts/agent-loop.mjs` (`npm run agent -- <max>`) runs the director once per item until it replies `BACKLOG EMPTY`, an item fails, or `max` items are done; it refuses to start on a dirty tree, time-boxes each run, and resolves credentials from `.env` or a pi subscription OAuth token (`src/tools/anthropic-auth.ts`). `.github/workflows/agent.yml` runs it on demand and opens a PR from `agent/backlog`.

## Animation work (for the agents)

- [ ] **Expression transitions.** Clips `to-angry`, `to-curious`, `to-cry`, `to-shy` (0.4 s, non-loop) morphing/crossfading eyes, mouth, face, tears from `normal`, and the reverse clips. Wire them into `motion/machine.ts`'s expression layer.
- [ ] **Reactions.** One-shot clips `nod` (body position y dip, 0.6 s), `tilt` (body rotation ±6°, 0.8 s), `ear-twitch` (not possible on the fused silhouette: instead a quick body scale-x squash, 0.3 s), `tail-flick` (ring-gap-r quick scale, 0.4 s). Wire into the reaction layer.
- [ ] **Better morphs.** Redraw eye and mouth expression paths with matching vertex counts in a separate SVG under `rig/overrides/` so `normal <-> angry/curious/shy` morph instead of crossfading; extend `parts.map.json` with an `overrides` source.

## Maintenance

Deferred cleanups found in the foundation and agent-loop reviews. None blocks a phase; take them when touching the area.

- [ ] **svgTarget renders the exported file.** `svgTarget.renderFrame` re-runs `exportSvg` in memory, so parity never tests the bytes in `dist/svg`. Load the written file instead.
- [ ] **Move `Renderer` out of `packages/verify`.** `rig-extract` imports the test harness to render previews. Put `Renderer` in a shared package both can depend on.
- [ ] **`readFill` accepts only 6-digit hex.** In `svg-source.ts` anything else (3-digit hex, `rgb()`, named colours) silently falls back to black; parse them or fail loudly.
- [ ] **`svg-source` drops `Q` quadratics.** Lower them to cubics, or fail with a message naming the offending command and path id.
- [ ] **`isPathData` is a whitelist, not a grammar.** It accepts malformed data such as a lone `M` with no coordinates. Parse with `parsePath` instead.
- [ ] **`REST` vectors in `sample.ts` are shared instances.** `REST.position` and `REST.scale` are handed straight to callers; a mutating consumer would corrupt every future sample. Freeze them or return copies.
- [ ] **Selector suffix errors conflate two failures.** `id#foo` reports "subpath index out of range"; distinguish "not a number" from "out of range".
- [ ] **Typed loader for JSON rigs.** Replace the `as unknown as Rig` casts in `motion/index.ts` with a loader that validates and narrows.
- [ ] **Repository LICENSE.** Decide the licence for the code and add the file; the artwork stays CC BY-SA 4.0 under its own attribution.
- [ ] **`git_commit` re-runs the suite the reviewer just ran.** Every item pays for `npm run check` twice. Cache it by tree: `run_checks` writes the `git write-tree` hash it verified, and `git_commit` skips its own run while the tree still hashes the same.
- [ ] **Exercise `.github/workflows/agent.yml`.** It has never run against a remote. Once one exists, dispatch it with max 1, then decide between `peter-evans/create-pull-request` and a plain `git push` + `gh pr create` (the loop already commits on `agent/backlog`, so the action mostly duplicates it).
