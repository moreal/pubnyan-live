---
name: pubnyan-motion
description: "Motion principles for the pubnyan mascot: amplitudes, timing, and what to avoid. Use when designing any pubnyan animation."
---
# How pubnyan moves

- Calm cat. Amplitudes are small: body scale within 1 +- 0.02, position within 8 px, rotation within 6 degrees.
- The star mouth and the orbital ring are the identity elements. Never distort the mouth; suggest ring motion with `ring-gap-l/r` scale changes in alternating phase.
- Blinks are a scale-y squash of both eye whites and both pupils to about 0.08 over 0.1 s in and 0.12 s out, with `easeIn` then `easeOut`.
- Expression changes cross-fade in 0.2 to 0.4 s; hold the new expression for at least 0.5 s before returning.
- One-shot reactions are 0.3 to 0.8 s and return exactly to rest so they can follow the idle loop.
- Use `inOutSine` for anything that breathes or sways, `easeOut` for arrivals, `outBack` sparingly for a bounce.
- A looping clip must end where it starts.
