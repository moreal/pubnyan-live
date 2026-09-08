# pubnyan-live

Animations of pubnyan, the [Hackers' Pub](https://hackers.pub/) mascot, defined once in a small motion DSL and exported to animated SVG, Lottie, Rive, and video.

## Layout

- `vendor/visual-identity/` — the source artwork (git submodule).
- `rig/` — `parts.map.json` names the artwork's paths; `*.rig.json` is generated from it by `npm run rig:extract`.
- `motion/` — the single definition: `clips/*.clip.ts` (plus `machine.ts`, planned; see `docs/backlog.md`).
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
npm run check          # type check + tests + verify
npm run agent -- 1     # let the Flue director complete one backlog item (needs ANTHROPIC_API_KEY in .env, or a pi login: `pi` then /login; mints a Claude subscription OAuth token via `pi auth print-bearer-token`, billed as extra usage per pi's docs)
                        # the artist subagent (graphics/visual items) runs on openai-codex/gpt-6-astra and authenticates via a ChatGPT Plus/Pro (Codex) subscription; run `pi login openai-codex` once to connect it
```

## GitHub Pages

`.github/workflows/pages.yml` publishes https://moreal.github.io/pubnyan-live/ on every push to `main` (and via `workflow_dispatch`):

- `/` — the landing page from `site/` (plain HTML/CSS/JS; the Rive and Lottie runtimes are copied from `node_modules`).
- `/_storybook/` — the Storybook build.
- `/assets/{svg,lottie,rive,video}/` — the exported clips, `/assets/still/` — the resting poses from `rig/preview/`.

`npm run site:build` assembles all of it in `dist/site` (`scripts/site-build.mjs`; set `STORYBOOK_BASE` to `<pages base>/_storybook/` so the Storybook chunks resolve under the subpath). `npm run site:smoke` serves `dist/site` and checks the landing page and the Storybook subpath in headless Chrome; add `--shots <dir>` for screenshots. One-time setup: in the repository settings, under **Settings → Pages**, set **Source** to **GitHub Actions**.

## Output notes

The `dist/svg` files morph shapes with CSS `d: path()`, which needs a browser that supports it (Chromium, Firefox 97+). Shapes whose segment sequences differ crossfade instead, and that output is universal.

## Install scripts

`package.json` `allowScripts` pins the packages whose install scripts npm 11 may run — puppeteer's Chrome download among them. Update those entries whenever the pinned versions change, or the download is skipped and every headless render fails.

## License

The code in this repository is licensed under the [MIT License](LICENSE).

## Attribution

The pubnyan artwork is © 2025 Bak Eunji, licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), from [hackers-pub/visual-identity](https://github.com/hackers-pub/visual-identity). Every file under `dist/` carries this attribution and is licensed under the same terms.
