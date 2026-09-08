# rig/

`parts.map.json` names the paths in the visual-identity SVGs. `npm run rig:extract` turns it into `*.rig.json` and previews.

## pubnyan parts (draw order, bottom first)

| part | notes |
|---|---|
| body | lower body and orbital ring; pivot `[203, 330]`. The original contour is partitioned in the override SVG. |
| head | actual black head and whisker silhouette with a concealed chin overlap; child of body, pivot `[209, 226]`. Facial features follow this joint. |
| ear-l, ear-r | original ear contours with overlapping roots; children of head, pivots `[138, 70]` and `[288, 63]`. |
| face | white star-shaped muzzle |
| eye-l.white, eye-r.white | white eye shapes; the expression variants change shape (slits, crescents, closed lines) |
| ring-gap-l, ring-gap-r | white slivers where the ring's inner edge shows; animate these to suggest the ring turning |
| tear-l, tear-r | hidden except in `cry` |
| eye-l.pupil, eye-r.pupil | visible in every open-eye expression; compatible override paths keep gaze continuous during morphs |
| nose, mouth | black features on the face |

Expressions: normal, angry, curious, cry, shy. Left and right are the viewer's.

## Expressions inherit the default

`default` (here `normal`) supplies every part's default path. In any other expression's `map`:

- **absent** — the part keeps its default path. Body, face and the ring gaps are absent everywhere, so every expression wears the same silhouette instead of a near-identical copy with a different vertex count.
- **selector** — the part takes that path from the expression's own file.
- **`null`** — the part is hidden in this expression. Do not hide pupils merely to suggest a lowered eyelid; author the visible pupil contour within the eye instead.

Only the mapped parts land in `*.rig.json`; `resolvePath()` falls back to the default for the rest.

Files are aligned on the nose centre: every non-default expression is translated so its nose matches `normal`'s, which is why each one must map the align part (`nose`) explicitly — inherited paths are never translated.

Selectors: `id` = all subpaths, `id#outer` = largest subpath (the outline; holes are dropped because parts are layered instead), `id#rest`, `id#n`. Check selectors with `npm run rig:inspect -- <file.svg>` and look at `rig/inspect/<file>.png`.

## starorbit parts

`ring` (outer and inner subpaths, keep both so the hole stays transparent) and `star`.

## Articulated silhouette and motion gutters

The source logo remains untouched. `overrides/pubnyan-eyes-mouth.svg` partitions its exact outer contour into body/ring, head/whiskers, and two ears. Closing curves overlap inside the black silhouette so the star muzzle follows the head without sliding over a fixed duplicate outline. The ring gaps remain body children and render over the neck overlap.

The pubnyan artboard is **406 × 351**, with a **16 px gutter on every side** of the original 374 × 319 artwork. A single `translate(16 16)` group in the override SVG shifts all paths, including source-derived expression paths already aligned to the normal nose. Explicit joint pivots shift by the same amount; other pivots are extracted from their paths. This gives head turns and ear follow-through room without clipping or requiring every clip to move the character downward.

Use head rotations around ±4° and ear accents around ±6°; inspect the neck and ear-root joins at the motion extremes. The rest-outline regression test compares the union of the four articulated black pieces against the source silhouette, allowing only raster antialiasing differences. Pupil containment samples the complete artboard, so future coordinate changes cannot silently evade the check.
