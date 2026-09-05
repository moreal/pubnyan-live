# pubnyan-live

Animations of pubnyan, the [Hackers' Pub](https://hackers.pub/) mascot, defined once in a small motion DSL and exported to animated SVG, Lottie, Rive, and video.

## Layout

- `vendor/visual-identity/` — the source artwork (git submodule).
- `rig/` — `parts.map.json` names the artwork's paths; `*.rig.json` is generated from it by `npm run rig:extract`.
- `motion/` — the single definition: `clips/*.clip.ts` and `machine.ts`.
- `packages/` — `ir` (types, validation, sampling), `rig-extract`, `export-*`, `verify`.
- `dist/` — exported output per target.
- `docs/backlog.md` — the work queue shared by humans and agents.

## Commands

```
npm install
git submodule update --init
npm run rig:extract     # regenerate rig/*.rig.json and rig/preview/
npm run export:svg      # write dist/svg/<clip>.svg
npm run verify          # export every target, check parity against the reference sampler
npm test
npm run check:types
```

## Attribution

The pubnyan artwork is © 2025 Bak Eunji, licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), from [hackers-pub/visual-identity](https://github.com/hackers-pub/visual-identity). Every file under `dist/` carries this attribution and is licensed under the same terms.
