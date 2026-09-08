---
name: pubnyan-motion
description: "Motion principles for the pubnyan mascot: amplitudes, timing, and what to avoid. Use when designing any pubnyan animation."
---
# How pubnyan moves

- Calm cat. Amplitudes are small: body/torso scale within 1 +- 0.02, position within 8 px, rotation within 6 degrees.
- Articulated head poses around 4 degrees and ear accents around 6 degrees are readable. Lead a look with the pupils, follow with the head, and let the ears settle later. Inspect ear roots and neck overlap at the extremes.
- The star mouth and the orbital ring are the identity elements. Never distort the mouth; animate the complete ring using `orbit()` from `motion/clips/ring-motion.ts`. Its front/back layers must have identical tracks and pivots. Pubnyan has no tail; `tail-flick` is only a deprecated alias for `ring-wobble`.
- Blinks are a scale-y squash of both eye whites and both pupils to about 0.08 over 0.1 s in and 0.12 s out, with `easeIn` then `easeOut`.
- Pupils remain visible in every open-eye emotion. During a blink only, fade pupils out just before full closure and restore them within 30 ms of reopening so the closed eye reads as one unbroken lid. Keep white and pupil compression synchronized and verify pupil containment during morphs.
- Expression changes cross-fade in 0.2 to 0.4 s; hold the new expression for at least 0.5 s before returning.
- Quick one-shot reactions are about 0.6 to 0.9 s; a held tilt or look can take 1.1 to 1.4 s. Return exactly to rest so they can follow the idle loop.
- Use `inOutSine` for anything that breathes or sways, `easeOut` for arrivals, `outBack` sparingly for a bounce.
- A looping clip must end where it starts.
