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

Expressions: normal, angry, curious, cry, shy. Left and right are the viewer's.

## Expressions inherit the default

`default` (here `normal`) supplies every part's default path. In any other expression's `map`:

- **absent** — the part keeps its default path. Body, face and the ring gaps are absent everywhere, so every expression wears the same silhouette instead of a near-identical copy with a different vertex count.
- **selector** — the part takes that path from the expression's own file.
- **`null`** — the part is hidden in this expression (the pupils in angry, curious and shy).

Only the mapped parts land in `*.rig.json`; `resolvePath()` falls back to the default for the rest.

Files are aligned on the nose centre: every non-default expression is translated so its nose matches `normal`'s, which is why each one must map the align part (`nose`) explicitly — inherited paths are never translated.

Selectors: `id` = all subpaths, `id#outer` = largest subpath (the outline; holes are dropped because parts are layered instead), `id#rest`, `id#n`. Check selectors with `npm run rig:inspect -- <file.svg>` and look at `rig/inspect/<file>.png`.

## starorbit parts

`ring` (outer and inner subpaths, keep both so the hole stays transparent) and `star`.
