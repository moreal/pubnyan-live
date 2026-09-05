---
name: rig-reference
description: Part names, pivots, hierarchy, and expressions of the pubnyan and starorbit rigs. Use before writing or editing any clip.
---
# Rigs

Two rigs, generated from `rig/parts.map.json` by `npm run rig:extract` (never edit `rig/*.rig.json` by hand). Coordinates: artboard origin top-left, y down; `-l` is the viewer's left.

## pubnyan (artboard 374 x 319)

Draw order, bottom first. Every part except `body` is a child of `body`, so body transforms move everything.

| part | fill | notes |
|---|---|---|
| body | black | head, ears, whiskers, torso, and the orbital ring in ONE silhouette; pivot at bottom centre (187, 314). The ring cannot rotate on its own. |
| face | white | star-shaped muzzle |
| eye-l.white, eye-r.white | white | eye shapes; change per expression |
| ring-gap-l, ring-gap-r | white | slivers where the ring's inner edge shows; animate to suggest the ring turning |
| tear-l, tear-r | white | hidden except in `cry` |
| eye-l.pupil, eye-r.pupil | black | hidden in angry, curious, shy |
| nose, mouth | black | on the face; mouth changes per expression |

Pivots default to each part's bounding-box centre. Expressions: `normal` (default), `angry`, `curious`, `cry`, `shy`. A `shape` key names one of these. Morphs happen when both expressions have the same path structure for that part (mouth normal <-> shy does; most eye pairs crossfade).

## starorbit (artboard 288 x 203)

Parts `ring` and `star`, no hierarchy. Used by the `spinner` clip.
