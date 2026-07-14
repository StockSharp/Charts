// Standalone demo wiring for the real terminal chart stack. This bundles the
// actual IndicatorEngine / IndicatorRenderer / ChartPaneManager / ChartLegend /
// ChartContextMenu / IndicatorDialog modules (ported verbatim from the web
// terminal) and drives them exactly the way terminal-app.ts does — no
// reimplementation. The sschart engine is loaded separately and published as the
// `SSChart` global; the modules reference it as a bare global.
import { IndicatorEngine } from './indicators/indicator-engine.js';
import { IndicatorRenderer } from './indicators/indicator-renderer.js';
import { ChartPaneManager } from './chart-pane-manager.js';
import { ChartLegend } from './chart-legend.js';
import { ChartContextMenu } from './chart-context-menu.js';
import { IndicatorDialog } from './indicator-dialog.js';
import { ChartTypeSwitcher } from './chart-type-switcher.js';
import { TerminalUtils } from './utils.js';
import { T } from './i18n.js';

declare const SSChart: any;

// Globals the ported modules read at runtime (same names the terminal exposes).
(window as any).TerminalUtils = TerminalUtils;
(window as any).T = T;

function boot() {
    const S = (window as any).SampleData;
    const container = document.getElementById('chartContainer');
    if (!container || !S) return;

    // Light / dark chart palettes. The page chrome re-themes automatically via
    // terminal.css's [data-bs-theme] CSS vars; the chart canvases (main chart +
    // every sub-pane) are re-coloured explicitly by applyTheme().
    const THEMES: any = {
        dark:  { surf: '#131820', text: '#8b97a7', grid: 'rgba(30,38,51,0.4)',  border: '#1e2633', cross: 'rgba(74,158,255,0.30)', crossLabel: '#4a9eff', up: '#00c853', down: '#ff3d57' },
        light: { surf: '#ffffff', text: '#5b6b7f', grid: 'rgba(148,163,184,0.28)', border: '#e2e8f0', cross: 'rgba(217,119,6,0.35)',  crossLabel: '#d97706', up: '#16a34a', down: '#dc2626' },
    };
    let themeName = 'dark';
    const chartTheme = (p: any) => ({
        layout: { background: { type: 'solid', color: p.surf }, textColor: p.text, fontFamily: "'IBM Plex Mono','Consolas',monospace", fontSize: 11, attributionLogo: false },
        grid: { vertLines: { color: p.grid }, horzLines: { color: p.grid } },
        rightPriceScale: { borderColor: p.border },
        leftPriceScale: { borderColor: p.border },
        timeScale: { borderColor: p.border, timeVisible: true, secondsVisible: false },
        crosshair: { mode: SSChart.CrosshairMode.Normal,
                     vertLine: { color: p.cross, labelBackgroundColor: p.crossLabel },
                     horzLine: { color: p.cross, labelBackgroundColor: p.crossLabel } },
    });

    const chart = SSChart.createChart(container, chartTheme(THEMES.dark));

    let candleSeries = chart.addSeries(SSChart.CandlestickSeries, {
        upColor: THEMES.dark.up, downColor: THEMES.dark.down, borderVisible: false, wickUpColor: THEMES.dark.up, wickDownColor: THEMES.dark.down,
    });
    const volumeSeries = chart.addSeries(SSChart.HistogramSeries, { priceScaleId: '', priceFormat: { type: 'volume' } });
    try { volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } }); } catch { /* */ }

    // The live candle window — shared BY REFERENCE with the indicator engine.
    const live = S.candles.map((c: any) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.vol, levels: c.levels }));
    const volColor = (c: any) => (c.close >= c.open ? 'rgba(0,200,83,0.4)' : 'rgba(255,61,87,0.4)');
    candleSeries.setData(live);
    volumeSeries.setData(live.map((c: any) => ({ time: c.time, value: c.volume, color: volColor(c) })));
    try { if (SSChart.createSeriesMarkers && S.markers) SSChart.createSeriesMarkers(candleSeries, S.markers); } catch { /* */ }
    chart.timeScale().fitContent();

    // Sub-pane manager for 'separate' (oscillator) indicators.
    const paneManager = new ChartPaneManager('chartContainer');
    paneManager.init(chart);

    // Indicator renderer + engine.
    const renderer = new IndicatorRenderer(chart);
    const engine = new IndicatorEngine();
    engine.setRenderer(renderer);
    engine.setPaneManager(paneManager);
    engine.setWsClient({});               // legacy no-op; truthy so add() isn't gated
    engine.onChange = () => { if (themeName !== 'dark') applyTheme(); };   // re-theme freshly-added sub-panes
    (window as any)._indicatorEngine = engine;
    engine.setCandles(live);              // shares the same array reference

    // Crosshair legend (OHLCV + indicator values; overlays in the main legend,
    // oscillators in each sub-pane header).
    const legend = new ChartLegend();
    legend.init('chartLegend', chart);
    legend.setIndicatorEngine(engine);
    legend.setRawCandles(live);

    // Indicator picker dialog.
    const dialog = new IndicatorDialog();
    dialog.init('indicatorModal', engine);

    // Edit hook fired by the legend ✎ and the sub-pane header ✎ buttons.
    const openIndicatorEdit = (id: number, type: string) => { dialog.show(); (dialog as any)._showSettings(type, id); };
    legend.onEditIndicator = openIndicatorEdit;
    (window as any).terminalApp = { openIndicatorEdit };

    // Right-click context menu ("Add indicator…" opens the dialog).
    const menu = new ChartContextMenu();
    menu.init(container, candleSeries, { onAddIndicator: () => dialog.show() });

    // Chart-type switcher (candle / bar / line / area / heikin), driven by the
    // legend's per-pane chart-type dropdown.
    const typeSwitcher = new ChartTypeSwitcher();
    typeSwitcher.init(chart, candleSeries, volumeSeries);
    typeSwitcher.setRawCandles(live);   // shares the ref, so it always rebuilds from the live window
    let currentType = 'candlestick';
    legend.onChartTypeChange = (type: string) => {
        const s = typeSwitcher.switchType(type);
        if (s) { candleSeries = s; menu.setCandleSeries(s); }
        currentType = type;
        // Renko / P&F re-bin price into bricks / columns — a different bar count
        // than the candles. Recompute every indicator on those derived bars (via
        // the engine transforms) so overlays / oscillators line up natively; drop
        // the volume histogram (Renko / P&F are volume-agnostic). Time-aligned
        // types feed the raw candles back and restore the volume.
        if (type === 'renko' || type === 'pf') {
            engine.setCandles(type === 'renko' ? SSChart.renkoBars(live) : SSChart.pnfBars(live));
            volumeSeries.setData([]);
        } else {
            engine.setCandles(live);
            volumeSeries.setData(live.map((c: any) => ({ time: c.time, value: c.volume, color: volColor(c) })));
        }
    };

    // Toolbar buttons.
    const addBtn = document.getElementById('addIndicatorBtn');
    if (addBtn) addBtn.addEventListener('click', () => dialog.show());
    const fitBtn = document.getElementById('fitBtn');
    if (fitBtn) fitBtn.addEventListener('click', () => chart.timeScale().fitContent());

    // Theme toggle: flips the page chrome (terminal.css [data-bs-theme] vars) and
    // re-colours every chart canvas — main chart + candle series + all sub-panes.
    function applyTheme() {
        const p = THEMES[themeName];
        document.documentElement.setAttribute('data-bs-theme', themeName);
        const opts = chartTheme(p);
        chart.applyOptions(opts);
        candleSeries.applyOptions({ upColor: p.up, downColor: p.down, wickUpColor: p.up, wickDownColor: p.down });
        paneManager.getPanes().forEach((id: string) => { const c = paneManager.getChart(id); if (c) c.applyOptions(opts); });
        const tb = document.getElementById('themeBtn');
        if (tb) tb.innerHTML = themeName === 'dark' ? '☀ Light' : '☾ Dark';
    }
    const themeBtn = document.getElementById('themeBtn');
    if (themeBtn) themeBtn.addEventListener('click', () => { themeName = themeName === 'dark' ? 'light' : 'dark'; applyTheme(); });

    // Default studies (one overlay + one sub-pane) so the chart is populated.
    engine.add('BollingerBands', { period: 20, stdDev: 2 });
    engine.add('RSI', { period: 14 });
    legend.refresh();

    // ---- realtime feed: mutate the shared array in place, then let the engine
    //      recompute every indicator (exactly the terminal's live path) ----
    const feed = S.makeFeed();
    let timer: any = null;
    function step() {
        const bar = feed.next(5);
        const lv = S.levelsFor(bar);   // per-bar volume-by-price for the footprint (cluster / box) types
        const last = live[live.length - 1];
        if (bar.time === last.time) {
            last.open = bar.open; last.high = bar.high; last.low = bar.low; last.close = bar.close; last.volume = bar.vol; last.levels = lv;
        } else {
            live.push({ time: bar.time, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.vol, levels: lv });
        }
        typeSwitcher.updatePrice({ time: bar.time, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.vol, levels: lv });
        const derived = currentType === 'renko' || currentType === 'pf';
        if (!derived) volumeSeries.update({ time: bar.time, value: bar.vol, color: volColor(bar) });
        try { chart.timeScale().scrollToRealTime(); } catch { /* */ }
        // Renko / P&F: rebuild the derived bars from the grown window and recompute
        // the studies on them; time-aligned types take the coalesced live path.
        if (derived) engine.setCandles(currentType === 'renko' ? SSChart.renkoBars(live) : SSChart.pnfBars(live));
        else engine.onLiveUpdate();      // RAF-coalesced recompute of every indicator
        legend.setRawCandles(live);
        legend.refresh();
    }
    const rtBtn = document.getElementById('realtimeBtn');
    if (rtBtn) rtBtn.addEventListener('click', () => {
        if (timer) { clearInterval(timer); timer = null; rtBtn.classList.remove('on'); }
        else { timer = setInterval(step, 350); rtBtn.classList.add('on'); }
    });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
