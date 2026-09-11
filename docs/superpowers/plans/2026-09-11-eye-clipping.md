# Eye clipping implementation plan

**Goal:** Clip each undistorted pupil to its independently animated white eye aperture in the reference renderer, SVG, Lottie, Rive clips, and Rive state machines.

**Architecture:** Add `RigPart.clipTo?: string` (and PartsMapPart equivalent). It references an earlier, non-clipped sibling part. Clipping affects only the part's own drawing, not its children, and uses the nonzero union of the source contours selected by the source shape track (both contours during an incompatible crossfade). Geometry ignores source color and part opacity, like SVG clipPath; null geometry means an empty aperture. Keep pupil transforms independent. Parent transforms apply equally to source and pupil. Reject missing/self/later/different-parent/chained sources rather than silently ignoring unsupported graphs.

**Tech stack:** Existing TypeScript IR, CSS/SVG, Lottie shape masks or mattes, native Rive clipping geometry, Puppeteer parity tests. No new runtime dependency is planned.

**Spec:** User explicitly authorizes packages/* changes for genuine pupil occlusion across every format. Preserve the preceding interaction fixes and do not commit.

## Tasks

- [x] IR and rig: add the typed relationship, structural/content validation, preserve it in rig extraction, attach sampled mask geometry in world coordinates, and render geometric SVG clip paths. Tests must distinguish actual clipping from black-on-black concealment using colored pupils and a contrasting face.
- [x] SVG: emit independently animated clip geometry in the shared parent's coordinate space; clip only the pupil drawing while leaving pupil geometry unchanged. Exercise moving pupils, animated aperture scale/shape, null and crossfade sources.
- [x] Lottie: use native masks/mattes with independently moving source geometry; preserve parent transforms and shape changes. Validate with colored regression fixtures and actual lottie-web rendering.
- [x] Rive: emit native ClippingShape relationships for standalone clips and combined state machines; inactive incompatible source geometry must not enlarge the active aperture. Validate real runtime rendering, morphs and changing states.
- [x] Integration: set both pupil clipTo values in parts.map.json and regenerate rigs via rig:extract. Replace black-background assumptions in eye tests/docs with color-independent clipping checks; retain pupil-dimension tests and prior timing improvements.
- [x] Final: run npm run check, inspect affected contact sheets, regenerate deliverable assets, perform code review, report validation and actual implementation limits.

Execution uses focused subagents for independent exporter implementations while the root implements IR/reference/rig wiring and cross-target regression fixtures. Existing dirty changes belong to this task history; preserve them.

## Implementation notes

SVG and Lottie use interval-specific geometric contours; compatible segments still
morph when another key is null or incompatible. Part opacity multiplies each
visible contour before overlap compositing. Rive normalizes mask winding while
preserving compound holes, then uses identity-space constrained activation gates
before cloned source transforms. The gates retain full incompatible contours
during native state blends without distorting visible whites, including when an
ancestor has a zero scale. Activation boundaries are resolved below an animation
frame (SVG/Lottie 1e-7 seconds; Rive one native fps*1000 tick and a 1e-12 blend gate).

Focused regression tests passed for contrasting colors, independent movement,
null apertures, mixed topology, contour opacity, opposite winding, compound holes,
children outside the aperture, singular transforms, and native state blends.

Final validation: `npm run check` passed (339 tests, 84/84 target comparisons).
All character review sheets were visually inspected. The actual dotlottie-web
WASM runtime also matched five contrasting-color clipping frames with zero pixel
mismatches. Deliverable SVG/Lottie/Rive/video assets and the bundle were regenerated.
