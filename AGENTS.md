# AGENTS.md -- Charts

## What this is

`@stocksharp/chart` (see `package.json` for the current version) is an in-house, dependency-free canvas
trading-chart engine with a lightweight-charts-shaped API, published as the
`window.SSChart` global. `src/sschart.ts` is the engine (single file, no runtime
deps); `src/chart/` is the full StockSharp web-terminal chart stack (indicator
engine over ~160 indicators, legend, panes, context menu, picker dialog),
ported verbatim from `Broker.Web.Trader` and decoupled so it builds standalone.
`demo/` is a live showcase deployed to GitHub Pages.

This is a **TypeScript / Node** repo (ESM, `"type": "module"`) built with
**esbuild** — no bundler config framework, no runtime dependencies. Dev deps are
only `esbuild`, `typescript`, `@playwright/test`.

Workspace-wide agent rules live in the configs repo (`configs/instructions.md`)
and load automatically; this file is repo-specific only.

## Build, test, run

`npm install` once (fetches esbuild / playwright / typescript). Then:

| Command | What it does |
|---|---|
| `npm run build` | esbuild `src` -> `dist/sschart.js` (SSChart global) + `dist/chart-app.js` |
| `npm run serve` | static server on `http://localhost:8791/demo/index.html` (HOST/PORT env overridable; default HOST `0.0.0.0` so it is LAN-reachable) |
| `npm test` | `typecheck:core` + `api:check` + bundle unit tests (`build-tests.mjs`) + build the C# parity dump (`tools/parity-dump.mjs`) + `node --test` over `tests/_dist/**/*.test.cjs` |
| `npm run typecheck:core` | `tsc -p tsconfig.typecheck.json` (no emit) — covers `src/core/**` **and `src/chart/**`** |
| `npm run api:check` / `api:update` | verify / regenerate the public-API snapshot |
| `npm run test:browser` | build + build browser fixtures + Playwright (`tests/browser`) |
| `npm run test:browser:update` | same, but rewrites visual snapshots |
| `npm run test:performance` | Playwright perf specs, `--project=chromium-dpr1` |

`npm test` needs no browser. It does not need the .NET SDK either, but with the
SDK **and** a sibling `StockSharp (GitHub)` checkout present it additionally runs
the seven parity tests that compare the port against the real platform; without
them `tools/parity-dump.mjs` records why and those tests skip with that reason
named. Browser tests need `npx playwright install --with-deps chromium` first.

## Layout

```
src/sschart.ts   the engine (single file, no deps); src/index.ts exports the SSChart global
src/chart/       terminal chart stack: app.ts (demo wiring), indicators/ (calc + catalog.json),
                 chart-legend, chart-pane-manager, chart-context-menu, indicator-dialog,
                 chart-type-switcher, i18n, utils
src/core, data, drawings, orderflow, persistence, primitives, series, time, trading, workspace
demo/            index.html + CSS + seeded sample-data.js (the GitHub Pages site)
tests/           node:test unit specs (*.test.js, incl. tests/indicators/ — 163 files),
                 headless-dom.js + chart-construction.test.js (construct a real chart, no browser),
                 csharp-dump.js (reads the cached C# dump), render/recording-context.js,
                 tests/browser/ (Playwright *.spec.ts + visual snapshots),
                 tests/api/sschart.d.ts (public-API snapshot), tests/types/ (type-level tests)
tools/           check-public-api.mjs, public-api-manifest.mjs, parity-dump.mjs,
                 csharp-catalog/ (.NET parity dumper)
build*.mjs       build.mjs (bundles), build-tests.mjs, build-browser-fixtures.mjs, serve.mjs
```

Build outputs are git-ignored: `dist/`, `tests/_dist/`, `test-results/`,
`playwright-report/`, `tests/browser/fixtures/_dist/`, `.parity-cache/`.

## Conventions

- Engine API `time` is UNIX **seconds** (not ms).
- Order flow uses explicit `FootprintBar` / `ApproximateFootprintBar`
  discriminated contracts — the library never invents a bid/ask split or passes
  candle-volume distribution off as exact footprint data. Keep that separation.
