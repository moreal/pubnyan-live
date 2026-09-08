---
name: rig-reference
description: Part names, pivots, hierarchy, and expressions of the pubnyan and starorbit rigs. Use before writing or editing any clip.
---
# Rigs

Two rigs, generated from `rig/parts.map.json` by `npm run rig:extract` (never edit `rig/*.rig.json` by hand). Coordinates: artboard origin top-left, y down; `-l` is the viewer's left.

## pubnyan (artboard 406 x 351)

Draw order, bottom first. Facial features and ears belong to `head`, which belongs to `torso`; the torso carries the head, and both ring layers belong directly to `body`. Body transforms move everything. The head node moves the actual black head, whiskers and facial features together. All paths and pivots include a 16 px gutter offset; see `rig/README.md` for the source-preserving split.

| part | fill | notes |
|---|---|---|
| body | none | common transform root; pivot (203, 330) |
| torso | black | lower cat body; child of body, pivot (203, 310); head is its child |
| ring-back, ring-front | black | independent orbital layers around the torso; both child of body, pivot (220, 270); use identical tracks via `orbit()` |
| head | black | cheeks and whiskers with concealed neck overlap; pivot (209, 226) |
| ear-l, ear-r | black | independent ears with overlapping roots; pivots (138, 70), (288, 63) |
| face | white | star-shaped muzzle |
| eye-l.white, eye-r.white | white | eye shapes; change per expression |
| ring-gap-l, ring-gap-r | none | deprecated null compatibility nodes; the ring now has real transparent holes |
| tear-l, tear-r | white | hidden except in `cry` |
| eye-l.pupil, eye-r.pupil | black | visible in all open-eye expressions; authored contours stay within the corresponding white eye |
| nose, mouth | black | on the face; mouth changes per expression |

Pivots default to each part's bounding-box centre. Expressions: `normal` (default), `angry`, `curious`, `cry`, `shy`, plus a `happy` accent with curved smiling eyes and a deeper smile. The normal mouth preserves the original SVG smile. A `shape` key names one of these. Normal/angry/curious/shy/happy eyes, pupils, and mouths share corresponding cubic landmarks and morph; incompatible cry paths crossfade. Never restore null pupil mappings for lowered eyelids.

## starorbit (artboard 288 x 203)

Parts `ring` and `star`, no hierarchy. Used by the `spinner` clip.
