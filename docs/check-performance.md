# Full-check performance investigation

Measured locally on 2026-09-12: Apple M1 Max (10 available cores), macOS arm64,
Node v26.8.2, Google Chrome 153.0.8010.37. CodSpeed is disabled for this repository.

## Where the time goes

The pre-change check runs type checking, Vitest, and verification sequentially.
An observed Vitest run took 210.9 seconds; the complete check exceeded its former
15-minute tool timeout while verification was generating videos.

The verifier itself had two serial loops: all clips and targets for parity,
then all clips for video. For the 22 registered clips, the unchanged sampler
produces 1,228 parity times. Three targets previously caused **3,684 reference
renders** plus 3,684 target renders. Reusing references per clip removes **2,456
screenshots**, leaving 1,228 reference renders. Video adds another 2,527 frames.
These counts exclude verification fixtures and the combined-machine checks.

Parent Node CPU profiles of the representative workload attributed about 81% of
parity time and 98% of video time to idle samples. These profiles exclude Chrome
and encoder CPU usage: the parent spends much of its time waiting for those
processes, so independent clip jobs can overlap usefully. The largest visible
Node work included DevTools/WebSocket transport, PNG processing, and comparisons.

## Changes

- Cache reference frames only within a clip, preserving every target, sample,
  threshold, skipped-time decision, and worst-frame tie rule.
- Use a bounded clip pool, defaulting to two workers, or one on a single-core
  machine. `VERIFY_WORKERS=1` retains serial execution for diagnosis.
- Give each worker its own Renderer and Chrome page. A page's viewport, document,
  animation time, and screenshot state must never be used by concurrent jobs.
- Preserve input order in `report.json`, even when jobs finish out of order.
  Stop assigning new jobs on failure, drain active work, and dispose resources.
- Parallelize video **clips**. Formats within a clip remain sequential, avoiding
  nested encoder oversubscription and preserving the palette-before-GIF dependency.
- Reset each ready-render operation's readiness/error flags. The old flags could
  return a screenshot early or leak an earlier error into a later operation.
  Also close a browser if page initialization fails.
- Record phase and per-clip timings in `dist/verify/timings.json`.

Machine transition steps remain sequential because later steps depend on the
previous pose. Vitest and verify remain sequential because both write/read the
same `dist/svg/<clip>.svg` paths. More global concurrency requires output isolation.

## Local measurements

The representative workload uses `expr-curious` and `expr-cry`: every existing
parity sample for all three targets, worst-frame images and contact sheets,
followed by all video frames and MP4/WebP/GIF encoding. The baseline was an isolated
copy of the pre-optimization code at `8f2d773`. Runs used the same host and Chrome;
Node CPU profiling was enabled for each measured process. Output files were
isolated and each benchmark stage ran without another browser benchmark or check.

| Variant | Parity | Video |
| --- | ---: | ---: |
| Original serial verifier | 111.8 s | 54.4 s |
| Reference reuse, one worker | 88.6 s | 47.2 s |
| Reference reuse, two workers, run 1 | 49.6 s | 18.5 s |
| Reference reuse, two workers, run 2 | 50.1 s | 18.0 s |

The two-worker runs reduced this workload's parity time by about 55% and video
time by about 66% relative to the original run. This is a small local sample,
not a prediction of the same percentage for the full test/check suite. Browser
scheduling, encoder caches, other host activity, and hardware affect wall time.

## Reproduce and inspect

```sh
npm run verify:bench -- --workers 1
npm run verify:bench -- --workers 2
npm run verify:bench -- --workers 2 --stage parity
npm run verify:bench -- --workers 2 --clips idle,expr-cry
node --cpu-prof --cpu-prof-dir=dist/verify scripts/benchmark-verify.mjs --workers 2
VERIFY_WORKERS=2 npm run check
```

Benchmark JSON is written to `dist/verify/benchmark-<n>-workers.json`; repeated
runs with the same worker count overwrite that file, so copy it before the next
run when retaining a history. Run benchmarks alone. Chrome can be selected with
Puppeteer's `PUPPETEER_EXECUTABLE_PATH` when its downloaded browser is unavailable.

The phase times include pool startup/cleanup; individual clip times exclude pool
startup. Concurrent clip times are overlapping durations and must not be summed
as elapsed phase time. Total verify timing ends before the final manifest/report
writes. The generated reports/profiles stay untracked under `dist/verify`.

## Remaining opportunities

Per-frame target preparation still rereads/serializes SVG, Lottie, and Rive data.
A per-clip preparation API could avoid that work while retaining export/readback
coverage. PNG comparison still runs synchronously on the Node thread. The timing
report distinguishes reference, target, and contact-sheet costs for the next pass.

The full SVG integration test also repeats coverage later performed by verify.
Consolidating it needs a deliberate coverage decision. The commit/check cache is
whole-tree based; direct `npm run check` does not populate it, and generated asset
changes can invalidate it. Stage-specific caching needs input/output and toolchain
fingerprints, plus protection against source edits during a check.
