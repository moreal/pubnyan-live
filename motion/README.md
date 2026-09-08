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

## Sustained expressions

`idle` is a quiet six-second breath with an eye-led head turn and one blink. `expr-curious`,
`expr-cry`, `expr-shy`, and `expr-angry` are complete looping performances: a held
investigative lean, two unequal sobs with falling tears, a bashful downward glance,
and a restrained huff. Each includes pauses and returns to its opening pose.

The expression layer plays these loops directly, blending between states. It owns
breathing and eye motion, so the neutral blink does not squash an expression's
already-closed eyes. Standalone `to-*` and `from-*` clips remain available for clients
that explicitly sequence transitions. `expression-motion.ts` shares the blink,
breathing, and expression-shape vocabulary; timings remain local to each clip.

The silhouette is articulated: `head` carries the black cheeks, whiskers and
facial features; `ear-l` and `ear-r` are its children. The lower body and ring stay
together. Head rotations around 4 degrees and independent ear accents around
6 degrees now read as physical gestures. The 406 × 351 artboard includes 16 px
gutters so these poses have room. Keep the white star muzzle rigid relative to
the head. Tear transforms use translation, not scale about their default [0, 0] pivot;
each falling tear fades out before resetting upward.

Preview in Storybook's **Targets/SVG → Player** or **Targets/Lottie → Player**,
selecting `idle` or an `expr-*` clip. Video exports also show complete loops.
The combined Rive **Machine** supports expression geometry, pupils, tears, and
layered reactions. Compatible paths share vertices for native morphs; incompatible
paths crossfade. Reactions release their channels after completion, and expression
states reset unused transforms so an earlier emotion cannot leave a stale pose.
`npm run verify` also compares real Rive expression inputs against the sampler and
writes `dist/verify/rive-machine-contact.png`.

## Motion review

`node scripts/motion-review.mjs` writes a self-contained
`dist/verify/polish-review.html` with clip selection, play/pause, slow playback and
frame scrubbing. Pass a directory of earlier SVG exports as its first argument
to embed a before/after comparison. It starts paused and pauses when hidden or
the reduced-motion preference changes. Client applications should likewise
offer explicit playback or a static expression for reduced-motion users.

Review anticipation, the accented pose, the hold, and recovery at normal speed,
then scrub the neck, ear roots and eye contours. `nod` closes its eyes on the down
accent, `wink` leans into one closed eye, and `ear-twitch` now actually articulates
the ears with an asymmetric delay. The historical `tail-flick` input remains a
ring-gap gesture because the mascot has no tail.
