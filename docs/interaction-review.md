# Interaction review

Reviewed all 22 registered clips, their motion tracks, state-machine transitions,
and rendered contact/review sheets. The guiding behavior is a calm cat: pupils
retain their geometry while lids occlude them, and reactions begin from the
current pose.

| Area | Finding | Action |
| --- | --- | --- |
| Idle, curious, wink, nod, head-turn, ring-wobble, tail-flick | Blink scales compress pupils together with whites. | Remove pupil scale tracks; only whites close. Hide pupils briefly at the closed-lid seam. |
| Eight expression transitions | Pupils are compressed during the eye contour swap. | Keep pupils unscaled; conceal the source contour swap during the closed hold. |
| Celebrate | Pupil paths morph into tiny happy-expression pupils. | Remove pupil morph tracks; retain round pupils beneath the smiling lids. |
| From angry/curious/shy | First-frame head pose differs from the resting expression and matching entrance endpoint. | Start neutral, then ease into a small release accent. |
| Reaction triggers, including interrupted reactions | Zero-duration entry resets keyed channels to the reaction's starting pose. | Blend over 100 ms. Real Rive frames now remain unchanged at the trigger boundary. |
| Spinner | The rotating star crosses the top of its artboard (about 16.55 px at its worst). | Fit the star's complete rotation, use a small 0.82–0.85 pulse, and render at 60 fps. Dense bounds regression added. |
| Angry/cry/shy loops, tilt, ear-twitch | No additional clear structural defect found. | Retain the authored acting. |
| Body, head, ears, ring | No detached seams or independently moving ring halves found in reviewed sheets. | Retain the existing hierarchy and restrained amplitudes. |

Both pupils now declare `clipTo` referencing their white eye part. The sampler
carries the aperture in world coordinates; SVG uses animated clip paths, Lottie
uses native alpha mattes, and Rive uses native clipping geometry. Pupil movement
is independent of lid movement. Source color and opacity do not affect the
geometric aperture; null geometry clips the pupil completely. The relationship
applies only to the part's drawing, not its children, and must reference an
earlier, unclipped sibling. Invalid relationships fail rig validation.

Tests use contrasting face/pupil colors so matching black fills cannot conceal a
missing clip. They cover motion, compatible morphs, incompatible shape changes,
empty apertures, compound holes and preservation of child drawing behavior.

Additional regression checks sample pupil dimensions at 120 Hz, inspect the loading
star's bounds at 241 times per cycle, compare expression return poses, and drive all
seven reaction triggers plus interruption boundaries in the actual Rive runtime.
