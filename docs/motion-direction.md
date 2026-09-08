# Pubnyan acting direction

Pubnyan is the cat body inside an orbital ring. The source drawing has no tail,
paws, or walking anatomy. Its white star muzzle, uneven ears, whiskers, and
slanted ring make the character recognizable. Keep those shapes readable at
avatar size and preserve the original silhouette at rest.

## Performance, not constant movement

Use the clarity of a character animation performance: a thought, a small
preparation, one readable accent, a hold, and a diminishing recovery. Keep
ambient listening quieter than a triggered celebration. More life comes from
contrast in timing and coordinated poses, not continuous wobbling.

The pupils notice first. The head follows; the torso commits to the pose. The
ears answer asymmetrically. The ring is one rigid object whose front and back
halves always move together, counterbalancing the cat and settling last. Its
inner openings remain transparent on colored backgrounds.

## Animation vocabulary supported by the source

| Performance | Acting choice | Existing clip |
| --- | --- | --- |
| Listening | Ear catches a sound, glance, whole-body lean, longer questioning hold, blink and release | `idle` |
| Orbital balancing | Look down, torso counterleans against ring roll, look across, blink as the oscillation decays | `ring-wobble` |
| Joy | Small compression, buoyant rise, curved smiling eyes at the apex, landing and one smaller rebound | `celebrate` |
| Agreement | Prepared lift, decisive closed-eye dip, soft recovery | `nod` |
| Shared secret | Asymmetric wink with a held lean | `wink` |
| Curiosity | Eyes lead an investigating tilt, pause to think, a second smaller question | `expr-curious`, `tilt`, `head-turn` |
| Bashfulness | Lowered glance, held tuck, brief open-eyed peek | `expr-shy` |
| Frustration | Pinned ears and a restrained huff | `expr-angry` |
| Sadness | Unequal soft sobs, falling tears, ear drag | `expr-cry` |
| Alertness | One ear reacts before the other settles | `ear-twitch` |

A future greeting can use eye contact, a lean and an acknowledging nod. A future
surprise can use an ear prick, a short recoil and a held wide-eyed look. A future
sleepy performance can use progressively slower lids and a tucked head. These
are design directions, not additional exported clips. Avoid invented tail
flicks, paw waves, walk cycles, or disappearing through the ring: the source
does not define the hidden anatomy those actions would expose.

## This polish pass

- Preserve the articulated rig already present in the working tree. Overlap the
  ring band joins along the original curves to prevent antialias cracks at
  enlarged playback sizes.
- Give listening and orbital balancing a torso performance, so the head does
  not appear to pivot independently on a static body.
- Increase the visual opposition between the torso and ring within existing
  amplitude limits (8 px translation, 6 degrees rotation, 2% torso scale).
- Restore the source's small triangular resting smile. Give celebration curved
  happy lids and a deeper smile instead of a long flattened blink.
- Keep happy eye geometry morphable and pupils contained during opening/closing.
- Conceal the incompatible eye crossfade in standalone `to-cry` / `from-cry`
  transitions within a closed blink. Direct machine emotion blends retain their
  existing crossfade; they do not sequence these standalone transition clips.

## Review

`npm run check` checks types, tests, rendered SVG/Lottie/Rive parity and video
exports. Numerical parity proves that the formats agree; it does not judge
acting. Inspect `dist/verify/<clip>-contact.png` plus the smaller eight-pose
sheets made by `node scripts/motion-contact-review.mjs` for every touched clip.
Check silhouettes, ring occlusion, ear roots, neck joins and pupil containment
at preparation, accent, recovery, and the exact endpoint.

`node scripts/motion-review.mjs /path/to/before-svg-directory` builds the
self-contained `dist/verify/polish-review.html` comparison. Play at normal speed
first, then scrub at quarter speed. It starts paused, supports explicit playback,
and pauses when hidden or when the reduced-motion preference changes.
