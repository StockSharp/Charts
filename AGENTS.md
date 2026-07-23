# AGENTS.md -- Charts

## What this is

`sschart` (npm name, `private`, `v0.1.0`) is an in-house, dependency-free canvas
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
| `npm test` | `typecheck:core` + `api:check` + bundle unit tests (`build-tests.mjs`) + `node --test` over `tests/_dist/**/*.test.cjs` |
| `npm run typecheck:core` | `tsc -p tsconfig.typecheck.json` (no emit) |
| `npm run api:check` / `api:update` | verify / regenerate the public-API snapshot |
| `npm run test:browser` | build + build browser fixtures + Playwright (`tests/browser`) |
| `npm run test:browser:update` | same, but rewrites visual snapshots |
| `npm run test:performance` | Playwright perf specs, `--project=chromium-dpr1` |

`npm test` is Node-only and needs no browser or .NET SDK. Browser tests need
`npx playwright install --with-deps chromium` first.

## Layout

```
src/sschart.ts   the engine (single file, no deps); src/index.ts exports the SSChart global
src/chart/       terminal chart stack: app.ts (demo wiring), indicators/ (calc + catalog.json),
                 chart-legend, chart-pane-manager, chart-context-menu, indicator-dialog,
                 chart-type-switcher, i18n, utils
src/core, data, drawings, orderflow, persistence, primitives, series, time, trading, workspace
demo/            index.html + CSS + seeded sample-data.js (the GitHub Pages site)
tests/           node:test unit specs (*.test.js, incl. tests/indicators/ — 163 files),
                 tests/browser/ (Playwright *.spec.ts + visual snapshots),
                 tests/api/sschart.d.ts (public-API snapshot), tests/types/ (type-level tests)
tools/           check-public-api.mjs, public-api-manifest.mjs, csharp-catalog/ (.NET parity dumper)
build*.mjs       build.mjs (bundles), build-tests.mjs, build-browser-fixtures.mjs, serve.mjs
```

Build outputs are git-ignored: `dist/`, `tests/_dist/`, `test-results/`,
`playwright-report/`, `tests/browser/fixtures/_dist/`.

## Conventions

- Engine API `time` is UNIX **seconds** (not ms).
- Order flow uses explicit `FootprintBar` / `ApproximateFootprintBar`
  discriminated contracts — the library never invents a bid/ask split or passes
  candle-volume distribution off as exact footprint data. Keep that separation.
- Indicators are drawn as plain lines unless a `catalog.json` entry names a
  registered `painter`; unknown painter names fall back to lines safely.

## Releasing / publishing

No npm/nuget artifact — the deliverable is the **demo site**. `.github/workflows/pages.yml`
runs on push/PR to `main`: `npm ci` -> `npm run build` -> `npm test` -> install
chromium -> `npm run test:browser` -> stage `demo/` + `dist/` -> deploy to
GitHub Pages (`https://stocksharp.github.io/Charts/demo/`). Node 22 in CI.

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
  checkout and prints the authoritative StockSharp indicator catalog/values. The
  parity tests (`parity.test.js`, `numeric-parity.test.js`) invoke `dotnet` at test
  time and **skip** when the SDK or that checkout is absent, so the node-only suite
  still passes. Do not commit a static catalog fixture — it is intentionally live.
- Chart modules are the same code the web terminal runs; engine bug fixes made
  here still need folding back into the terminal's copy (tracked as follow-up).
