# rig/

`parts.map.json` names the paths in the visual-identity SVGs. `npm run rig:extract` turns it into `*.rig.json` and previews.

## pubnyan parts (draw order, bottom first)

| part | notes |
|---|---|
| body | transform-only root; pivot `[203, 330]`. Whole-character movement carries the torso and orbit together. |
| ring-back | rear orbital band; child of body, pivot `[220, 270]`. |
| torso | separate cat body; child of body, pivot `[203, 310]`. Breathing carries the head, while the orbit can follow later. |
| head | actual black head and whisker silhouette with a concealed chin overlap; child of torso, pivot `[209, 226]`. Facial features follow this joint. |
| ear-l, ear-r | original ear contours with overlapping roots; children of head, pivots `[138, 70]` and `[288, 63]`. |
| face | white star-shaped muzzle |
| eye-l.white, eye-r.white | white eye shapes; the expression variants change shape (slits, crescents, closed lines) |
| tear-l, tear-r | hidden except in `cry` |
| eye-l.pupil, eye-r.pupil | separate pupils for normal, happy, and cry; curious/angry encode their gaze in the original white contour, and shy has squeezed-shut eyes |
| nose, mouth | black features on the face |
| ring-front | front orbital band; child of body, pivot `[220, 270]`. Rendered above the torso and head subtree. |
| ring-gap-l, ring-gap-r | hidden compatibility joints; the ring openings are now transparent geometry, never animated white masks. |

Expressions: normal, angry, curious, cry, shy, happy (curved smiling eyes, contracting pupils, and an open smile). Left and right are the viewer's.

## Expressions inherit the default

`default` (here `normal`) supplies every part's default path. In any other expression's `map`:

- **absent** — the part keeps its default path. Torso, orbit, and face are absent from the non-default maps, so every expression wears the same silhouette instead of a near-identical copy with a different vertex count.
- **selector** — the part takes that path from the expression's own file.
- **`null`** — the part is hidden in this expression. Use this for the separate pupils in curious, angry, and shy: their original white contours already encode the gaze or squeezed-shut lids. Do not add an invented pupil over those source shapes.

Only the mapped parts land in `*.rig.json`; `resolvePath()` falls back to the default for the rest.

Files are aligned on the nose centre: every non-default expression is translated so its nose matches `normal`'s, which is why each one must map the align part (`nose`) explicitly — inherited paths are never translated.

Selectors: `id` = all subpaths, `id#outer` = largest subpath (the outline; holes are dropped because parts are layered instead), `id#rest`, `id#n`. Check selectors with `npm run rig:inspect -- <file.svg>` and look at `rig/inspect/<file>.png`.

## starorbit parts

`ring` (outer and inner subpaths, keep both so the hole stays transparent) and `star`.

## Articulated silhouette and motion gutters

The source logo remains untouched. `overrides/pubnyan-eyes-mouth.svg` partitions its exact visible contours into torso, orbital back/front bands, head/whiskers, and two ears. This character has **no tail**. Closing curves overlap inside the black silhouette so the star muzzle follows the head without sliding over a fixed duplicate outline. The source ring-gap curves define the actual exposed inner boundaries of the orbit and torso; the openings are transparent. Hidden continuation curves complete the orbital arc behind the torso. The rear band extends slightly into the front along exact subdivisions of the source curves, eliminating antialias cracks at their shared edges without changing the ring outline.

Animate **both `ring-back` and `ring-front` with identical position, rotation, and scale keys**. Their pivots match. A shared ring parent would force both bands into one SVG subtree and destroy the front/torso/back draw order, so both are direct children of `body`. The `torso` owns `head`, which owns ears and facial features; list parts depth-first to preserve identical stacking in the sampler and SVG exporter.

The pubnyan artboard is **406 × 351**, with a **16 px gutter on every side** of the original 374 × 319 artwork. A single `translate(16 16)` group in the override SVG shifts all paths, including source-derived expression paths already aligned to the normal nose. Explicit joint pivots shift by the same amount; other pivots are extracted from their paths. This gives head turns and ear follow-through room without clipping or requiring every clip to move the character downward.

Use ring rotations around ±4°, head rotations around ±4°, and ear accents around ±6°; inspect the neck and ear-root joins at the motion extremes. The rest-outline regression test compares the union of the six articulated black pieces against the source silhouette with its two original ring openings, allowing only raster antialiasing differences. Pupil containment samples the complete artboard, so future coordinate changes cannot silently evade the check.

## Source expression fidelity

Curious, angry, and shy eye and mouth overrides are exact source paths, translated to the normal nose and then the shared gutter. They are not simplified to four-cubic ovals for morph compatibility. Their transition clips conceal eye topology changes during a brief closed blink; shy keeps its original squeezed-shut eyes throughout its sustained loop. `motion/source-expressions.test.ts` checks these contours against the vendor SVGs to prevent replacement with invented shapes.
