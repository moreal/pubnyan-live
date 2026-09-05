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
