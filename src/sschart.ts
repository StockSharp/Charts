// sschart — in-house canvas trading chart. Built as an IIFE that
// publishes the runtime as `window.SSChart` so the existing
// call sites (chart-view.ts, backtest/optimize controllers,
// terminal-app chart widgets) bind unchanged.
//
// Contract surface:
//   createChart, ColorType, {Candlestick,Line,Histogram,Area}Series,
//   createSeriesMarkers, chart.addSeries/timeScale/subscribeCrosshairMove/
//   resize/remove, series.setData/applyOptions,
//   timeScale().fitContent/subscribeVisibleTimeRangeChange/setVisibleRange.
//
// Dependency-free, pure 2D canvas — a faithful behavioural fit for
// what the app actually consumes.

export type Time = number; // UNIX seconds (the only form the app feeds)

export interface WhitespaceData { time: Time }
export interface CandlestickData { time: Time; open: number; high: number; low: number; close: number }
export interface LineData { time: Time; value: number }
export interface HistogramData { time: Time; value: number; color?: string }
export interface AreaData { time: Time; value: number }

export type SeriesKind = 'Candlestick' | 'Bar' | 'Line' | 'Histogram' | 'Area'
    | 'PointFigure' | 'Renko' | 'VolumeProfile' | 'Cluster' | 'Box';
export interface SeriesDefinition { type: SeriesKind }

export const CandlestickSeries: SeriesDefinition = { type: 'Candlestick' };
export const BarSeries: SeriesDefinition = { type: 'Bar' };
export const LineSeries: SeriesDefinition = { type: 'Line' };
export const HistogramSeries: SeriesDefinition = { type: 'Histogram' };
export const AreaSeries: SeriesDefinition = { type: 'Area' };
export const PointFigureSeries: SeriesDefinition = { type: 'PointFigure' };
export const RenkoSeries: SeriesDefinition = { type: 'Renko' };
export const VolumeProfileSeries: SeriesDefinition = { type: 'VolumeProfile' };
export const ClusterSeries: SeriesDefinition = { type: 'Cluster' };
export const BoxSeries2: SeriesDefinition = { type: 'Box' };

export const ColorType = { Solid: 'solid', VerticalGradient: 'gradient' } as const;

// LineStyle enum (createPriceLine consumers pass
// `SSChart.LineStyle.Solid` etc. against the runtime global).
export const LineStyle = {
    Solid: 0, Dotted: 1, Dashed: 2, LargeDashed: 3, SparseDotted: 4,
} as const;
export type LineStyleValue = typeof LineStyle[keyof typeof LineStyle];

// Crosshair mode values (Magnet=0, Normal=1). In
// Magnet mode the horizontal crosshair and the right-axis price pill
// snap to the nearest OHLC level of the bar under the cursor — useful
// when placing alerts/orders exactly at a candle close.
export const CrosshairMode = { Magnet: 0, Normal: 1 } as const;
export type CrosshairModeValue = typeof CrosshairMode[keyof typeof CrosshairMode];

// Price-scale display mode (Normal / Logarithmic).
export const PriceScaleMode = { Normal: 0, Logarithmic: 1 } as const;
export type PriceScaleModeValue = typeof PriceScaleMode[keyof typeof PriceScaleMode];

// Per-series horizontal "price line" — used by the terminal/host to draw
// resting orders, alerts, breakeven, preview-on-Ctrl, etc. createPriceLine
// returns an opaque handle with applyOptions/options.
export interface PriceLineOptions {
    price: number;
    color?: string;
    lineWidth?: number;
    lineStyle?: LineStyleValue;
    lineVisible?: boolean;
    axisLabelVisible?: boolean;
    axisLabelColor?: string;
    axisLabelTextColor?: string;
    title?: string;
    id?: string;
    // True while the host is actively dragging this line. Its label
    // skips the easing pass (snaps straight to target) so it never
    // trails the cursor on a fast pull, while still acting as the
    // immovable anchor that other labels yield to during collision.
    anchored?: boolean;
}
export interface IPriceLine {
    applyOptions(patch: Partial<PriceLineOptions>): void;
    options(): PriceLineOptions;
}

export interface SeriesMarker {
    time: Time;
    position: 'aboveBar' | 'belowBar' | 'inBar';
    color: string;
    shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square';
    text?: string;
}

// Per-instrument price formatting (forex 5 decimals, crypto 8, indices 0).
export interface PriceFormat {
    type?: 'price' | 'volume' | 'percent';
    precision?: number;       // digits after the dot
    minMove?: number;         // smallest representable step (tickSize)
}

interface SeriesOptions {
    // candlestick
    upColor?: string; downColor?: string;
    borderVisible?: boolean; borderUpColor?: string; borderDownColor?: string;
    wickUpColor?: string; wickDownColor?: string;
    // line / area
    color?: string; lineColor?: string; lineWidth?: number;
    topColor?: string; bottomColor?: string;
    // histogram
    base?: number;
    // shared
    priceScaleId?: string;
    priceLineVisible?: boolean;
    lastValueVisible?: boolean;     // hide the per-series last-value pill on the right axis
    priceLineSource?: 'lastBar' | 'lastVisible';   // last-bar (default) or last-visible point
    priceFormat?: PriceFormat;
    // point&figure / renko
    boxSize?: number;
    reversal?: number;
}

interface ChartOptions {
    width?: number; height?: number;
    autoSize?: boolean;       // observe the host with ResizeObserver and re-fit
    layout?: { background?: { type?: string; color?: string }; textColor?: string; fontFamily?: string; attributionLogo?: boolean; fontSize?: number };
    // Optional watermark drawn over the plot background (under series).
    watermark?: {
        visible?: boolean;
        text?: string;
        color?: string;
        fontSize?: number;
        fontFamily?: string;
        fontStyle?: string;
        vertAlign?: 'top' | 'center' | 'bottom';
        horzAlign?: 'left' | 'center' | 'right';
    };
    grid?: { vertLines?: { color?: string; visible?: boolean }; horzLines?: { color?: string; visible?: boolean } };
    rightPriceScale?: { borderColor?: string; scaleMargins?: { top?: number; bottom?: number } };
    leftPriceScale?: { borderColor?: string; scaleMargins?: { top?: number; bottom?: number } };
    timeScale?: { borderColor?: string; timeVisible?: boolean; secondsVisible?: boolean; visible?: boolean;
        // Ordinal (gap-collapsing) x-axis: position bars by BAR INDEX instead of
        // real time, so data gaps (frozen feed / non-trading hours) render with
        // no blank space and consecutive bars are always equal-spaced. Axis
        // labels still show the real time of each tick bar. Off = time-proportional.
        ordinal?: boolean };
    crosshair?: {
        vertLine?: { color?: string; visible?: boolean };
        horzLine?: { color?: string; visible?: boolean };
        mode?: CrosshairModeValue;          // Normal (default) | Magnet (snap horz line to OHLC)
    };
    handleScroll?: boolean | { mouseWheel?: boolean; pressedMouseMove?: boolean };
    handleScale?: boolean | { axisPressedMouseMove?: boolean; mouseWheel?: boolean };
}

type AnyPoint = CandlestickData & LineData & HistogramData & AreaData;

const DEF_LAYOUT_BG = '#1f1f23';
const DEF_TEXT = '#d7d7d7';
const DEF_GRID = '#2f2f35';
const DEF_BORDER = '#3a3a40';
const DEF_FONT = 'Segoe UI, Tahoma, sans-serif';

