---
name: clip-dsl
description: How to write a clip in motion/clips, register it, and prove it with the check suite. Use for any animation task.
---
# Clip DSL

One file per clip in `motion/clips/<name>.clip.ts`:

```ts
import { clip, key, track } from '#ir/clip.ts';
export default clip('nod', { rig: 'pubnyan', duration: 0.6, fps: 30, loop: false }, [
  track('body', 'position', [key(0, [0, 0]), key(0.25, [0, 6], 'easeOut'), key(0.6, [0, 0], 'inOutSine')]),
]);
```

- `track(part, property, keys)`; property is `position` ([dx, dy] px), `rotation` (degrees about the pivot), `scale` ([sx, sy]), `opacity` (0..1, the part's own shapes only, children do not inherit), or `shape` (an expression name or `default`).
- `key(t, value, ease?)`; t in seconds; the ease belongs to the segment that ENDS at this key. Eases: linear, easeIn, easeOut, easeInOut, inOutSine, outQuint, outBack.
- One track per (part, property). Key times strictly increasing within [0, duration].
- Looping clips must end where they start (rotation may differ by a multiple of 360); the validator rejects anything else.
- Register the clip in `motion/index.ts` (import it and add it to `clips`). Validation runs at module load, so a bad clip fails every command with a message naming the key.
- Prove it: call `run_checks` (or run `npm run check`). Then read `dist/verify/<clip>-contact.png`: top row is the reference sampler, second row the SVG export; they must look identical and the motion must read as intended.
- Exports land in `dist/svg/<clip>.svg`; commit `dist/svg` with the clip.
- Reference: `motion/README.md`, `motion/clips/idle.clip.ts`.
