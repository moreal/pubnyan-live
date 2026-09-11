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

`idle` is a six-second listening performance: one ear catches a sound, the eyes lead
a prepared head turn, a second inquisitive tilt holds, and one blink releases it. `expr-curious`,
`expr-cry`, `expr-shy`, and `expr-angry` are complete looping performances: a held
investigative lean, two unequal sobs with falling tears, a bashful downward glance with a brief open-eyed peek,
and a restrained huff. Each includes pauses and returns to its opening pose.

The expression layer plays these loops directly, blending between states. It owns
breathing and eye motion, so the neutral blink does not squash an expression's
already-closed eyes. Standalone `to-*` and `from-*` clips remain available for clients
that explicitly sequence transitions. `expression-motion.ts` shares the blink,
breathing, and expression-shape vocabulary; timings remain local to each clip.

The silhouette is articulated: `head` carries the black cheeks, whiskers and
facial features; `ear-l` and `ear-r` are its children. `torso` carries the cat,
while `ring-back` and `ring-front` surround it as separate layers. Both ring halves
share a pivot and identical tracks through `ring-motion.ts`; their holes are
transparent geometry, not white overlays. `body` remains the common transform root. Head rotations around 4–5 degrees and independent ear accents around
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
the ears with an asymmetric delay. The historical `tail-flick` clip and `reactTailFlick` input are compatibility
aliases for `ring-wobble`. Pubnyan has no tail; new integrations should use
`ring-wobble` / `reactRingWobble`.

### Performance polish

The main accent is preceded by a small counter-pose and followed by a smaller
rebound. Ears answer at different times and settle after the head. The independent ring
answers the cat with a delayed countertilt and settles last. The angry huff pins the ears, the two unequal sobs leave
soft ear drag, and shy briefly opens its eyes before tucking back in. Wink holds
one closed lid for 180 ms so it reads as an intentional gesture at avatar size.
Nod translates the body instead of stretching the star muzzle.

One-shot durations: nod 0.85 s, wink 0.95 s, tilt 1.2 s, head-turn 1.4 s,
ear-twitch 0.75 s, `ring-wobble` (also the legacy `tail-flick`) 1.8 s, and `celebrate` 1.5 s. Consumers
should use the exported manifest duration instead of hardcoded timers.


### Orbital acting

`ring-wobble` looks down at the ring, follows its roll to the opposite side, then
blinks as it settles. `celebrate` compresses, rises through the ring with a held
curved happy lids and an open smile, lands, and rebounds once. The ring lags
behind the cat, preserving its front/back occlusion and solid weight. Trigger it
with `reactCelebrate` in the exported machines. The `happy` rig shape is an accent
for the smiling eyes and mouth; it does not add another sustained emotion input.

All cat/torso scale changes remain within 2%, translations within 8 px and joint
rotations within 6°. The star muzzle follows the head without separate distortion.
`motion/ring-motion.test.ts` protects synchronized ring halves and new triggers;
`motion/eyes.test.ts` also guards against blank white eyes during blink reopening.

The wink closes toward the lower lid with a small downward shift and a brief
closed hold. Its reopening, shared blinks, and expression eye transitions use
a gentle start and finish so the eye does not pop open in the first frame.
Only whites compress; pupil geometry and gaze remain unchanged. Each pupil declares `clipTo` with its white eye part in the rig. Native clipping
follows the animated aperture in SVG, Lottie, and Rive, independently of face or
pupil color. The short closed-lid concealment keeps the white eyelid readable;
regression tests also verify pupil size and contrasting-color occlusion.

Character vocabulary to build on: listening, a curious lean, a bashful peek,
a restrained huff, a soft sob, acknowledging nods, a conspiratorial wink,
orbital balancing and buoyant celebration. Do not invent a tail, paws or a walk
cycle absent from the source drawing.

The `celebration` machine layer is separate from ordinary `reaction` overlays.
It temporarily owns the full face (including the happy smile), then releases all
channels to the continuing emotion. Keeping shape changes out of `reaction`
allows nods, winks and ring gestures to preserve an angry or crying expression.
`motion/reaction-layer.test.ts` checks active reactions and the release in Rive.

After exporting, run `node scripts/motion-contact-review.mjs` for compact
`dist/verify/<clip>-review.png` sheets with eight selected poses and all four
renderer rows. Optional clip-name arguments limit the set. These include exact
loop endpoints and stay below Chrome's large-screenshot width limit; exhaustive
key/midpoint comparison remains the responsibility of `npm run verify`.

The latest visual pass gives `idle` a held torso lean and `ring-wobble` an
opposing torso roll, so attention and balance read through the whole silhouette.
The default mouth again matches the source SVG’s small triangular smile.
Celebration morphs only the whites into curved happy lids. Pupils keep their
round geometry and hide briefly at closure; reopening reveals them at full size. See [acting direction](../docs/motion-direction.md)
for the source-grounded movement vocabulary and visual review criteria.

Standalone `to-cry` and `from-cry` now exchange their incompatible eye geometry
during a closed blink, with pupils hidden through the swap. `from-cry` starts
from the sustained loop’s neutral head pose. Direct machine emotion blending
continues to use its existing crossfade rather than these standalone clips.

See `../docs/interaction-review.md` for the full interaction audit. Reactions blend
from the current pose over 100 ms; expression return clips start at rest. The
loading star fits its complete rotation inside the artboard at 60 fps.
