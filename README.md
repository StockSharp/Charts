# StockSharp JS Trading Charts

In-house, dependency-free canvas trading-chart engine (**sschart**) plus the full
StockSharp web-terminal chart stack, packaged as a standalone library with a
self-contained demo.

`sschart` renders candlestick / OHLC, study and footprint charts on a plain
`<canvas>` through a small declarative API (`createChart`, `addSeries`,
`setData` / `update`, `timeScale`, series markers, price lines, crosshair),
published as the `SSChart` global.

**▶ Live demo: https://stocksharp.github.io/Charts/demo/** — built and published on
every push to `main` by [`.github/workflows/pages.yml`](.github/workflows/pages.yml)
(enable Pages with *Source: GitHub Actions* in the repo settings).

## What's here

```
src/sschart.ts        the chart engine (single file, no runtime deps)
src/chart/            the terminal chart stack, ported verbatim from Broker.Web.Trader:
  indicators/         IndicatorEngine + IndicatorRenderer + IndicatorSettings +
                      calc/ (≈160 indicator implementations)
  chart-legend.ts     OHLCV + indicator-value legend (crosshair-driven)
  chart-context-menu.ts   right-click menu
  chart-pane-manager.ts   oscillator sub-panes (spine-synced time axes)
  indicator-dialog.ts     indicator picker (search / categories / params / active list)
  chart-type-switcher.ts  candle / bar / line / area / heikin / renko / P&F / cluster / box
  i18n.ts, utils.ts   minimal shims (English fallback, formatPrice + showToast)
  app.ts              demo wiring — drives the modules exactly as terminal-app.ts does
demo/                 the showcase (index.html + terminal CSS + seeded market data)
build.mjs             esbuild -> dist/sschart.js (SSChart global) + dist/chart-app.js
```

The chart modules are the **same code the web terminal runs** — they were lifted
out and decoupled from the terminal's Bootstrap / DI infrastructure so they build
standalone. The engine (`src/sschart.ts`) is the shared source of truth; the demo
loads it as the `SSChart` global, then the chart-stack bundle on top.

## Demo

`demo/index.html` is a live trading chart driven by the real modules:

- **Main chart** — candlestick with volume, trade markers and a crosshair legend;
  the chart-type dropdown switches the render between candlestick, bar, line, area,
  Heikin-Ashi, Renko, Point & Figure, cluster (footprint) and box.
- **Indicators** — a **+ Indicator** button / right-click *Add indicator…* opens the
  real picker over the full StockSharp indicator catalog; overlays draw on the main
  chart, oscillators (RSI, MACD, …) get their own spine-synced sub-pane with a proper
  0–100 scale; the legend shows each study's value at the crosshair. All recompute
  live on the streaming feed.
- **Light / dark** theme toggle re-colours the whole stack, and a play/pause
  **Realtime** feed streams new bars with live indicator recompute.

## Build & view

```
npm install        # once, to fetch esbuild
npm run build      # bundles src -> dist/
npm run serve      # http://localhost:8791/demo/index.html
npm test           # the ported indicator suite (163 files) against src/chart/indicators/calc
```

## Tests

The indicator unit tests (`tests/indicators/*.test.js`, ported from the web
terminal) run every `calc/` implementation and are the single source of truth for
indicator correctness. `build-tests.mjs` esbuild-bundles them into `tests/_dist`,
then `node --test` runs them.

## Notes

- Porting the stack surfaced and fixed a few latent engine bugs (chart-level
  `priceScale(id)`, whitespace/warm-up points poisoning the price-scale bounds,
  a fallback for ordinal sub-pane scales, `scrollToRealTime`). These live in
  `src/sschart.ts` here; folding them back into the terminal's copy is a follow-up.