- Indicators are drawn as plain lines unless a `catalog.json` entry names a
  registered `painter`; unknown painter names fall back to lines safely.

## Releasing / publishing

No npm/nuget artifact — the deliverable is the **demo site**. `.github/workflows/pages.yml`
runs on push/PR to `main`: `npm ci` -> `npm run build` -> `npm test` -> stage
`demo/` + `dist/` -> deploy to GitHub Pages
(`https://stocksharp.github.io/Charts/demo/`). Node 22 in CI.

**Two suites do NOT run in CI, by design — know what that costs you.**
- Playwright. GitHub never launches a browser here; rendering is covered
  browser-free by the draw-call snapshots in `tests/render/**`, and the
  interaction / hit-test / lifecycle specs are a local `npm run test:browser`.
- The seven C# parity tests. CI checks out only this repo, so the sibling
  StockSharp source the dumper compiles against is absent and they skip with
  `stocksharp-checkout-absent`. Nothing that compares the port against the real
  platform is verified on a push — run `npm test` locally with the checkout
  present before trusting an indicator change.

## Gotchas / do not break

- **Public API is snapshot-gated.** `check-public-api.mjs` emits declarations via
  `tsconfig.api.json` and diffs them against `tests/api/sschart.d.ts`. Any public
  surface change fails `npm test` until you run `npm run api:update` and commit the
  updated snapshot.
- **Visual snapshots are strict** (`maxDiffPixelRatio: 0.002`, two DPR projects).
  Playwright pins `colorScheme: dark`, `locale: en-US`, `timezoneId: UTC` for
  determinism — don't change those casually. Regenerate with
  `npm run test:browser:update` only when a render change is intended.
- **Parity test reads C# live, no fixture.** `tools/csharp-catalog` is a .NET
  (`net10.0`) dumper that references a sibling `..\..\..\StockSharp (GitHub)\Algo.Indicators`
  checkout and prints the authoritative StockSharp indicator catalog/values. Do not
  commit a static catalog fixture — it is intentionally live. `tools/parity-dump.mjs`
  runs it **once** before `node --test` and caches the JSON in `.parity-cache/`; the
  two parity files only read that cache. Never go back to invoking `dotnet` from
  inside a test file: node:test runs the files in parallel workers, and two
  concurrent builds of the same project fail with `CS2012` on the shared obj output.
  Consequently `node --test` on `tests/_dist` **without** the prep step now fails
  those two files instead of skipping them — run `npm test`.
- **A parity skip must name its reason.** Exactly three conditions skip:
  `stocksharp-checkout-absent`, `dotnet-missing`, `dotnet-sdk-missing`. Anything
  else — a failing build, a crashing dumper, non-JSON output, an unparsable cache —
  is a hard failure. Do not add a `catch` that turns a new failure mode into a
  skip; the suite spent a long time reporting itself green that way.
- **Parity exemptions are exact allow-lists.** `NO_JS_CALC`, `NON_SCALAR`,
  `PANE_DELTAS` and `PARAM_COUNT_DELTAS` are asserted in both directions: an
  unlisted divergence fails, and so does a list entry that no longer applies. When
  you fix one, delete its entry — don't leave it behind.
- **Indicator semantics follow `[IndicatorIn]`, not the C# source's variable
  names.** `Highest.OnProcessDecimal` reads `input.ToCandle().HighPrice`, which
  looks like the bar high but is the **close**: the class inherits
  `[IndicatorIn(typeof(DecimalIndicatorValue))]`, and wrapping a decimal in a
  candle makes O/H/L/C identical. Check the attribute before porting anything, and
  check the pinned vectors in `StockSharp (GitHub)/Tests/Resources/IndicatorsData`.
- **`createChart` requires a real `HTMLElement`.** The constructor writes
  `dataset`, `style`, `className` and calls `append`/`appendChild`/`getContext`.
  `tests/headless-dom.js` is the sanctioned browser-free double, and
  `chart-construction.test.js` pins that surface so a new DOM dependency fails here
  rather than in a downstream harness.
- Chart modules are the same code the web terminal runs; engine bug fixes made
  here still need folding back into the terminal's copy (tracked as follow-up).