function num(v: unknown, fallback: number): number {
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
// Contrasting text colour for a coloured axis tag.
function textOn(bg: string): string {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(bg.trim());
    if (m === null) return '#fff';
    const n = parseInt(m[1], 16);
    const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
    return lum > 150 ? '#111' : '#fff';
}

// ---- Renko / Point&Figure transforms ------------------------------------
// Renko and P&F re-bin price into bricks / columns whose count differs from the
// source candles. To keep them on the SAME axis as everything else — so overlay
// indicators recomputed on the bricks/columns line up, the crosshair works, and
// panning/zoom behave like every other series — each derived bar is given a
// synthetic time spread evenly across the source time span. The renderers draw
// these via timeToX(); the same functions are exported so a host can feed the
// derived bars to its indicator engine and have the studies align natively.
function evenSpan(src: ReadonlyArray<AnyPoint>, n: number): number[] {
    if (n <= 0) return [];
    const t0 = src[0].time, t1 = src[src.length - 1].time;
    const out = new Array<number>(n);
    if (n === 1 || !(t1 > t0)) { for (let i = 0; i < n; i += 1) out[i] = t0 + i; return out; }
    for (let i = 0; i < n; i += 1) out[i] = t0 + (i / (n - 1)) * (t1 - t0);
    return out;
}
function renkoBox(src: ReadonlyArray<AnyPoint>, boxSize?: number): number {
    if (num(boxSize, 0) > 0) return boxSize as number;
    let lo = Infinity, hi = -Infinity;
    for (const p of src) { const c = p.close; if (c < lo) lo = c; if (c > hi) hi = c; }
    return ((Number.isFinite(hi - lo) && hi > lo) ? (hi - lo) : 1) / 40;
}
function renkoBricks(src: ReadonlyArray<AnyPoint>, box: number): Array<{ up: boolean; lo: number; hi: number }> {
    const bricks: Array<{ up: boolean; lo: number; hi: number }> = [];
    if (src.length === 0 || !(box > 0)) return bricks;
    let base = src[0].close;
    for (const p of src) {
        while (p.close >= base + box) { bricks.push({ up: true, lo: base, hi: base + box }); base += box; }
        while (p.close <= base - box) { bricks.push({ up: false, lo: base - box, hi: base }); base -= box; }
    }
    return bricks;
}
// Derived OHLC bars (one per brick) for feeding an indicator engine.
export function renkoBars(candles: ReadonlyArray<AnyPoint>, boxSize?: number): AnyPoint[] {
    if (candles.length < 2) return [];
    const bricks = renkoBricks(candles, renkoBox(candles, boxSize));
    const times = evenSpan(candles, bricks.length);
    return bricks.map((bk, i) => (bk.up
        ? { time: times[i], open: bk.lo, high: bk.hi, low: bk.lo, close: bk.hi }
        : { time: times[i], open: bk.hi, high: bk.hi, low: bk.lo, close: bk.lo }) as AnyPoint);
}
function pnfBox(src: ReadonlyArray<AnyPoint>, boxSize?: number): number {
    if (num(boxSize, 0) > 0) return boxSize as number;
    let lo = Infinity, hi = -Infinity;
    for (const p of src) { if (p.low < lo) lo = p.low; if (p.high > hi) hi = p.high; }
    return ((Number.isFinite(hi - lo) && hi > lo) ? (hi - lo) : 1) / 50;
}
function pnfColumns(src: ReadonlyArray<AnyPoint>, box: number, rev: number): Array<{ up: boolean; lo: number; hi: number }> {
    const cols: Array<{ up: boolean; lo: number; hi: number }> = [];
    if (src.length === 0 || !(box > 0)) return cols;
    let ref = Infinity;
    for (const p of src) if (p.close < ref) ref = p.close;
    let dir = 0, top = src[0].close, bot = src[0].close;
    for (const p of src) {
        const c = p.close;
        if (dir >= 0 && c >= top + box) { dir = 1; top = Math.floor((c - ref) / box) * box + ref; if (cols.length === 0 || !cols[cols.length - 1].up) cols.push({ up: true, lo: bot, hi: top }); else cols[cols.length - 1].hi = top; }
        else if (dir <= 0 && c <= bot - box) { dir = -1; bot = Math.ceil((c - ref) / box) * box + ref; if (cols.length === 0 || cols[cols.length - 1].up) cols.push({ up: false, lo: bot, hi: top }); else cols[cols.length - 1].lo = bot; }
        else if (dir === 1 && c <= top - rev * box) { dir = -1; bot = c; cols.push({ up: false, lo: bot, hi: top - box }); }
        else if (dir === -1 && c >= bot + rev * box) { dir = 1; top = c; cols.push({ up: true, lo: bot + box, hi: top }); }
    }
    return cols;
}
// Derived OHLC bars (one per column) for feeding an indicator engine.
export function pnfBars(candles: ReadonlyArray<AnyPoint>, boxSize?: number, reversal?: number): AnyPoint[] {
    if (candles.length < 2) return [];
    const cols = pnfColumns(candles, pnfBox(candles, boxSize), num(reversal, 2));
    const times = evenSpan(candles, cols.length);
    return cols.map((col, i) => (col.up
        ? { time: times[i], open: col.lo, high: col.hi, low: col.lo, close: col.hi }
        : { time: times[i], open: col.hi, high: col.hi, low: col.lo, close: col.lo }) as AnyPoint);
}

class Series {
    readonly kind: SeriesKind;
    opts: SeriesOptions;
    data: AnyPoint[] = [];
    markers: SeriesMarker[] = [];
    constructor(kind: SeriesKind, opts: SeriesOptions) {
        this.kind = kind;
        this.opts = opts;
    }
    setData(points: ReadonlyArray<unknown>): void {
        this.data = (points as AnyPoint[]).slice().sort((a, b) => a.time - b.time);
        this.chart?.onDataChanged();
    }
    // Streaming-style single-point push:
    // same time as last -> replace; newer time -> append; older -> ignore.
    update(point: unknown): void {
        const p = point as AnyPoint;
        const n = this.data.length;
        if (n === 0) { this.data.push(p); this.chart?.onDataChanged(); return; }
        const last = this.data[n - 1];
        if (Number.isFinite(p.time) && Number.isFinite(last.time)) {
            if (p.time === last.time) this.data[n - 1] = p;
            else if (p.time > last.time) this.data.push(p);
            else return;
        } else {
            this.data[n - 1] = p;
        }
        this.chart?.onDataChanged();
    }
    applyOptions(patch: SeriesOptions): void {
        this.opts = { ...this.opts, ...patch };
        this.chart?.scheduleDraw();
    }
    priceScaleId(): string { return this.opts.priceScaleId ?? 'right'; }
    // Per-series price-scale handle. Lets the host adjust scaleMargins
    // (used for volume overlays — bottom band of the plot).
    priceScale(): PriceScaleApi { return new PriceScaleApi(this.chart, this.priceScaleId()); }
    // back-ref wired by the chart
    chart: ChartImpl | null = null;

    // ---- horizontal price lines (orders / alerts / preview) ----
    priceLines: PriceLine[] = [];
    createPriceLine(options: PriceLineOptions): IPriceLine {
        const pl = new PriceLine(options, this);
        this.priceLines.push(pl);
        this.chart?.scheduleDraw();
        return pl;
    }
    removePriceLine(line: IPriceLine): void {
        const i = this.priceLines.indexOf(line as PriceLine);
        if (i >= 0) { this.priceLines.splice(i, 1); this.chart?.scheduleDraw(); }
    }
    // Coordinate <-> price for the price scale this series renders on.
    // Public so external order-overlay code can hit-test / drag.
    priceToCoordinate(price: number): number | null {
        if (this.chart === null || !Number.isFinite(price)) return null;
        return this.chart.priceToY(price, this.priceScaleId());
    }
    coordinateToPrice(y: number): number | null {
        if (this.chart === null || !Number.isFinite(y)) return null;
        return this.chart.yToPrice(y, this.priceScaleId());
    }
}

// Concrete handle returned by Series.createPriceLine — mutable via
// applyOptions, repaints on each change. Drawn by the chart, not by
// itself, so the only state worth keeping is the options blob + a
// back-ref to the owning series. displayY caches the eased label
// position used by the collision-avoidance pass in drawPriceLines.
class PriceLine implements IPriceLine {
    private opts: PriceLineOptions;
    // last drawn label y (eased toward the collision-resolved target),
    // null until the first frame so the line snaps in place on creation
    // instead of sliding in from y=0.
    displayY: number | null = null;
    constructor(opts: PriceLineOptions, private readonly series: Series) {
        this.opts = { ...opts };
    }
    applyOptions(patch: Partial<PriceLineOptions>): void {
        this.opts = { ...this.opts, ...patch };
        this.series.chart?.scheduleDraw();
    }
    options(): PriceLineOptions { return { ...this.opts }; }
    // package-private read for the renderer
    raw(): PriceLineOptions { return this.opts; }
}

// Public price-scale handle.
export interface PriceScaleOptions {
    scaleMargins?: { top?: number; bottom?: number };
    mode?: PriceScaleModeValue;     // Normal | Logarithmic
}
class PriceScaleApi {
    constructor(private readonly chart: ChartImpl | null, private readonly scaleId: string) {}
    applyOptions(patch: PriceScaleOptions): void {
        if (this.chart === null) return;
        if (patch.scaleMargins) {
            const cur = this.chart.getScaleMargins(this.scaleId);
            this.chart.setScaleMargins(this.scaleId, {
                top:    Math.min(0.9, Math.max(0, patch.scaleMargins.top    ?? cur.top)),
                bottom: Math.min(0.9, Math.max(0, patch.scaleMargins.bottom ?? cur.bottom)),
            });
        }
        if (patch.mode !== undefined) this.chart.setScaleMode(this.scaleId, patch.mode);
    }
}

class MarkersPlugin {
    constructor(private readonly series: Series) {}
    setMarkers(markers: SeriesMarker[]): void {
        this.series.markers = markers.slice().sort((a, b) => a.time - b.time);
        this.series.chart?.scheduleDraw();
    }
}

type RangeListener = (range: { from: Time; to: Time } | null) => void;
type CrosshairListener = (param: { time?: Time; point?: { x: number; y: number } }) => void;
// lwc-shaped logical range = fractional bar indices. {from:5.5, to:170.2}
// means "bar 5 plus halfway through bar 6 … bar 170 plus 20%". Used by
// the terminal to sync multiple panes on the BAR axis (independent of
// gaps in time — weekend / non-trading hours).
export interface LogicalRange { from: number; to: number }
type LogicalRangeListener = (range: LogicalRange | null) => void;

class TimeScaleApi {
    constructor(private readonly chart: ChartImpl) {}
    fitContent(): void { this.chart.fitContent(); }
    setVisibleRange(range: { from: Time; to: Time }): void { this.chart.setVisibleRange(range, true); }
    getVisibleRange(): { from: Time; to: Time } | null { return this.chart.getVisibleRange(); }
    scrollToRealTime(): void { this.chart.scrollToRealTime(); }
    subscribeVisibleTimeRangeChange(cb: RangeListener): void { this.chart.rangeListeners.push(cb); }
    unsubscribeVisibleTimeRangeChange(cb: RangeListener): void {
        this.chart.rangeListeners = this.chart.rangeListeners.filter((x) => x !== cb);
    }
    // Logical range (bar indices) — same semantics as lwc. Maps through
    // the primary series' data so identical logical ranges across panes
    // align on the same bars even when their timeframes differ.
    getVisibleLogicalRange(): LogicalRange | null { return this.chart.getVisibleLogicalRange(); }
    setVisibleLogicalRange(range: LogicalRange): void { this.chart.setVisibleLogicalRange(range, true); }
    subscribeVisibleLogicalRangeChange(cb: LogicalRangeListener): void {
        this.chart.logicalRangeListeners.push(cb);
    }
    unsubscribeVisibleLogicalRangeChange(cb: LogicalRangeListener): void {
        this.chart.logicalRangeListeners = this.chart.logicalRangeListeners.filter((x) => x !== cb);
    }
    // Conversions for drawing tools (lwc parity).
    timeToCoordinate(t: Time): number | null { return this.chart.timeToXPublic(t); }
    coordinateToTime(x: number): Time | null { return this.chart.xToTimePublic(x); }
    logicalToCoordinate(idx: number): number | null {
        const t = this.chart.logicalToTime(idx);
        if (t === null) return null;
        return this.chart.timeToXPublic(t);
    }
    coordinateToLogical(x: number): number | null {
        const t = this.chart.xToTimePublic(x);
        if (t === null) return null;
        return this.chart.timeToLogical(t);
    }
}

class ChartImpl {
    private readonly host: HTMLElement;
    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    private readonly opts: ChartOptions;
    private readonly series: Series[] = [];
    private readonly tsApi = new TimeScaleApi(this);

    rangeListeners: RangeListener[] = [];
    logicalRangeListeners: LogicalRangeListener[] = [];
    private crosshairListeners: CrosshairListener[] = [];

    private width = 0;
    private height = 0;
    private dpr = 1;

    // visible window expressed in time
    private viewFrom = 0;
    private viewTo = 1;
    private dataMin = 0;
    private dataMax = 1;
    private drawScheduled = false;
    // scaleMargins per scaleId — set via Series.priceScale().applyOptions()
    // OR chart.applyOptions({ rightPriceScale: { scaleMargins } }).
    private scaleMarginsByScale = new Map<string, { top: number; bottom: number }>();
    // Per-scale display mode (Normal / Logarithmic).
    private scaleModeByScale = new Map<string, PriceScaleModeValue>();
    // optional ResizeObserver when autoSize is on (default true)
    private autoResizer: ResizeObserver | null = null;

    // pointer state
    private mouseX: number | null = null;
    private mouseY: number | null = null;
    private dragging = false;
    private lastDragX = 0;
    // manual vertical price-scale stretch (drag the price axis)
    private priceZoom = 1;
    private priceDragging = false;
    private lastDragY = 0;
    // manual horizontal time-scale stretch (drag the time axis)
    private timeDragging = false;
    private lastAxisX = 0;

    private readonly padL = 8;
    private padR = 64;        // right price axis
    private padLeft = 0;      // left price axis (only when a left-scale series exists)
    private readonly padT = 8;
    private padB = 22;        // time axis

    // Wake-up on tab visibility: requestAnimationFrame is paused while the
    // tab is hidden, which can leave drawScheduled latched true forever if
    // a draw was queued in that window. On 'visible' we clear the latch
    // and reschedule so the panel repaints the moment the user looks at it.
    private readonly onVisChange = (): void => {
        if (document.visibilityState === 'visible') {
            this.drawScheduled = false;
            this.scheduleDraw();
        }
    };

    constructor(host: HTMLElement, opts: ChartOptions) {
        this.host = host;
        this.opts = opts;
        this.canvas = document.createElement('canvas');
        this.canvas.style.display = 'block';
        this.canvas.style.cursor = 'default';
        // Stop the browser from claiming touch gestures (page scroll /
        // pinch-zoom) so a finger on the chart drives our own pan/zoom.
        this.canvas.style.touchAction = 'none';
        // Prevent OS text-selection / iOS magnifier-callout on long-press —
        // a long-press on the chart should fire our context menu, not pop
        // up "Copy / Lookup" handles over the labels.
        this.canvas.style.userSelect = 'none';
        (this.canvas.style as unknown as { webkitUserSelect: string }).webkitUserSelect = 'none';
        (this.canvas.style as unknown as { webkitTouchCallout: string }).webkitTouchCallout = 'none';
        host.appendChild(this.canvas);
        const ctx = this.canvas.getContext('2d');
        if (ctx === null) throw new Error('sschart: 2d context unavailable');
        this.ctx = ctx;

        const w = num(opts.width, host.clientWidth || 600);
        const h = num(opts.height, host.clientHeight || 300);
        this.applySize(w, h);
        this.bindPointer();
        document.addEventListener('visibilitychange', this.onVisChange);
        // autoSize defaults ON when the caller doesn't pass explicit
        // width/height — track the host with ResizeObserver and re-fit.
        const autoOn = opts.autoSize === true
            || (opts.autoSize !== false && opts.width === undefined && opts.height === undefined);
        if (autoOn && typeof ResizeObserver !== 'undefined') {
            this.autoResizer = new ResizeObserver((entries) => {
                const e = entries[0];
                if (e === undefined) return;
                const nw = Math.round(e.contentRect.width);
                const nh = Math.round(e.contentRect.height);
                if (nw > 2 && nh > 2 && (nw !== this.width || nh !== this.height))
                    this.resize(nw, nh);
            });
            this.autoResizer.observe(host);
        }
        // Seed scale margins from constructor options.
        if (opts.rightPriceScale?.scaleMargins) {
            const sm = opts.rightPriceScale.scaleMargins;
            this.scaleMarginsByScale.set('right', {
                top:    Math.min(0.9, Math.max(0, sm.top    ?? 0)),
                bottom: Math.min(0.9, Math.max(0, sm.bottom ?? 0)),
            });
        }
        if (opts.leftPriceScale?.scaleMargins) {
            const sm = opts.leftPriceScale.scaleMargins;
            this.scaleMarginsByScale.set('left', {
                top:    Math.min(0.9, Math.max(0, sm.top    ?? 0)),
                bottom: Math.min(0.9, Math.max(0, sm.bottom ?? 0)),
            });
        }
    }

    // ---- public-ish (IChartApi) -------------------------------------
    addSeries(def: SeriesDefinition, options: SeriesOptions = {}): Series {
        const s = new Series(def.type, options);
        s.chart = this;
        this.series.push(s);
        // Reserve gutters only for scales that actually carry a series, so
        // a left-scale-only pane (equity overlay) doesn't paint an empty
        // 0..1 right axis.
        this.padLeft = this.hasScale('left') ? 56 : 0;
        this.padR = this.hasScale('right') ? 64 : 8;
        this.onDataChanged();
        return s;
    }
    removeSeries(s: Series): void {
        const i = this.series.indexOf(s);
        if (i < 0) return;
        this.series.splice(i, 1);
        this.padLeft = this.hasScale('left') ? 56 : 0;
        this.padR = this.hasScale('right') ? 64 : 8;
        this.onDataChanged();
    }
    private hasScale(id: string): boolean {
        return this.series.some((s) => s.priceScaleId() === id);
    }
    timeScale(): TimeScaleApi { return this.tsApi; }
    // Per-scale margins (PriceScaleApi accessor). Defaults to {0,0}.
    getScaleMargins(scaleId: string): { top: number; bottom: number } {
        return this.scaleMarginsByScale.get(scaleId) ?? { top: 0, bottom: 0 };
    }
    setScaleMargins(scaleId: string, m: { top: number; bottom: number }): void {
        this.scaleMarginsByScale.set(scaleId, m);
        this.scheduleDraw();
    }
    getScaleMode(scaleId: string): PriceScaleModeValue {
        return this.scaleModeByScale.get(scaleId) ?? PriceScaleMode.Normal;
    }
    setScaleMode(scaleId: string, mode: PriceScaleModeValue): void {
        this.scaleModeByScale.set(scaleId, mode);
        this.scheduleDraw();
    }
    subscribeCrosshairMove(cb: CrosshairListener): void { this.crosshairListeners.push(cb); }
    unsubscribeCrosshairMove(cb: CrosshairListener): void {
        this.crosshairListeners = this.crosshairListeners.filter((x) => x !== cb);
    }
    applyOptions(patch: ChartOptions): void {
        Object.assign(this.opts, patch);
        // Sugar: chart.applyOptions({rightPriceScale:{scaleMargins:{...}}})
        // mirrors Series.priceScale().applyOptions and writes into the
        // same per-scale store the renderer consults.
        if (patch.rightPriceScale?.scaleMargins) {
            const cur = this.getScaleMargins('right');
            this.setScaleMargins('right', {
                top:    Math.min(0.9, Math.max(0, patch.rightPriceScale.scaleMargins.top    ?? cur.top)),
                bottom: Math.min(0.9, Math.max(0, patch.rightPriceScale.scaleMargins.bottom ?? cur.bottom)),
            });
        }
        if (patch.leftPriceScale?.scaleMargins) {
            const cur = this.getScaleMargins('left');
            this.setScaleMargins('left', {
                top:    Math.min(0.9, Math.max(0, patch.leftPriceScale.scaleMargins.top    ?? cur.top)),
                bottom: Math.min(0.9, Math.max(0, patch.leftPriceScale.scaleMargins.bottom ?? cur.bottom)),
            });
        }
        this.scheduleDraw();
    }
    resize(width: number, height: number): void {
        if (width < 2 || height < 2) return;
        this.applySize(width, height);
        this.scheduleDraw();
    }
    remove(): void {
        document.removeEventListener('visibilitychange', this.onVisChange);
        if (this.autoResizer !== null) { this.autoResizer.disconnect(); this.autoResizer = null; }
        this.canvas.remove();
        this.rangeListeners = [];
        this.crosshairListeners = [];
    }
    // Snapshot of the current frame as an HTMLCanvasElement (lwc parity).
    // Caller typically converts via .toDataURL('image/png') for export.
    takeScreenshot(): HTMLCanvasElement {
        const out = document.createElement('canvas');
        out.width = this.canvas.width;
        out.height = this.canvas.height;
        const c = out.getContext('2d');
        if (c !== null) c.drawImage(this.canvas, 0, 0);
        return out;
    }

    // ---- internal ---------------------------------------------------
    private applySize(w: number, h: number): void {
        this.width = w;
        this.height = h;
        this.dpr = window.devicePixelRatio || 1;
        this.canvas.width = Math.round(w * this.dpr);
        this.canvas.height = Math.round(h * this.dpr);
        this.canvas.style.width = `${w}px`;
        this.canvas.style.height = `${h}px`;
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        if (this.opts.timeScale?.visible === false) this.padB = 4;
    }

    onDataChanged(): void {
        let lo = Infinity;
        let hi = -Infinity;
        for (const s of this.series) {
            if (s.data.length === 0 || s.kind === 'VolumeProfile') continue;   // VP has no time axis
            const t0 = s.data[0].time;
            const t1 = s.data[s.data.length - 1].time;
            if (!Number.isFinite(t0) || !Number.isFinite(t1)) continue;
            lo = Math.min(lo, t0);
            hi = Math.max(hi, t1);
        }
        if (Number.isFinite(lo) && Number.isFinite(hi) && hi > lo) {
            this.dataMin = lo;
            this.dataMax = hi;
            // Only snap when the view is degenerate (empty / inverted) or
            // has no overlap with data at all. A user-panned view that
            // overshoots either edge stays put — otherwise live ticks
            // would yank a centered last bar back to the right edge.
            const noOverlap = this.viewTo < lo || this.viewFrom > hi;
            if (this.viewTo <= this.viewFrom || noOverlap) {
                this.viewFrom = lo;
                this.viewTo = hi;
            }
        }
        this.scheduleDraw();
    }

    fitContent(): void {
        this.viewFrom = this.dataMin;
        this.viewTo = this.dataMax;
        this.priceZoom = 1;          // reset the manual vertical stretch too
        this.emitRange();
        this.scheduleDraw();
    }
    // Pin the right edge to the newest data, keeping the current view width
    // (plus a small right gap). onDataChanged deliberately leaves a panned
    // view alone, so a realtime feed opts into following the tape by calling
    // this after each append.
    scrollToRealTime(): void {
        const width = this.viewTo - this.viewFrom;
        if (!(width > 0) || !Number.isFinite(this.dataMax)) return;
        this.viewTo = this.dataMax + width * 0.04;
        this.viewFrom = this.viewTo - width;
        this.emitRange();
        this.scheduleDraw();
    }
    // Chart-level price-scale handle by id (mirrors Series.priceScale() but lets
    // callers address a scale — e.g. 'right' — without holding a series). Used by
    // indicator renderers to set an oscillator pane's scaleMargins.
    priceScale(scaleId: string = 'right'): PriceScaleApi { return new PriceScaleApi(this, scaleId); }
    getVisibleRange(): { from: Time; to: Time } | null {
        if (this.viewTo <= this.viewFrom) return null;
        return { from: this.viewFrom, to: this.viewTo };
    }
    setVisibleRange(range: { from: Time; to: Time }, emit: boolean): void {
        if (range === null || !(range.to > range.from)) return;
        this.clampView(range.from, range.to);
        if (emit) this.emitRange();
        this.scheduleDraw();
    }
    // Keep the visible window sane: bounded span AND always overlapping
    // the data, so wheel/pan can never leave the chart empty.
    private clampView(nf: number, nt: number): void {
        const ds = (this.dataMax - this.dataMin) || 1;
        const minSpan = ds * 0.004;
        const maxSpan = ds * 3;
        let s = nt - nf;
        if (!(s > 0)) { s = ds; nf = this.dataMin; nt = this.dataMax; }
        if (s < minSpan || s > maxSpan) {
            s = Math.min(Math.max(s, minSpan), maxSpan);
            const c = (nf + nt) / 2;
            nf = c - s / 2;
            nt = c + s / 2;
        }
        const minLo = this.dataMin - ds * 0.5;
        const maxHi = this.dataMax + ds * 0.5;
        if (nf < minLo) { nt += minLo - nf; nf = minLo; }
        if (nt > maxHi) { nf -= nt - maxHi; nt = maxHi; }
        if (nf < minLo) nf = minLo;
        if (nt > maxHi) nt = maxHi;
        this.viewFrom = nf;
        this.viewTo = nt;
    }
    private emitRange(): void {
        const r = this.getVisibleRange();
        for (const cb of this.rangeListeners) cb(r);
        // Logical range fires on the SAME tick so panes synced on either
        // axis stay in lockstep with each other.
        const lr = this.getVisibleLogicalRange();
        for (const cb of this.logicalRangeListeners) cb(lr);
    }

    // ---- time ↔ logical (bar index) bridge ------------------------
    // Reference series for the index space: the longest non-overlay
    // price/line series. The terminal feeds the SAME bars to every
    // pane, so any candle/line series works.
    private indexRefSeries(): Series | null {
        let best: Series | null = null;
        for (const s of this.series) {
            if (s.kind === 'VolumeProfile') continue;
            if (s.data.length === 0) continue;
            if (best === null || s.data.length > best.data.length) best = s;
        }
        return best;
    }
    // Map a unix time to a fractional bar index relative to the
    // reference series. Linear interpolation between adjacent bars;
    // extrapolation past the edges uses the nearest-bar spacing.
    timeToLogical(t: Time): number | null {
        const s = this.indexRefSeries();
        if (s === null) return null;
        const d = s.data;
        if (d.length === 0) return null;
        if (d.length === 1) return 0;
        if (t <= d[0].time) {
            const step = d[1].time - d[0].time || 1;
            return -((d[0].time - t) / step);
        }
        if (t >= d[d.length - 1].time) {
            const step = d[d.length - 1].time - d[d.length - 2].time || 1;
            return d.length - 1 + ((t - d[d.length - 1].time) / step);
        }
        // binary search for the bar straddling t
        let lo = 0, hi = d.length - 1;
        while (hi - lo > 1) {
            const m = (lo + hi) >> 1;
            if (d[m].time <= t) lo = m; else hi = m;
        }
        const gap = d[hi].time - d[lo].time || 1;
        return lo + (t - d[lo].time) / gap;
    }
    // Inverse: fractional bar index → unix time.
    logicalToTime(idx: number): Time | null {
        const s = this.indexRefSeries();
        if (s === null) return null;
        const d = s.data;
        if (d.length === 0) return null;
        if (d.length === 1) return d[0].time;
        if (idx <= 0) {
            const step = d[1].time - d[0].time || 1;
            return d[0].time + idx * step;
        }
        if (idx >= d.length - 1) {
            const step = d[d.length - 1].time - d[d.length - 2].time || 1;
            return d[d.length - 1].time + (idx - (d.length - 1)) * step;
        }
        const lo = Math.floor(idx);
        const frac = idx - lo;
        return d[lo].time + frac * (d[lo + 1].time - d[lo].time);
    }
    getVisibleLogicalRange(): LogicalRange | null {
        if (this.viewTo <= this.viewFrom) return null;
        const from = this.timeToLogical(this.viewFrom);
        const to = this.timeToLogical(this.viewTo);
        if (from === null || to === null) return null;
        return { from, to };
    }
    setVisibleLogicalRange(range: LogicalRange, emit: boolean): void {
        if (range === null || !(range.to > range.from)) return;
        const fromT = this.logicalToTime(range.from);
        const toT = this.logicalToTime(range.to);
        if (fromT === null || toT === null) return;
        this.clampView(fromT, toT);
        if (emit) this.emitRange();
        this.scheduleDraw();
    }
    // Public time/coordinate (timeScale convenience for drawing tools).
    timeToXPublic(t: Time): number | null {
        if (!Number.isFinite(t)) return null;
        const x = this.timeToX(t);
        return Number.isFinite(x) ? x : null;
    }
    xToTimePublic(x: number): Time | null {
        if (!Number.isFinite(x)) return null;
        const t = this.xToTime(x);
        return Number.isFinite(t) ? t : null;
    }

    scheduleDraw(): void {
        if (this.drawScheduled) return;
        this.drawScheduled = true;
        requestAnimationFrame(() => { this.drawScheduled = false; this.draw(); });
    }

    // ---- geometry ---------------------------------------------------
    private plotL(): number { return this.padL + this.padLeft; }
    private plotR(): number { return this.width - this.padR; }
    private plotW(): number { return Math.max(1, this.plotR() - this.plotL()); }
    private plotT(): number { return this.padT; }
    private plotB(): number { return this.height - this.padB; }
    private plotH(): number { return Math.max(1, this.plotB() - this.plotT()); }

    // Ordinal (bar-index) x-axis: consecutive bars are equal-spaced and time
    // gaps collapse. Falls back to time-proportional when there is no series.
    private ordinalMode(): boolean { return this.opts.timeScale?.ordinal === true; }
    private timeToX(t: Time): number {
        if (this.ordinalMode()) {
            const lf = this.timeToLogical(this.viewFrom);
            const lt = this.timeToLogical(this.viewTo);
            const lg = this.timeToLogical(t);
            if (lf !== null && lt !== null && lg !== null) {
                const span = (lt - lf) || 1;
                return this.plotL() + ((lg - lf) / span) * this.plotW();
            }
        }
        const span = this.viewTo - this.viewFrom || 1;
        return this.plotL() + ((t - this.viewFrom) / span) * this.plotW();
    }
    private xToTime(x: number): Time {
        if (this.ordinalMode()) {
            const lf = this.timeToLogical(this.viewFrom);
            const lt = this.timeToLogical(this.viewTo);
            if (lf !== null && lt !== null) {
                const lg = lf + ((x - this.plotL()) / this.plotW()) * ((lt - lf) || 1);
                const t = this.logicalToTime(lg);
                if (t !== null) return t;
            }
        }
        const span = this.viewTo - this.viewFrom || 1;
        return this.viewFrom + ((x - this.plotL()) / this.plotW()) * span;
    }

    // price scale per axis ('right' default, 'left' optional)
    private priceBounds(scaleId: string): { min: number; max: number; mode: PriceScaleModeValue } {
        const scan = (windowed: boolean): { min: number; max: number } => {
            let mn = Infinity;
            let mx = -Infinity;
            for (const s of this.series) {
                if (s.priceScaleId() !== scaleId) continue;
                if (s.kind === 'VolumeProfile') continue;   // overlay — doesn't drive the scale
                // Renko / P&F drive the scale from their derived bricks / columns
                // (on synthetic times) — the same bars the renderer draws — so the
                // visible price range matches what's on screen when zoomed / panned.
                const pts = s.kind === 'Renko' ? renkoBars(s.data, s.opts.boxSize)
                    : s.kind === 'PointFigure' ? pnfBars(s.data, s.opts.boxSize, s.opts.reversal)
                    : s.data;
                for (const p of pts) {
                    if (windowed && (p.time < this.viewFrom || p.time > this.viewTo)) continue;
                    if (s.kind === 'Candlestick' || s.kind === 'Bar'
                        || s.kind === 'PointFigure' || s.kind === 'Renko'
                        || s.kind === 'Cluster' || s.kind === 'Box') {
                        // Skip whitespace / warm-up points — a non-finite value
                        // would poison Math.min/max with NaN for the whole scan
                        // (e.g. the invisible spine series a sub-pane carries).
                        if (!Number.isFinite(p.low) || !Number.isFinite(p.high)) continue;
                        mn = Math.min(mn, p.low);
                        mx = Math.max(mx, p.high);
                    } else if (s.kind === 'Histogram') {
                        if (!Number.isFinite(p.value)) continue;
                        const base = num(s.opts.base, 0);
                        mn = Math.min(mn, p.value, base);
                        mx = Math.max(mx, p.value, base);
                    } else {
                        if (!Number.isFinite(p.value)) continue;
                        mn = Math.min(mn, p.value);
                        mx = Math.max(mx, p.value);
                    }
                }
            }
            return { min: mn, max: mx };
        };
        let { min, max } = scan(true);
        // Fallback: no points fell inside the visible time window — e.g. an
        // ordinal-axis sub-pane whose view is tracked in bar-index space, where
        // a raw-time filter matches nothing. Scale to all data on this axis so
        // the series stays visible instead of collapsing to a default [0,1].
        if (!Number.isFinite(min) || !Number.isFinite(max)) ({ min, max } = scan(false));
        if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 };
        if (min === max) { min -= 1; max += 1; }
        const pad = (max - min) * 0.08;
        let lo = min - pad;
        let hi = max + pad;
        // Manual vertical stretch: shrink/grow the range around its
        // centre (priceZoom>1 → smaller range → data drawn taller).
        if (this.priceZoom !== 1) {
            const c = (lo + hi) / 2;
            const half = (hi - lo) / 2 / this.priceZoom;
            lo = c - half;
            hi = c + half;
        }
        // Apply scaleMargins: expand the virtual range so the data occupies
        // only (1 - top - bottom) of the plot. Used for volume overlays
        // (top:0.85 → bars hug the bottom 15%) and similar.
        const m = this.scaleMarginsByScale.get(scaleId);
        if (m && (m.top > 0 || m.bottom > 0)) {
            const denom = 1 - m.top - m.bottom;
            if (denom > 0.05) {
                const span = hi - lo;
                hi = hi + span * m.top    / denom;
                lo = lo - span * m.bottom / denom;
            }
        }
        const mode = this.getScaleMode(scaleId);
        // Logarithmic: clamp lower bound to a tiny positive so log() is
        // well-defined. Values <= 0 in data will be silently clamped at
        // draw time (rare in practice for price series anyway).
        if (mode === PriceScaleMode.Logarithmic && lo <= 0) {
            lo = Math.max(1e-9, hi * 1e-6);
        }
        return { min: lo, max: hi, mode };
    }
    private valueToY(v: number, b: { min: number; max: number; mode?: PriceScaleModeValue }): number {
        if (b.mode === PriceScaleMode.Logarithmic && v > 0 && b.min > 0 && b.max > 0) {
            const lspan = Math.log(b.max) - Math.log(b.min) || 1;
            return this.plotB() - (Math.log(v) - Math.log(b.min)) / lspan * this.plotH();
        }
        const span = b.max - b.min || 1;
        return this.plotB() - ((v - b.min) / span) * this.plotH();
    }
    private yToValue(y: number, b: { min: number; max: number; mode?: PriceScaleModeValue }): number {
        if (b.mode === PriceScaleMode.Logarithmic && b.min > 0 && b.max > 0) {
            const lspan = Math.log(b.max) - Math.log(b.min) || 1;
            return Math.exp(Math.log(b.min) + ((this.plotB() - y) / this.plotH()) * lspan);
        }
        const span = b.max - b.min || 1;
        return b.min + ((this.plotB() - y) / this.plotH()) * span;
    }
    // Format a price for display using the (optional) per-series
    // priceFormat. Snaps to minMove first (so 0.1234 with minMove=0.05
    // renders as 0.10) then pads with the requested precision.
    private fmtPrice(value: number, fmt: PriceFormat | undefined): string {
        const minMove = fmt?.minMove;
        const precision = fmt?.precision ?? (
            // sensible default: derive from minMove magnitude if given.
            minMove !== undefined && minMove > 0
                ? Math.max(0, -Math.floor(Math.log10(minMove) + 1e-9))
                : 2);
        let v = value;
        if (minMove !== undefined && minMove > 0)
            v = Math.round(v / minMove) * minMove;
        return v.toFixed(Math.min(12, precision));
    }
    // Find the primary right-scale series — used by axis ticks /
    // cursor pill (price-without-series). Falls back to "no format".
    private primaryFormat(scaleId: string = 'right'): PriceFormat | undefined {
        for (const s of this.series) {
            if (s.priceScaleId() !== scaleId) continue;
            if (s.kind === 'VolumeProfile') continue;
            if (s.opts.priceFormat !== undefined) return s.opts.priceFormat;
        }
        return undefined;
    }
    // Public price ↔ pixel for the named price scale ('right' default,
    // 'left' for the equity overlay). Used by external order overlays.
    priceToY(price: number, scaleId: string = 'right'): number | null {
        const b = this.priceBounds(scaleId);
        if (!Number.isFinite(b.min) || !Number.isFinite(b.max)) return null;
        return this.valueToY(price, b);
    }
    yToPrice(y: number, scaleId: string = 'right'): number | null {
        const b = this.priceBounds(scaleId);
        if (!Number.isFinite(b.min) || !Number.isFinite(b.max)) return null;
        const span = b.max - b.min || 1;
        return b.min + ((this.plotB() - y) / this.plotH()) * span;
    }

    // ---- drawing ----------------------------------------------------
    private draw(): void {
        const ctx = this.ctx;
        const lay = this.opts.layout ?? {};
        ctx.clearRect(0, 0, this.width, this.height);
        ctx.fillStyle = lay.background?.color ?? DEF_LAYOUT_BG;
        ctx.fillRect(0, 0, this.width, this.height);

        const hasRight = this.hasScale('right');
        const hasLeft = this.hasScale('left');
        // Auto-fit right gutter to the widest PRICE label (the price
        // pill lives in the gutter; the title pill lives on the plot).
        if (hasRight) {
            ctx.font = `11px ${lay.fontFamily ?? DEF_FONT}`;
            let maxPriceW = 0;
            for (const s of this.series) {
                if (s.priceScaleId() !== 'right') continue;
                for (const pl of s.priceLines) {
                    const o = pl.raw();
                    if ((o.axisLabelVisible ?? true) && Number.isFinite(o.price)) {
                        const t = this.fmtPrice(o.price, s.opts.priceFormat);
                        maxPriceW = Math.max(maxPriceW, ctx.measureText(t).width + 14);
                    }
                }
            }
            const desired = Math.max(64, Math.ceil(maxPriceW) + 4);
            if (desired !== this.padR) this.padR = desired;
        }
        const rb = this.priceBounds('right');
        const lb = hasLeft ? this.priceBounds('left') : rb;
        const primary = hasRight ? rb : lb;

        // Watermark on the background — under series, over the bg fill.
        this.drawWatermark();
        this.drawGrid(primary);
        for (const s of this.series) {
            // Draw each series against bounds of ITS OWN scale, not just
            // left vs right. Overlay scales (priceScaleId='' on the host's
            // volume series, etc.) have their own scaleMargins blob — e.g.
            // volume sits at top:0.85 to hug the bottom 15%. Folding them
            // into 'right' bounds maps their values (30 000 vol) onto the
            // candle range (0.44–0.46), so valueToY produces an extreme
            // off-canvas Y and fillRect clips to a full-height vertical
            // band — visible as solid red/green stripes covering the chart.
            const sid = s.priceScaleId();
            const sb = sid === 'right'
                ? rb
                : (sid === 'left' && hasLeft ? lb : this.priceBounds(sid));
            this.drawSeries(s, sb);
        }
        this.drawMarkers(rb, lb);
        this.drawAxes(hasRight ? rb : null, hasLeft ? lb : null);
        this.drawPriceTags(rb, lb);
        // Order / alert / preview lines + their colored axis labels
        // draw LAST among the value chrome so they sit on top of the
        // axis tick text (no bleed-through) and on top of the per-series
        // last-value pills — actively-edited orders should dominate.
        // Still under the crosshair so the user can see what they are
        // hovering even over an order line.
        this.drawPriceLines(rb, lb);
        this.drawCrosshair(rb, lb);
        this.drawClusterTip(rb, lb);
    }

    // Horizontal lines (orders / alerts / preview-on-Ctrl). The LINE
    // stays at the true price; the LABEL slides along the axis with
    // collision avoidance + eased animation, so dragging one label
    // through another pushes it out of the way (industry-standard behaviour).
    private drawPriceLines(rb: { min: number; max: number }, lb: { min: number; max: number }): void {
        const ctx = this.ctx;
        const lay = this.opts.layout ?? {};
        const font = `11px ${lay.fontFamily ?? DEF_FONT}`;
        const labelH = 18;
        const labelGap = 1;                  // extra spacing between adjacent labels
        const slot = labelH + labelGap;

        // Pass 1 — collect drawables with their natural y per scale.
        interface Item {
            pl: PriceLine; s: Series; o: PriceLineOptions;
            yLine: number; yLabelNatural: number; b: { min: number; max: number };
        }
        const items: Item[] = [];
        for (const s of this.series) {
            if (s.priceLines.length === 0) continue;
            const b = s.priceScaleId() === 'left' ? lb : rb;
            for (const pl of s.priceLines) {
                const o = pl.raw();
                if (o.lineVisible === false) continue;
                if (!Number.isFinite(o.price)) continue;
                const yNat = this.valueToY(o.price, b);
                items.push({ pl, s, o, yLine: yNat, yLabelNatural: yNat, b });
            }
        }
        if (items.length === 0) return;

        // Pass 2 — pairwise collision avoidance. Sort by natural y, then
        // iteratively resolve any overlap (4 passes is enough for typical
        // 5-10 lines). When one neighbour is anchored, only the OTHER
        // shifts — the anchored label stays glued to the cursor.
        const order = items.map((_, i) => i)
            .sort((a, b) => items[a].yLabelNatural - items[b].yLabelNatural);
        const targets = items.map(it => it.yLabelNatural);
        const anchored = items.map(it => it.o.anchored === true);
        for (let pass = 0; pass < 4; pass++) {
            let touched = false;
            for (let k = 0; k < order.length - 1; k++) {
                const i = order[k], j = order[k + 1];
                const gap = targets[j] - targets[i];
                if (gap < slot) {
                    const def = slot - gap;
                    const ai = anchored[i], aj = anchored[j];
                    if (ai && !aj)      targets[j] += def;
                    else if (!ai && aj) targets[i] -= def;
                    else { targets[i] -= def / 2; targets[j] += def / 2; }
                    touched = true;
                }
            }
            if (!touched) break;
        }
        const minY = this.plotT() + labelH / 2;
        const maxY = this.plotB() - labelH / 2;
        for (let i = 0; i < targets.length; i++) {
            if (targets[i] < minY) targets[i] = minY;
            if (targets[i] > maxY) targets[i] = maxY;
        }

        // Pass 3 — anchored labels SNAP to target (no lag on fast drag);
        // everything else eases. First frame snaps for any line so a
        // newly created order doesn't fly in from y=0.
        let stillMoving = false;
        for (let i = 0; i < items.length; i++) {
            const pl = items[i].pl;
            if (pl.displayY === null || anchored[i]) {
                pl.displayY = targets[i];
            } else {
                const d = targets[i] - pl.displayY;
                if (Math.abs(d) < 0.5) pl.displayY = targets[i];
                else { pl.displayY += d * 0.28; stillMoving = true; }
            }
        }

        // Pass 4 — paint. Spec: line ends at the title pill
        // (side+qty, drawn ON THE PLOT against the right edge); price
        // pill (price.toFixed(2)) sits in the axis gutter immediately
        // to the right of the title pill. They look like one wide
        // two-tone label but split between chart-side and scale-side.
        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            const o = it.o;
            const yLine = Math.round(it.yLine) + 0.5;
            const yLab = it.pl.displayY as number;
            const col = o.color ?? '#4a9eff';
            const w  = Math.max(1, o.lineWidth ?? 2);
            const labCol = o.axisLabelColor ?? col;
            const txtCol = o.axisLabelTextColor ?? textOn(labCol);
            const onLeft = it.s.priceScaleId() === 'left';
            const showLabels = (o.axisLabelVisible ?? true);
            ctx.font = font;
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
            const titleText = showLabels ? (o.title ?? '') : '';
            const priceText = showLabels && Number.isFinite(o.price) ? this.fmtPrice(o.price, it.s.opts.priceFormat) : '';
            const titleW = titleText ? ctx.measureText(titleText).width + 10 : 0;
            const priceW = priceText ? ctx.measureText(priceText).width + 10 : 0;
            // line stops at the title pill so the pill visually caps it
            const titleX = onLeft ? this.plotL() + 1
                                  : this.plotR() - titleW;
            const priceX = onLeft ? this.plotL() - priceW - 1
                                  : this.plotR() + 1;
            const lineEndX = onLeft ? (titleText ? titleX + titleW : this.plotL())
                                    : (titleText ? titleX           : this.plotR());
            const lineStartX = onLeft ? this.plotL()
                                      : this.plotL();
            if (yLine >= this.plotT() - 1 && yLine <= this.plotB() + 1) {
                ctx.strokeStyle = col;
                ctx.lineWidth = w;
                ctx.setLineDash(this.dashFor(o.lineStyle ?? LineStyle.Solid, w));
                ctx.beginPath();
                ctx.moveTo(lineStartX, yLine);
                ctx.lineTo(onLeft ? this.plotR() : lineEndX, yLine);
                ctx.stroke();
                ctx.setLineDash([]);
            }
            if (showLabels && Math.abs(yLab - yLine) > 4) {
                // leader from line's true y to the displaced label
                ctx.strokeStyle = labCol;
                ctx.lineWidth = 1;
                ctx.setLineDash([2, 2]);
                ctx.beginPath();
                ctx.moveTo(onLeft ? this.plotL() - 1 : this.plotR() + 1,
                           Math.max(this.plotT() + 0.5, Math.min(this.plotB() - 0.5, yLine)));
                ctx.lineTo(onLeft ? this.plotL() - 1 : this.plotR() + 1, yLab);
                ctx.stroke();
                ctx.setLineDash([]);
            }
            // Title pill (side + qty) on the plot
            if (titleText) {
                ctx.fillStyle = labCol;
                ctx.fillRect(titleX, yLab - labelH / 2, titleW, labelH);
                ctx.fillStyle = txtCol;
                ctx.fillText(titleText, titleX + 5, yLab + 1);
            }
            // Price pill in the axis gutter — slightly darker shade
            // for the two-tone candle look.
            if (priceText) {
                ctx.fillStyle = labCol;
                ctx.fillRect(priceX, yLab - labelH / 2, priceW, labelH);
                ctx.fillStyle = txtCol;
                ctx.fillText(priceText, priceX + 5, yLab + 1);
            }
        }

        // Animation tick — keep redrawing until everyone settled.
        if (stillMoving) this.scheduleDraw();
    }
    // Watermark (brand text / ticker) drawn over the plot background,
    // under the series. lwc-shaped option block.
    private drawWatermark(): void {
        const w = this.opts.watermark;
        if (w === undefined || w.visible === false || !w.text) return;
        const ctx = this.ctx;
        ctx.save();
        const fam = w.fontFamily ?? this.opts.layout?.fontFamily ?? DEF_FONT;
        ctx.font = `${w.fontStyle ?? ''} ${w.fontSize ?? 48}px ${fam}`.trim();
        ctx.fillStyle = w.color ?? 'rgba(180,193,213,0.22)';
        ctx.textAlign = (w.horzAlign ?? 'center') as CanvasTextAlign;
        ctx.textBaseline = w.vertAlign === 'top'    ? 'top'
                         : w.vertAlign === 'bottom' ? 'bottom' : 'middle';
        const x = w.horzAlign === 'left'  ? this.plotL() + 12
                : w.horzAlign === 'right' ? this.plotR() - 12
                : (this.plotL() + this.plotR()) / 2;
        const y = w.vertAlign === 'top'    ? this.plotT() + 12
                : w.vertAlign === 'bottom' ? this.plotB() - 12
                : (this.plotT() + this.plotB()) / 2;
        ctx.fillText(w.text, x, y);
        ctx.restore();
    }
    private dashFor(style: LineStyleValue, w: number): number[] {
        switch (style) {
            case LineStyle.Dotted:       return [w, w];
            case LineStyle.Dashed:       return [w * 3, w * 2];
            case LineStyle.LargeDashed:  return [w * 6, w * 3];
            case LineStyle.SparseDotted: return [w, w * 4];
            default:                     return [];
        }
    }
    // Hover tooltip for the footprint: shows the price level and its
    // volume under the cursor (so each cluster bar is readable).
    private drawClusterTip(rb: { min: number; max: number }, lb: { min: number; max: number }): void {
        if (this.mouseX === null || this.mouseY === null) return;
        if (this.mouseX < this.plotL() || this.mouseX > this.plotR()) return;
        const cs = this.series.find((s) => s.kind === 'Cluster');
        if (cs === undefined) return;
        const st = this.snapTime(this.mouseX);
        if (st === undefined) return;
        const p = cs.data.find((d) => d.time === st) as
            (AnyPoint & { levels?: Array<{ price: number; vol: number }> }) | undefined;
        if (p === undefined || p.levels === undefined || p.levels.length === 0) return;
        const bnd = cs.priceScaleId() === 'left' ? lb : rb;
        let best = p.levels[0];
        let bestD = Infinity;
        for (const l of p.levels) {
            const d = Math.abs(this.valueToY(l.price, bnd) - this.mouseY);
            if (d < bestD) { bestD = d; best = l; }
        }
        if (bestD > 18) return;
        const ctx = this.ctx;
        const txt = `${this.fmtPrice(best.price, cs.opts.priceFormat)}   vol ${best.vol}`;
        ctx.font = `11px ${this.opts.layout?.fontFamily ?? DEF_FONT}`;
        const w = ctx.measureText(txt).width + 14;
        const h = 19;
        let x = this.mouseX + 14;
        let y = this.valueToY(best.price, bnd) - h / 2;
        if (x + w > this.plotR()) x = this.mouseX - w - 14;
        y = Math.max(this.plotT(), Math.min(this.plotB() - h, y));
        ctx.fillStyle = '#1e222d';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#434651';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(txt, x + 7, y + h / 2);
    }

    private seriesColor(s: Series, p: AnyPoint): string {
        return s.kind === 'Candlestick'
            ? (p.close >= p.open ? (s.opts.upColor ?? '#31c15b') : (s.opts.downColor ?? '#ff6d6d'))
            : (s.opts.lineColor ?? s.opts.color ?? '#89b4ff');
    }
    // Per-series colour tag on the price axis — ALWAYS the rightmost
    // visible value of each series, live during pan/zoom (industry-
    // standard behaviour). Cursor-time values live in the top-left legend; the
    // axis tags must not chase the cursor, otherwise dragging the chart
    // looks frozen until you release.
    private drawPriceTags(rb: { min: number; max: number }, lb: { min: number; max: number }): void {
        const ctx = this.ctx;
        ctx.font = `10px ${this.opts.layout?.fontFamily ?? DEF_FONT}`;
        ctx.textBaseline = 'middle';
        for (const s of this.series) {
            if (s.data.length === 0 || s.kind === 'VolumeProfile') continue;   // VP has no single price
            if (s.opts.lastValueVisible === false) continue;
            // lwc parity: priceLineSource = 'lastBar' (default) shows
            // the absolute last data point; 'lastVisible' tracks the
            // right edge of the visible window (terminal-style).
            let p: AnyPoint;
            const src = s.opts.priceLineSource ?? 'lastVisible';
            if (src === 'lastBar') {
                p = s.data[s.data.length - 1];
            } else {
                let lastVisible: AnyPoint | undefined;
                for (let i = s.data.length - 1; i >= 0; i--) {
                    const d = s.data[i];
                    if (Number.isFinite(d.time) && d.time <= this.viewTo) { lastVisible = d; break; }
                }
                p = lastVisible ?? s.data[s.data.length - 1];
            }
            const val = (s.kind === 'Candlestick' || s.kind === 'Bar') ? p.close : p.value;
            if (!Number.isFinite(val)) continue;
            const b = s.priceScaleId() === 'left' ? lb : rb;
            const y = Math.max(this.plotT() + 7, Math.min(this.plotB() - 7, this.valueToY(val, b)));
            const col = this.seriesColor(s, p);
            const txt = this.fmtPrice(val, s.opts.priceFormat);
            const w = ctx.measureText(txt).width + 8;
            const left = s.priceScaleId() === 'left';
            const x = left ? this.plotL() - w - 1 : this.plotR() + 1;
            ctx.fillStyle = col;
            ctx.fillRect(x, y - 7, w, 14);
            ctx.fillStyle = textOn(col);
            ctx.textAlign = 'left';
            ctx.fillText(txt, x + 4, y);
        }
    }

    // Fewer price ticks on short panes so labels never collide (MACD /
    // equity in the dense combined layout).
    private priceTickCount(): number {
        return Math.max(2, Math.min(6, Math.floor(this.plotH() / 38)));
    }
    private niceTicks(min: number, max: number, count: number): number[] {
        const span = max - min || 1;
        const step0 = span / count;
        const mag = Math.pow(10, Math.floor(Math.log10(step0)));
        const norm = step0 / mag;
        const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
        const start = Math.ceil(min / step) * step;
        const out: number[] = [];
        for (let v = start; v <= max + 1e-9; v += step) out.push(v);
        return out;
    }

    private drawGrid(rb: { min: number; max: number }): void {
        const ctx = this.ctx;
        const g = this.opts.grid ?? {};
        ctx.lineWidth = 1;
        if (g.horzLines?.visible !== false) {
            ctx.strokeStyle = g.horzLines?.color ?? DEF_GRID;
            for (const v of this.niceTicks(rb.min, rb.max, this.priceTickCount())) {
                const y = Math.round(this.valueToY(v, rb)) + 0.5;
                if (y < this.plotT() || y > this.plotB()) continue;
                ctx.beginPath(); ctx.moveTo(this.plotL(), y); ctx.lineTo(this.plotR(), y); ctx.stroke();
            }
        }
        if (g.vertLines?.visible !== false) {
            ctx.strokeStyle = g.vertLines?.color ?? DEF_GRID;
            for (const t of this.timeTicks().ticks) {
                const x = Math.round(this.timeToX(t)) + 0.5;
                if (x < this.plotL() || x > this.plotR()) continue;
                ctx.beginPath(); ctx.moveTo(x, this.plotT()); ctx.lineTo(x, this.plotB()); ctx.stroke();
            }
        }
    }

    private barStepPx(): number {
        if (this.ordinalMode()) {
            // Every bar is one index apart, so the step is the plot width
            // divided by the visible bar-index span.
            const lf = this.timeToLogical(this.viewFrom);
            const lt = this.timeToLogical(this.viewTo);
            if (lf !== null && lt !== null && lt > lf)
                return this.plotW() / (lt - lf);
        }
        // median spacing of the densest series, projected to pixels
        let best = 0;
        for (const s of this.series) {
            if (s.data.length < 2 || s.kind === 'VolumeProfile') continue;
            const t0 = s.data[0].time;
            const t1 = s.data[s.data.length - 1].time;
            if (!Number.isFinite(t0) || !Number.isFinite(t1)) continue;   // VP-like: no time → don't poison
            const dt = (t1 - t0) / (s.data.length - 1);
            const px = (dt / (this.viewTo - this.viewFrom || 1)) * this.plotW();
            if (Number.isFinite(px)) best = Math.max(best, px);
        }
        return best > 0 ? best : 6;
    }

    private drawSeries(s: Series, b: { min: number; max: number }): void {
        const ctx = this.ctx;

        if (s.kind === 'VolumeProfile') {
            // Visible-range volume profile: recomputed every frame from
            // the candles inside [viewFrom,viewTo], so it updates on
            // zoom / pan. Source = OHLC+vol points; volume spread across
            // each bar's [low,high] over the current price scale.
            const src = s.data as Array<AnyPoint & { vol?: number }>;
            const vis = src.filter((p) => p.time >= this.viewFrom && p.time <= this.viewTo
                && Number.isFinite(p.high) && Number.isFinite(p.low));
            if (vis.length === 0) return;
            const rng = (b.max - b.min) || 1;
            const bins = Math.max(12, Math.min(90, Math.round(this.plotH() / 8)));
            const step = rng / bins;
            const agg = new Array(bins).fill(0);
            for (const p of vis) {
                const v = Number.isFinite(p.vol as number) ? (p.vol as number) : 1;
                const b0 = Math.max(0, Math.min(bins - 1, Math.floor((p.low - b.min) / step)));
                const b1 = Math.max(0, Math.min(bins - 1, Math.floor((p.high - b.min) / step)));
                const per = v / (b1 - b0 + 1);
                for (let bi = b0; bi <= b1; bi += 1) agg[bi] += per;
            }
            let maxV = 0;
            for (const a of agg) maxV = Math.max(maxV, a);
            if (maxV <= 0) return;
            const maxW = this.plotW() * 0.22;
            const bh = Math.max(1, this.plotH() / bins - 1);
            ctx.fillStyle = s.opts.color ?? 'rgba(74,158,255,0.16)';
            for (let bi = 0; bi < bins; bi += 1) {
                if (agg[bi] <= 0) continue;
                const w = (agg[bi] / maxV) * maxW;
                const y = this.valueToY(b.min + (bi + 0.5) * step, b);
                if (y < this.plotT() - bh || y > this.plotB() + bh) continue;
                ctx.fillRect(this.plotR() - w, y - bh / 2, w, bh);
            }
            return;
        }

        const visible = s.data.filter((p) => p.time >= this.viewFrom - 1 && p.time <= this.viewTo + 1);
        if (visible.length === 0) return;

        if (s.kind === 'Candlestick') {
            // body width scales with bar spacing (no fixed cap) → candles
            // get wider on zoom, like the histogram.
            const bw = Math.max(1, this.barStepPx() * 0.72);
            for (const p of visible) {
                const x = this.timeToX(p.time);
                const up = p.close >= p.open;
                const body = up ? (s.opts.upColor ?? '#31c15b') : (s.opts.downColor ?? '#ff6d6d');
                const wick = up ? (s.opts.wickUpColor ?? body) : (s.opts.wickDownColor ?? body);
                ctx.strokeStyle = wick;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(Math.round(x) + 0.5, this.valueToY(p.high, b));
                ctx.lineTo(Math.round(x) + 0.5, this.valueToY(p.low, b));
                ctx.stroke();
                const yO = this.valueToY(p.open, b);
                const yC = this.valueToY(p.close, b);
                // Snap fill AND border to the SAME integer rect — a
                // rounded strokeRect over an unrounded fillRect left a
                // sub-pixel gap that showed the dark background as a
                // "black strip" at the body's bottom edge.
                const bx = Math.round(x - bw / 2);
                const bwI = Math.max(1, Math.round(bw));
                const yTop = Math.round(Math.min(yO, yC));
                const bhI = Math.max(1, Math.round(Math.abs(yC - yO)));
                ctx.fillStyle = body;
                ctx.fillRect(bx, yTop, bwI, bhI);
                const bcol = up ? s.opts.borderUpColor : s.opts.borderDownColor;
                if (s.opts.borderVisible !== false && bcol && bcol !== body && bhI > 2) {
                    ctx.strokeStyle = bcol;
                    ctx.lineWidth = 1;
                    ctx.strokeRect(bx + 0.5, yTop + 0.5, bwI - 1, bhI - 1);
                }
            }
            return;
        }

        if (s.kind === 'Bar') {
            // OHLC bar: high-low stick, open tick left, close tick right.
            const tick = Math.max(2, this.barStepPx() * 0.36);
            ctx.lineWidth = Math.max(1, Math.min(3, this.barStepPx() * 0.12));
            for (const p of visible) {
                const x = Math.round(this.timeToX(p.time)) + 0.5;
                const up = p.close >= p.open;
                ctx.strokeStyle = up ? (s.opts.upColor ?? '#00c853') : (s.opts.downColor ?? '#ff3d57');
                ctx.beginPath();
                ctx.moveTo(x, this.valueToY(p.high, b));
                ctx.lineTo(x, this.valueToY(p.low, b));
                ctx.moveTo(x - tick, this.valueToY(p.open, b));
                ctx.lineTo(x, this.valueToY(p.open, b));
                ctx.moveTo(x, this.valueToY(p.close, b));
                ctx.lineTo(x + tick, this.valueToY(p.close, b));
                ctx.stroke();
            }
            return;
        }

        if (s.kind === 'Cluster') {
            // Footprint: per-candle horizontal volume-by-price bars.
            const slot = Math.max(6, this.barStepPx());
            const base = s.opts.color ?? 'rgba(74,158,255,0.55)';
            const hiC = '#fcd535';
            for (const p of visible) {
                const lv = (p as unknown as { levels?: Array<{ price: number; vol: number }> }).levels;
                if (lv === undefined || lv.length === 0) continue;
                const cx = this.timeToX(p.time);
                let mx = 0;
                for (const l of lv) mx = Math.max(mx, l.vol);
                if (mx <= 0) continue;
                const cellH = Math.max(1, Math.abs(this.valueToY(p.high, b) - this.valueToY(p.low, b)) / lv.length);
                for (const l of lv) {
                    const y = this.valueToY(l.price, b);
                    const w = (l.vol / mx) * (slot * 0.92);
                    ctx.fillStyle = l.vol === mx ? hiC : base;
                    ctx.fillRect(cx - slot * 0.46, y - cellH / 2, w, Math.max(1, cellH - 0.5));
                }
            }
            return;
        }

        if (s.kind === 'Box') {
            // Numbers grid: shared price buckets (rows) × candles
            // (columns). Resizes by X (zoom → wider columns) and by Y
            // (price scale → finer/taller rows).
            const slot = Math.max(2, this.barStepPx());
            const rng = (b.max - b.min) || 1;
            const nRows = Math.max(5, Math.min(60, Math.round(this.plotH() / 20)));
            const rowH = this.plotH() / nRows;
            const cols = visible.map((p) => {
                const lv = (p as unknown as { levels?: Array<{ price: number; vol: number }> }).levels ?? [];
                const arr = new Array(nRows).fill(0);
                for (const l of lv) {
                    const ri = Math.max(0, Math.min(nRows - 1, Math.floor((l.price - b.min) / rng * nRows)));
                    arr[ri] += l.vol;
                }
                return arr;
            });
            let gmax = 0;
            for (const c of cols) for (const v of c) gmax = Math.max(gmax, v);
            if (gmax <= 0) return;
            const text = slot >= 26 && rowH >= 11;
            // font scales with column width AND row height → grows on
            // zoom (bounded so digits never overflow the cell).
            const fpx = Math.max(7, Math.min(Math.floor(rowH - 3), Math.floor(slot * 0.4)));
            // grid frame
            ctx.strokeStyle = this.opts.grid?.horzLines?.color ?? DEF_GRID;
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let ri = 0; ri <= nRows; ri += 1) {
                const y = Math.round(this.plotB() - ri * rowH) + 0.5;
                ctx.moveTo(this.plotL(), y); ctx.lineTo(this.plotR(), y);
            }
            ctx.stroke();
            ctx.font = `${fpx}px ${this.opts.layout?.fontFamily ?? DEF_FONT}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const dim = this.opts.layout?.textColor ?? DEF_TEXT;
            visible.forEach((p, ci) => {
                const cx = this.timeToX(p.time);
                if (cx < this.plotL() - slot || cx > this.plotR() + slot) return;
                if (text) {
                    ctx.strokeStyle = this.opts.grid?.vertLines?.color ?? DEF_GRID;
                    ctx.strokeRect(Math.round(cx - slot / 2) + 0.5, this.plotT() + 0.5,
                        Math.round(slot), Math.round(this.plotH()));
                }
                const col = cols[ci];
                for (let ri = 0; ri < nRows; ri += 1) {
                    const v = col[ri];
                    if (v <= 0) continue;
                    const y = this.plotB() - (ri + 0.5) * rowH;
                    if (text) {
                        ctx.fillStyle = v === gmax ? '#fcd535' : dim;
                        ctx.fillText(String(v), cx, y, slot - 3);
                    } else {
                        // too tight for numbers → volume heat cell
                        const a = 0.12 + 0.6 * (v / gmax);
                        ctx.fillStyle = v === gmax ? 'rgba(252,213,53,0.8)' : `rgba(74,158,255,${a})`;
                        ctx.fillRect(cx - slot / 2, y - rowH / 2, slot, Math.max(1, rowH - 1));
                    }
                }
            });
            return;
        }

        if (s.kind === 'Renko') {
            // Brick chart: bricks are derived bars on synthetic, evenly-spread
            // times (see renkoBars) so they sit on the shared time axis and any
            // overlay indicators — recomputed on the same bricks — line up. The
            // box is taken from the full close range (stable across zoom).
            const up = s.opts.upColor ?? '#00c853';
            const dn = s.opts.downColor ?? '#ff3d57';
            const bricks = renkoBricks(s.data, renkoBox(s.data, s.opts.boxSize));
            const times = evenSpan(s.data, bricks.length);
            const bw = bricks.length > 1
                ? Math.max(2, Math.abs(this.timeToX(times[1]) - this.timeToX(times[0])) * 0.85)
                : Math.max(3, this.barStepPx());
            bricks.forEach((bk, i) => {
                const x = this.timeToX(times[i]);
                if (x < this.plotL() - bw || x > this.plotR() + bw) return;
                const yT = this.valueToY(bk.hi, b);
                const yB = this.valueToY(bk.lo, b);
                ctx.fillStyle = bk.up ? up : dn;
                ctx.fillRect(x - bw / 2, Math.min(yT, yB), bw, Math.max(1, Math.abs(yB - yT)));
            });
            return;
        }

        if (s.kind === 'PointFigure') {
            // X column = rising (X marks), O column = falling (O marks).
            // Columns are derived bars on synthetic, evenly-spread times (see
            // pnfBars) so they sit on the shared axis with overlay indicators
            // (recomputed on the same columns). Box is from the full range and
            // stays put across zoom; the symbol fills it (classic P&F density).
            const up = s.opts.upColor ?? '#00c853';
            const dn = s.opts.downColor ?? '#ff3d57';
            const box = pnfBox(s.data, s.opts.boxSize);
            const cols = pnfColumns(s.data, box, num(s.opts.reversal, 2));
            if (cols.length === 0) return;
            const times = evenSpan(s.data, cols.length);
            const cw = cols.length > 1
                ? Math.abs(this.timeToX(times[1]) - this.timeToX(times[0]))
                : this.barStepPx();
            const boxPx = Math.abs(this.valueToY(b.min + box, b) - this.valueToY(b.min, b));
            const r = Math.max(2, Math.min(cw * 0.4, boxPx * 0.45));
            ctx.lineWidth = 1.5;
            cols.forEach((col, ci) => {
                const cx = this.timeToX(times[ci]);
                if (cx < this.plotL() - cw || cx > this.plotR() + cw) return;
                ctx.strokeStyle = col.up ? up : dn;
                for (let v = col.lo; v <= col.hi + 1e-6; v += box) {
                    const yc = this.valueToY(v + box / 2, b);
                    ctx.beginPath();
                    if (col.up) {
                        ctx.moveTo(cx - r, yc - r); ctx.lineTo(cx + r, yc + r);
                        ctx.moveTo(cx + r, yc - r); ctx.lineTo(cx - r, yc + r);
                    } else {
                        ctx.arc(cx, yc, r, 0, Math.PI * 2);
                    }
                    ctx.stroke();
                }
            });
            return;
        }

        if (s.kind === 'Histogram') {
            // ~80% of the slot, scaling with spacing (industry-standard:
            // chunky bars, ~1px gap), no fixed thin cap.
            const bw = Math.max(1, this.barStepPx() * 0.8 - 1);
            const baseY = this.valueToY(num(s.opts.base, 0), b);
            for (const p of visible) {
                const x = this.timeToX(p.time);
                const y = this.valueToY(p.value, b);
                ctx.fillStyle = p.color ?? s.opts.color ?? '#4aa3ff';
                ctx.fillRect(x - bw / 2, Math.min(y, baseY), bw, Math.max(1, Math.abs(y - baseY)));
            }
            return;
        }

        // Line / Area share the polyline
        const color = s.opts.lineColor ?? s.opts.color ?? '#89b4ff';
        const lw = num(s.opts.lineWidth, s.kind === 'Area' ? 2 : 1);
        ctx.lineJoin = 'round';
        if (s.kind === 'Area') {
            const grad = ctx.createLinearGradient(0, this.plotT(), 0, this.plotB());
            grad.addColorStop(0, s.opts.topColor ?? 'rgba(74,163,255,0.35)');
            grad.addColorStop(1, s.opts.bottomColor ?? 'rgba(74,163,255,0.02)');
            ctx.beginPath();
            visible.forEach((p, i) => {
                const x = this.timeToX(p.time);
                const y = this.valueToY(p.value, b);
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            const lastX = this.timeToX(visible[visible.length - 1].time);
            const firstX = this.timeToX(visible[0].time);
            ctx.lineTo(lastX, this.plotB());
            ctx.lineTo(firstX, this.plotB());
            ctx.closePath();
            ctx.fillStyle = grad;
            ctx.fill();
        }
        ctx.beginPath();
        visible.forEach((p, i) => {
            const x = this.timeToX(p.time);
            const y = this.valueToY(p.value, b);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.stroke();
    }

    private drawMarkers(rb: { min: number; max: number }, lb: { min: number; max: number }): void {
        const ctx = this.ctx;
        ctx.font = `10px ${this.opts.layout?.fontFamily ?? DEF_FONT}`;
        for (const s of this.series) {
            if (s.markers.length === 0) continue;   // markers on ANY series kind
            const b = s.priceScaleId() === 'left' ? lb : rb;
            const byTime = new Map(s.data.map((p) => [p.time, p]));
            for (const m of s.markers) {
                if (m.time < this.viewFrom || m.time > this.viewTo) continue;
                const p = byTime.get(m.time) as AnyPoint | undefined;
                if (p === undefined) continue;
                const x = this.timeToX(m.time);
                const ohlc = s.kind === 'Candlestick' || s.kind === 'Bar';
                const anchorV = ohlc
                    ? (m.position === 'aboveBar' ? p.high : p.low)
                    : p.value;
                const baseY = this.valueToY(anchorV, b);
                const dir = m.position === 'aboveBar' ? -1 : 1;
                const y = baseY + dir * 14;
                ctx.fillStyle = m.color;
                ctx.strokeStyle = m.color;
                const pd = m.shape === 'arrowUp' ? -1 : 1;       // arrow screen-y dir
                if (m.shape === 'arrowUp' || m.shape === 'arrowDown') {
                    // Industry-standard arrow: triangular head + shaft,
                    // tip pointing toward the bar. Compact vertically.
                    const tip = y + pd * 6;
                    const hb = y + pd * 1;       // head base
                    const tail = y - pd * 5;
                    ctx.beginPath();
                    ctx.moveTo(x, tip);
                    ctx.lineTo(x - 6, hb);
                    ctx.lineTo(x - 2, hb);
                    ctx.lineTo(x - 2, tail);
                    ctx.lineTo(x + 2, tail);
                    ctx.lineTo(x + 2, hb);
                    ctx.lineTo(x + 6, hb);
                    ctx.closePath();
                    ctx.fill();
                } else if (m.shape === 'circle') {
                    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
                } else {
                    ctx.fillRect(x - 4, y - 4, 8, 8);
                }
                if (m.text) {
                    const tailY = y - pd * 5;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = m.position === 'aboveBar' ? 'bottom' : 'top';
                    ctx.fillText(m.text, x, tailY + (m.position === 'aboveBar' ? -3 : 3));
                }
            }
        }
    }

    // Crosshair tooltip — industry-standard format: "12 Apr '24 00:00:00".
    private fmtTime(t: Time): string {
        const d = new Date(t * 1000);
        const p = (n: number) => String(n).padStart(2, '0');
        const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const date = `${d.getUTCDate()} ${MON[d.getUTCMonth()]} '${p(d.getUTCFullYear() % 100)}`;
        if (this.opts.timeScale?.timeVisible) {
            return `${date} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
        }
        return date;
    }
    // Nice, boundary-aligned time ticks + the chosen step, so labels
    // land on round moments (month starts, day starts, …).
    private timeTicks(): { ticks: Time[]; step: number } {
        if (this.ordinalMode()) return this.ordinalTimeTicks();
        const span = this.viewTo - this.viewFrom || 1;
        const target = Math.max(2, Math.floor(this.plotW() / 80));
        const S = [60, 300, 900, 1800, 3600, 7200, 14400, 21600, 43200,
                   86400, 172800, 604800, 1209600, 2592000, 5184000,
                   7776000, 15552000, 31536000];
        const raw = span / target;
        let step = S[S.length - 1];
        for (const s of S) { if (s >= raw) { step = s; break; } }
        const start = Math.ceil(this.viewFrom / step) * step;
        const ticks: Time[] = [];
        for (let t = start; t <= this.viewTo; t += step) ticks.push(t);
        return { ticks, step };
    }
    // Ordinal ticks land on real bars at a fixed BAR-index stride, so they are
    // evenly spaced on screen; the label shows each tick bar's real time, which
    // may jump across a collapsed gap (e.g. day 7 → day 10). step drives the
    // label granularity via the average time each stride covers.
    private ordinalTimeTicks(): { ticks: Time[]; step: number } {
        const s = this.indexRefSeries();
        if (s === null || s.data.length === 0) return { ticks: [], step: 60 };
        const d = s.data;
        const lfRaw = this.timeToLogical(this.viewFrom) ?? 0;
        const ltRaw = this.timeToLogical(this.viewTo) ?? (d.length - 1);
        const lf = Math.max(0, Math.floor(lfRaw));
        const lt = Math.min(d.length - 1, Math.ceil(ltRaw));
        const visCount = Math.max(1, lt - lf);
        const target = Math.max(2, Math.floor(this.plotW() / 80));
        const stride = Math.max(1, Math.round(visCount / target));
        const ticks: Time[] = [];
        for (let i = lf; i <= lt; i += stride) {
            const p = d[i];
            if (p !== undefined && Number.isFinite(p.time)) ticks.push(p.time);
        }
        const perBar = (d[lt].time - d[lf].time) / visCount;
        const step = Math.max(60, perBar * stride);
        return { ticks, step };
    }
    // Format a tick by the step granularity (industry-standard auto):
    // year / month name / day number / time, with month names landing
    // on the first tick of each month at day scale.
    private fmtTick(t: Time, step: number): string {
        const d = new Date(t * 1000);
        const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const p = (n: number) => String(n).padStart(2, '0');
        if (step >= 15552000) return String(d.getUTCFullYear());
        if (step >= 2592000) return d.getUTCMonth() === 0 ? String(d.getUTCFullYear()) : MON[d.getUTCMonth()];
        if (step >= 86400) {
            return d.getUTCDate() <= step / 86400 ? MON[d.getUTCMonth()] : String(d.getUTCDate());
        }
        if (step >= 3600) return `${p(d.getUTCHours())}:00`;
        return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
    }

    private drawAxes(rb: { min: number; max: number } | null, lb: { min: number; max: number } | null): void {
        const ctx = this.ctx;
        ctx.fillStyle = this.opts.layout?.textColor ?? DEF_TEXT;
        ctx.font = `10px ${this.opts.layout?.fontFamily ?? DEF_FONT}`;
        ctx.lineWidth = 1;

        // right price axis (only when a right-scale series exists)
        if (rb !== null) {
            ctx.strokeStyle = this.opts.rightPriceScale?.borderColor ?? DEF_BORDER;
            ctx.beginPath();
            ctx.moveTo(this.plotR() + 0.5, this.plotT());
            ctx.lineTo(this.plotR() + 0.5, this.plotB());
            ctx.stroke();
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            const rFmt = this.primaryFormat('right');
            for (const v of this.niceTicks(rb.min, rb.max, this.priceTickCount())) {
                const y = this.valueToY(v, rb);
                if (y < this.plotT() - 1 || y > this.plotB() + 1) continue;
                ctx.fillText(this.fmtPrice(v, rFmt), this.plotR() + 6, y);
            }
        }

        // left price axis (only when a left-scale series exists)
        if (lb !== null) {
            ctx.strokeStyle = this.opts.leftPriceScale?.borderColor ?? DEF_BORDER;
            ctx.beginPath();
            ctx.moveTo(this.plotL() - 0.5, this.plotT());
            ctx.lineTo(this.plotL() - 0.5, this.plotB());
            ctx.stroke();
            ctx.textAlign = 'right';
            const lFmt = this.primaryFormat('left');
            for (const v of this.niceTicks(lb.min, lb.max, this.priceTickCount())) {
                const y = this.valueToY(v, lb);
                if (y < this.plotT() - 1 || y > this.plotB() + 1) continue;
                ctx.fillText(this.fmtPrice(v, lFmt), this.plotL() - 6, y);
            }
        }

        // time axis
        if (this.opts.timeScale?.visible !== false) {
            ctx.strokeStyle = this.opts.timeScale?.borderColor ?? DEF_BORDER;
            ctx.beginPath();
            ctx.moveTo(this.plotL(), this.plotB() + 0.5);
            ctx.lineTo(this.plotR(), this.plotB() + 0.5);
            ctx.stroke();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillStyle = this.opts.layout?.textColor ?? DEF_TEXT;
            const { ticks, step } = this.timeTicks();
            for (const t of ticks) {
                const x = this.timeToX(t);
                if (x < this.plotL() + 14 || x > this.plotR() - 14) continue;
                ctx.fillText(this.fmtTick(t, step), x, this.plotB() + 4);
            }
        }
    }

    private drawCrosshair(rb: { min: number; max: number; mode?: PriceScaleModeValue }, lb: { min: number; max: number; mode?: PriceScaleModeValue }): void {
        if (this.mouseX === null || this.mouseY === null) return;
        const ch = this.opts.crosshair ?? {};
        if (this.mouseX < this.plotL() || this.mouseX > this.plotR()) return;
        const ctx = this.ctx;
        const st = this.snapTime(this.mouseX);
        // Vertical line snaps to the bar (industry-standard behaviour).
        const vx = st !== undefined ? this.timeToX(st) : this.mouseX;
        const lineCol = ch.vertLine?.color ?? '#4a4a52';
        // Crosshair pill: solid dark slate + white text (industry-
        // standard style), distinct from the coloured per-series price tags.
        const pillBg = '#1e222d';
        const pillBorder = '#434651';
        const pillFg = '#ffffff';
        const labelFg = this.opts.layout?.background?.color ?? DEF_LAYOUT_BG;

        // Magnet mode: snap horizontal-line Y to the nearest OHLC level
        // of the candle/bar under the cursor. Useful when placing alerts
        // exactly on a high/low/close.
        let crossY = this.mouseY;
        const crossMode = ch.mode ?? CrosshairMode.Normal;
        if (crossMode === CrosshairMode.Magnet && st !== undefined) {
            for (const s of this.series) {
                if (s.kind !== 'Candlestick' && s.kind !== 'Bar') continue;
                const p = s.data.find((d) => d.time === st);
                if (p === undefined) continue;
                const b = s.priceScaleId() === 'left' ? lb : rb;
                const candidates = [p.open, p.high, p.low, p.close];
                let bestY = this.mouseY, bestD = Infinity;
                for (const v of candidates) {
                    if (!Number.isFinite(v)) continue;
                    const y = this.valueToY(v, b);
                    const d = Math.abs(y - this.mouseY);
                    if (d < bestD) { bestD = d; bestY = y; }
                }
                crossY = bestY;
                break;
            }
        }

        ctx.save();
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1;
        if (ch.vertLine?.visible !== false && vx >= this.plotL() && vx <= this.plotR()) {
            ctx.strokeStyle = lineCol;
            ctx.beginPath();
            ctx.moveTo(Math.round(vx) + 0.5, this.plotT());
            ctx.lineTo(Math.round(vx) + 0.5, this.plotB());
            ctx.stroke();
        }
        if (ch.horzLine?.visible !== false && crossY >= this.plotT() && crossY <= this.plotB()) {
            ctx.strokeStyle = ch.horzLine?.color ?? '#4a4a52';
            ctx.beginPath();
            ctx.moveTo(this.plotL(), Math.round(crossY) + 0.5);
            ctx.lineTo(this.plotR(), Math.round(crossY) + 0.5);
            ctx.stroke();
        }
        ctx.restore();

        // Per-series value dots at the snapped time (the little circles
        // the host puts on every series/indicator at the crosshair).
        if (st !== undefined) {
            for (const s of this.series) {
                if (s.kind === 'VolumeProfile') continue;
                const p = s.data.find((d) => d.time === st);
                if (p === undefined) continue;
                const b = s.priceScaleId() === 'left' ? lb : rb;
                const val = (s.kind === 'Candlestick' || s.kind === 'Bar') ? p.close : p.value;
                if (!Number.isFinite(val)) continue;
                const dx = this.timeToX(st);
                const dy = this.valueToY(val, b);
                if (dy < this.plotT() - 2 || dy > this.plotB() + 2) continue;
                const col = s.kind === 'Candlestick'
                    ? (p.close >= p.open ? (s.opts.upColor ?? '#31c15b') : (s.opts.downColor ?? '#ff6d6d'))
                    : (s.opts.lineColor ?? s.opts.color ?? '#89b4ff');
                ctx.beginPath();
                ctx.arc(dx, dy, 4, 0, Math.PI * 2);
                ctx.fillStyle = col;
                ctx.fill();
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = labelFg;
                ctx.stroke();
            }
        }

        // Floating axis pills (time on the bottom, price on the right).
        ctx.font = `10px ${this.opts.layout?.fontFamily ?? DEF_FONT}`;
        ctx.textBaseline = 'middle';
        const pill = (text: string, cx: number, cy: number, align: 'center' | 'left'): void => {
            const w = ctx.measureText(text).width + 14;
            const h = 17;
            const x = align === 'center' ? cx - w / 2 : cx;
            const y = cy - h / 2;
            const rr = 3;
            ctx.beginPath();
            ctx.moveTo(x + rr, y);
            ctx.arcTo(x + w, y, x + w, y + h, rr);
            ctx.arcTo(x + w, y + h, x, y + h, rr);
            ctx.arcTo(x, y + h, x, y, rr);
            ctx.arcTo(x, y, x + w, y, rr);
            ctx.closePath();
            ctx.fillStyle = pillBg;
            ctx.fill();
            ctx.lineWidth = 1;
            ctx.strokeStyle = pillBorder;
            ctx.stroke();
            ctx.fillStyle = pillFg;
            ctx.textAlign = align === 'center' ? 'center' : 'left';
            ctx.fillText(text, align === 'center' ? cx : cx + 6, cy);
        };
        if (st !== undefined && vx >= this.plotL() && vx <= this.plotR()
            && ch.vertLine?.visible !== false)
            pill(this.fmtTime(st), vx, this.plotB() + 11, 'center');
        // Right-axis price pill at the cursor's y. Gated by horzLine.visible
        // so the host can suppress it during an order drag (the order title
        // already shows the live price; this pill would overlap and obscure
        // the colored order label).
        if (crossY >= this.plotT() && crossY <= this.plotB()
            && ch.horzLine?.visible !== false) {
            const price = this.yToValue(crossY, rb);
            pill(this.fmtPrice(price, this.primaryFormat('right')), this.plotR() + 1, crossY, 'left');
        }
    }

    // ---- pointer / interaction --------------------------------------
    private snapTime(x: number): Time | undefined {
        // The reference series for the crosshair must be a real
        // time-based price series — NOT VolumeProfile (no time) or it
        // would always return undefined and the legend would never
        // update.
        const primary =
            this.series.find((s) => s.kind !== 'VolumeProfile' && s.data.length > 0
                && Number.isFinite(s.data[0].time))
            ?? this.series.find((s) => s.data.length > 0 && Number.isFinite(s.data[0].time));
        if (primary === undefined) return undefined;
        const t = this.xToTime(x);
        let best = primary.data[0];
        let bestD = Infinity;
        for (const p of primary.data) {
            if (!Number.isFinite(p.time)) continue;
            const d = Math.abs(p.time - t);
            if (d < bestD) { bestD = d; best = p; }
        }
        return best.time;
    }

    private inPriceGutter(x: number): boolean {
        return x >= this.plotR() || (this.padLeft > 0 && x <= this.plotL());
    }
    private inTimeGutter(y: number): boolean {
        return this.opts.timeScale?.visible !== false && y >= this.plotB();
    }

    // Read live, not captured-in-closure, so an external overlay can
    // toggle `handleScroll: false` mid-gesture (e.g. on a price-line
    // grab) and the chart stops panning immediately on the next move.
    private get dragPanEnabled(): boolean {
        const h = this.opts.handleScroll;
        if (h === false) return false;
        if (typeof h === 'object' && h !== null) return h.pressedMouseMove !== false;
        return true;
    }
    private get wheelZoomEnabled(): boolean {
        const h = this.opts.handleScale;
        if (h === false) return false;
        if (typeof h === 'object' && h !== null) return h.mouseWheel !== false;
        return true;
    }

    private bindPointer(): void {
        this.canvas.addEventListener('pointermove', (e) => {
            const r = this.canvas.getBoundingClientRect();
            this.mouseX = e.clientX - r.left;
            this.mouseY = e.clientY - r.top;
            if (this.priceDragging) {
                const dy = this.mouseY - this.lastDragY;
                this.lastDragY = this.mouseY;
                // drag up → stretch (zoom in), drag down → compress
                this.priceZoom = Math.min(12, Math.max(0.15, this.priceZoom * Math.exp(-dy * 0.006)));
                this.scheduleDraw();
                return;
            }
            if (this.timeDragging) {
                const dx = this.mouseX - this.lastAxisX;
                this.lastAxisX = this.mouseX;
                // drag left → expand time (zoom in), right → compress;
                // anchored at the right edge (industry-standard behaviour).
                const span = this.viewTo - this.viewFrom;
                const ns = Math.max(1, span * Math.exp(dx * 0.004));
                this.viewFrom = this.viewTo - ns;
                this.emitRange();
                this.scheduleDraw();
                return;
            }
            this.canvas.style.cursor = this.inTimeGutter(this.mouseY) ? 'ew-resize'
                : this.inPriceGutter(this.mouseX) ? 'ns-resize' : 'default';
            if (this.dragging && this.dragPanEnabled) {
                const dx = this.mouseX - this.lastDragX;
                this.lastDragX = this.mouseX;
                // Shift by the time a dx-pixel move spans at the current left
                // edge. In time mode this equals -(dx/plotW)*span; in ordinal
                // mode xToTime routes through the bar index, so panning tracks
                // bars evenly across collapsed gaps.
                const shift = this.xToTime(this.plotL()) - this.xToTime(this.plotL() + dx);
                this.clampView(this.viewFrom + shift, this.viewTo + shift);
                this.emitRange();
            }
            const time = this.snapTime(this.mouseX);
            for (const cb of this.crosshairListeners) cb({ time, point: { x: this.mouseX, y: this.mouseY } });
            this.scheduleDraw();
        });
        this.canvas.addEventListener('pointerleave', () => {
            this.mouseX = null;
            this.mouseY = null;
            for (const cb of this.crosshairListeners) cb({});
            this.scheduleDraw();
        });
        this.canvas.addEventListener('pointerdown', (e) => {
            // capture so a finger / mouse leaving the canvas mid-drag
            // keeps sending us pointermove events
            try { (this.canvas as Element).setPointerCapture(e.pointerId); } catch { /* unsupported */ }
            const r = this.canvas.getBoundingClientRect();
            const mx = e.clientX - r.left;
            const my = e.clientY - r.top;
            if (this.inTimeGutter(my)) {
                // grab the time axis → horizontal stretch
                this.timeDragging = true;
                this.lastAxisX = mx;
            } else if (this.inPriceGutter(mx)) {
                // grab the price axis → vertical stretch, not a time pan
                this.priceDragging = true;
                this.lastDragY = my;
            } else {
                this.dragging = true;
                this.lastDragX = mx;
            }
        });
        const endDrag = (): void => {
            this.dragging = false; this.priceDragging = false; this.timeDragging = false;
        };
        window.addEventListener('pointerup', endDrag);
        window.addEventListener('pointercancel', endDrag);
        // Double-click anywhere → fit all data to the full width
        // (the desktop/terminal/Designer chart behaviour).
        this.canvas.addEventListener('dblclick', (e) => { e.preventDefault(); this.fitContent(); });
        {
            this.canvas.addEventListener('wheel', (e) => {
                if (!this.wheelZoomEnabled) return;
                e.preventDefault();
                const r = this.canvas.getBoundingClientRect();
                const px = e.clientX - r.left;
                const pivot = this.xToTime(px);
                // Smooth, delta-proportional zoom (no fixed 1.15 jumps) —
                // same fix as the diagram. deltaY>0 widens (zoom out).
                const factor = Math.exp(e.deltaY * 0.0015);
                const nf = pivot - (pivot - this.viewFrom) * factor;
                const nt = pivot + (this.viewTo - pivot) * factor;
                this.clampView(nf, nt);
                this.emitRange();
                this.scheduleDraw();
            }, { passive: false });
        }
        // Two-finger pinch on touch → horizontal time zoom, pivoted at the
        // initial midpoint between the fingers (mobile analog of the wheel).
        let pinchDist = 0;
        let pinchSpan = 0;
        let pinchPivot = 0;
        let pinchRatio = 0;
        let pinching = false;
        this.canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                const r = this.canvas.getBoundingClientRect();
                const x0 = e.touches[0].clientX - r.left;
                const x1 = e.touches[1].clientX - r.left;
                pinchDist = Math.max(1, Math.abs(x0 - x1));
                pinchSpan = this.viewTo - this.viewFrom;
                const midX = (x0 + x1) / 2;
                pinchPivot = this.xToTime(midX);
                pinchRatio = (midX - this.plotL()) / this.plotW();
                pinching = true;
                this.dragging = false; this.priceDragging = false; this.timeDragging = false;
            }
        }, { passive: false });
        this.canvas.addEventListener('touchmove', (e) => {
            if (pinching && e.touches.length === 2) {
                e.preventDefault();
                const r = this.canvas.getBoundingClientRect();
                const x0 = e.touches[0].clientX - r.left;
                const x1 = e.touches[1].clientX - r.left;
                const d = Math.max(1, Math.abs(x0 - x1));
                const newSpan = pinchSpan * (pinchDist / d);
                const nf = pinchPivot - pinchRatio * newSpan;
                const nt = pinchPivot + (1 - pinchRatio) * newSpan;
                this.clampView(nf, nt);
                this.emitRange();
                this.scheduleDraw();
            }
        }, { passive: false });
        const endPinch = (): void => { pinching = false; };
        this.canvas.addEventListener('touchend', endPinch);
        this.canvas.addEventListener('touchcancel', endPinch);
    }
}

// ---- public factory surface (the `SSChart` global) --------
export function createChart(container: HTMLElement, options: ChartOptions = {}): ChartImpl {
    return new ChartImpl(container, options);
}

export function createSeriesMarkers(series: Series, markers: SeriesMarker[] = []): MarkersPlugin {
    const plugin = new MarkersPlugin(series);
    plugin.setMarkers(markers);
    return plugin;
}

export const version = 'sschart-experimental-0.1';
