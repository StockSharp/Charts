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

import { calculateBarStepPx } from '../series-spacing.js';
import { DisposableStore } from './disposable.js';
import { PaneLayout, type PaneLayoutRect, type PaneLayoutResult, type PaneSplitter } from './layout/pane-layout.js';
import { ChartModel } from './model/chart-model.js';
import { PaneModel, type PaneOptions } from './model/pane-model.js';
import { SeriesModel } from './model/series-model.js';
import {
    MismatchDirection,
    SeriesStore,
    type BarsInfo,
    type MismatchDirectionValue,
} from './model/series-store.js';
import type { DataChangeSet } from './model/data-change-set.js';
import { RenderDirty, RenderScheduler, type RenderDirtyFlags } from './render-scheduler.js';
import type { TimeRange } from './scale/time-scale.js';
import {
    InternalPriceScaleMode,
    isRelativePriceScale,
    priceToScale,
    scaleToPrice,
} from './scale/price-transform.js';
import { registerBuiltInSeries } from '../series/built-in-renderers.js';
import { preparePointFigureData, prepareRenkoData } from '../series/derived-data.js';
import {
    seriesRendererRegistry,
    type CustomSeriesDefinition,
    type SeriesDefinition,
    type SeriesRendererContext,
    type TimedSeriesData,
} from '../series/registry.js';

export type { TimeRange } from './scale/time-scale.js';
export type { PaneOptions, PaneState } from './model/pane-model.js';
export { MismatchDirection } from './model/series-store.js';
export type { BarsInfo, MismatchDirectionValue } from './model/series-store.js';
export type { DataChangeKind, DataChangeSet } from './model/data-change-set.js';
export {
    getSeriesDefinition,
    getSeriesTypes,
    registerSeries,
    seriesRendererRegistry,
    unregisterSeries,
} from '../series/registry.js';
export type {
    CustomSeriesDefinition,
    ISeriesRenderer,
    PreparedSeriesData,
    SeriesDefinition,
    SeriesDataProcessor,
    SeriesPriceRange,
    SeriesRendererContext,
    SeriesRendererPane,
    SeriesRendererTheme,
    TimedSeriesData,
} from '../series/registry.js';

registerBuiltInSeries(seriesRendererRegistry);

export type Time = number; // UNIX seconds (the only form the app feeds)

export interface WhitespaceData { time: Time }
export interface CandlestickData { time: Time; open: number; high: number; low: number; close: number }
export interface LineData { time: Time; value: number }
export interface HistogramData { time: Time; value: number; color?: string }
export interface AreaData { time: Time; value: number }
export interface BandData { time: Time; value: number; upper: number; lower: number }
export interface VolumeProfileData extends CandlestickData { vol?: number }
export interface PriceLevelData { price: number; vol: number }
export interface ClusterData {
    time: Time;
    high: number;
    low: number;
    open?: number;
    close?: number;
    levels: readonly PriceLevelData[];
}

export type SeriesKind = 'Candlestick' | 'Bar' | 'Line' | 'Histogram' | 'Area'
    | 'Band' | 'PointFigure' | 'Renko' | 'VolumeProfile' | 'Cluster' | 'Box';

export const CandlestickSeries = seriesRendererRegistry.reference<CandlestickData, SeriesOptions>('Candlestick');
export const BarSeries = seriesRendererRegistry.reference<CandlestickData, SeriesOptions>('Bar');
export const LineSeries = seriesRendererRegistry.reference<LineData, SeriesOptions>('Line');
export const HistogramSeries = seriesRendererRegistry.reference<HistogramData, SeriesOptions>('Histogram');
export const AreaSeries = seriesRendererRegistry.reference<AreaData, SeriesOptions>('Area');
export const BandSeries = seriesRendererRegistry.reference<BandData, SeriesOptions>('Band');
export const PointFigureSeries = seriesRendererRegistry.reference<CandlestickData, SeriesOptions>('PointFigure');
export const RenkoSeries = seriesRendererRegistry.reference<CandlestickData, SeriesOptions>('Renko');
export const VolumeProfileSeries = seriesRendererRegistry.reference<VolumeProfileData, SeriesOptions>('VolumeProfile');
export const ClusterSeries = seriesRendererRegistry.reference<ClusterData, SeriesOptions>('Cluster');
export const BoxSeries2 = seriesRendererRegistry.reference<ClusterData, SeriesOptions>('Box');

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

// Price-scale display mode. Relative modes normalize every series against
// its own first visible value so differently-priced instruments compare fairly.
export const PriceScaleMode = {
    Normal: InternalPriceScaleMode.Normal,
    Logarithmic: InternalPriceScaleMode.Logarithmic,
    Percentage: InternalPriceScaleMode.Percentage,
    IndexedTo100: InternalPriceScaleMode.IndexedTo100,
} as const;
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
    // When set, the line's title label gets a small "✕" button rendered
    // just outside it; clicking that button calls this callback (used by
    // the terminal to cancel a resting order straight from its chart line).
    // The button click is consumed so it never starts a line drag.
    onClose?: () => void;
    // True while the host is actively dragging this line. Its label
    // skips the easing pass (snaps straight to target) so it never
    // trails the cursor on a fast pull, while still acting as the
    // immovable anchor that other labels yield to during collision.
    anchored?: boolean;
    // When true, the chart itself owns the drag gesture for this line: hovering it shows a
    // ns-resize cursor, pressing and moving drags it (the chart freezes autoscale and anchors
    // the label for the duration so it stays WYSIWYG), releasing commits. This is the reusable
    // order-line engine the terminal drives — hosts only supply the callbacks below, they do
    // not wire their own pointer handlers.
    draggable?: boolean;
    // Called on every move while this line is dragged, with the live price under the cursor.
    onDrag?: (price: number) => void;
    // Called once when the drag is released, with the final price. Use this to commit the move
    // (e.g. send an order-replace to the exchange); onDrag is for live UI feedback only.
    onDragCommit?: (price: number) => void;
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

export interface SeriesOptions {
    // candlestick
    upColor?: string; downColor?: string;
    borderVisible?: boolean; borderUpColor?: string; borderDownColor?: string;
    wickUpColor?: string; wickDownColor?: string;
    // line / area
    color?: string; lineColor?: string; lineWidth?: number; lineStyle?: LineStyleValue;
    lineVisible?: boolean;
    pointMarkersVisible?: boolean;
    pointMarkersRadius?: number;
    topColor?: string; bottomColor?: string;
    upperColor?: string; lowerColor?: string;
    fillColor?: string; positiveFillColor?: string; negativeFillColor?: string;
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

export interface ChartOptions {
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

type AnyPoint = CandlestickData & LineData & HistogramData & AreaData & BandData;

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

// Public transforms use the same processors as the built-in renderers, so
// indicator inputs and the visible derived series can never drift apart.
export function renkoBars(candles: ReadonlyArray<CandlestickData>, boxSize?: number): CandlestickData[] {
    return Array.from(prepareRenkoData(candles, boxSize).data);
}
export function pnfBars(
    candles: ReadonlyArray<CandlestickData>,
    boxSize?: number,
    reversal?: number,
): CandlestickData[] {
    return Array.from(preparePointFigureData(candles, boxSize, reversal).data);
}

class Series extends SeriesModel<AnyPoint> implements ISeriesApi<AnyPoint, SeriesOptions> {
    readonly kind: string;
    readonly definition: CustomSeriesDefinition<AnyPoint, SeriesOptions>;
    opts: SeriesOptions;
    readonly markerStore = new SeriesStore<SeriesMarker>();
    get affectsTimeScale(): boolean { return this.definition.affectsTimeScale !== false; }
    get markers(): readonly SeriesMarker[] { return this.markerStore.values; }
    get points(): readonly AnyPoint[] { return this.values; }
    private prepared: {
        key: string;
        store: SeriesStore<AnyPoint>;
        metadata: Readonly<Record<string, unknown>>;
    } | null = null;
    private optionsVersion = 0;
    constructor(definition: CustomSeriesDefinition<AnyPoint, SeriesOptions>, opts: SeriesOptions) {
        super();
        this.definition = definition;
        this.kind = definition.type;
        this.opts = opts;
    }
    setData(points: ReadonlyArray<AnyPoint>): void {
        const change = this.replaceData(points);
        this.chart?.onDataChanged(change);
    }
    // Streaming-style single-point push:
    // same time as last -> replace; newer time -> append; older -> ignore.
    update(point: AnyPoint): void {
        const change = this.updateTail(point);
        if (change !== null) this.chart?.onDataChanged(change);
    }
    prependData(points: ReadonlyArray<AnyPoint>): void {
        const change = this.store.prepend(points);
        if (change !== null) this.chart?.onDataChanged(change);
    }
    pop(count = 1): AnyPoint[] {
        const result = this.store.pop(count);
        if (result.change !== null) this.chart?.onDataChanged(result.change);
        return result.points;
    }
    data(): readonly AnyPoint[] { return this.store.snapshot(); }
    dataByIndex(logicalIndex: number, mismatchDirection: MismatchDirectionValue = MismatchDirection.None): AnyPoint | null {
        return this.chart?.seriesDataByLogicalIndex(this, logicalIndex, mismatchDirection)
            ?? this.store.dataByIndex(logicalIndex, mismatchDirection);
    }
    barsInLogicalRange(range: LogicalRange): BarsInfo | null {
        return this.chart?.seriesBarsInLogicalRange(this, range) ?? this.store.barsInLogicalRange(range);
    }
    applyOptions(patch: Partial<SeriesOptions>): void {
        this.opts = { ...this.opts, ...patch };
        this.optionsVersion++;
        this.chart?.scheduleDraw();
    }
    renderData(): {
        key: string;
        store: SeriesStore<AnyPoint>;
        metadata: Readonly<Record<string, unknown>>;
    } {
        const key = `${this.kind}:${this.store.version}:${this.optionsVersion}`;
        const processor = this.definition.dataProcessor;
        if (processor === undefined) return { key, store: this.store, metadata: {} };
        if (this.prepared?.key === key) return this.prepared;

        const result = processor(this.points, this.opts);
        const store = new SeriesStore<AnyPoint>();
        store.replace(result.data as readonly AnyPoint[]);
        this.prepared = {
            key,
            store,
            metadata: Object.freeze({ ...(result.metadata ?? {}) }),
        };
        return this.prepared;
    }
    priceScaleId(): string { return this.opts.priceScaleId ?? 'right'; }
    // Per-series price-scale handle. Lets the host adjust scaleMargins
    // (used for volume overlays — bottom band of the plot).
    priceScale(): PriceScaleApi { return new PriceScaleApi(this.chart, this.priceScaleId(), this.pane); }
    // back-ref wired by the chart
    chart: ChartImpl | null = null;
    pane: PaneModel<Series> | null = null;

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
        return this.chart.priceToY(price, this.priceScaleId(), this.pane, this);
    }
    coordinateToPrice(y: number): number | null {
        if (this.chart === null || !Number.isFinite(y)) return null;
        return this.chart.yToPrice(y, this.priceScaleId(), this.pane, this);
    }
}

// Concrete handle returned by Series.createPriceLine — mutable via
// applyOptions, repaints on each change. Drawn by the chart, not by
// itself, so the only state worth keeping is the options blob + a
// back-ref to the owning series. displayY caches the eased label
// position used by the collision-avoidance pass in drawPriceLines.
class PriceLine implements IPriceLine {
    private opts: PriceLineOptions;
    // last drawn label y = its line's y + labelOffset. The OFFSET (the collision-avoidance shift
    // away from the line) is what eases, not the absolute y — so the label tracks its own line
    // instantly when the line moves (zoom / scroll / drag) and only the spread animates.
    displayY: number | null = null;
    // eased collision offset from the line; null until the first frame (then it snaps, no fly-in).
    labelOffset: number | null = null;
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
    mode?: PriceScaleModeValue;
    // When false, pin the price range at its current value instead of auto-fitting it to the
    // visible data on every frame. Used by hosts during an interactive gesture (e.g. dragging a
    // resting order line): with autoscale on, a live candle arriving mid-drag re-fits the range
    // and shifts the price<->pixel mapping, so the dragged line drifts and the committed price no
    // longer matches the axis. Re-enable (true) to resume auto-fit. Defaults to true.
    autoScale?: boolean;
}
class PriceScaleApi implements IPriceScaleApi {
    constructor(
        private readonly chart: ChartImpl | null,
        private readonly scaleId: string,
        private readonly pane: PaneModel<Series> | null = null,
    ) {}
    applyOptions(patch: PriceScaleOptions): void {
        if (this.chart === null) return;
        if (patch.scaleMargins) {
            const cur = this.chart.getScaleMargins(this.scaleId, this.pane);
            this.chart.setScaleMargins(this.scaleId, {
                top:    Math.min(0.9, Math.max(0, patch.scaleMargins.top    ?? cur.top)),
                bottom: Math.min(0.9, Math.max(0, patch.scaleMargins.bottom ?? cur.bottom)),
            }, this.pane);
        }
        if (patch.mode !== undefined) this.chart.setScaleMode(this.scaleId, patch.mode, this.pane);
        if (patch.autoScale !== undefined) this.chart.setAutoScale(this.scaleId, patch.autoScale, this.pane);
    }
}

class MarkersPlugin implements ISeriesMarkersPlugin {
    constructor(private readonly series: Series) {}
    setMarkers(markers: SeriesMarker[]): void {
        this.series.markerStore.replace(markers);
        this.series.chart?.scheduleDraw();
    }
}

export interface SeriesHoveredObject {
    readonly type: 'series';
    readonly series: ISeriesApi<any, any>;
    readonly data: TimedSeriesData;
}
export interface PriceLineHoveredObject {
    readonly type: 'price-line';
    readonly series: ISeriesApi<any, any>;
    readonly priceLine: IPriceLine;
    readonly id: string | null;
}
export type HoveredObject = SeriesHoveredObject | PriceLineHoveredObject;
export interface CrosshairEvent {
    readonly time: Time | null;
    readonly logical: number | null;
    readonly point: { x: number; y: number } | null;
    readonly paneId: string | null;
    readonly seriesData: ReadonlyMap<ISeriesApi<any, any>, TimedSeriesData>;
    readonly hoveredObject: HoveredObject | null;
    readonly sourceEvent: PointerEvent | MouseEvent | null;
}
/** @deprecated Use CrosshairEvent. */
export type CrosshairMoveEvent = CrosshairEvent;
export interface CrosshairPosition {
    readonly time: Time;
    readonly price?: number;
    readonly pane?: IPaneApi;
    readonly series?: ISeriesApi<any, any>;
}
export type RangeListener = (range: TimeRange | null) => void;
export type CrosshairListener = (param: CrosshairEvent) => void;
// A press-release on the plot that did not move and did not grab a draggable line. Carries the
// price/time under the cursor and the keyboard modifiers, so a host can place a resting order
// (e.g. Ctrl+click) without wiring its own pointer handlers — the chart owns the gesture.
export interface ChartClick {
    price: number | null;
    time: Time | null;
    point: { x: number; y: number };
    button: number;   // 0 = left, 2 = right (a host can map buy/sell to the mouse button)
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    metaKey: boolean;
}
export type ClickListener = (c: ChartClick) => void;
// The order-place SIGNAL the chart emits when the user clicks in placement mode (its modifier held).
// The chart does not form the order — the host maps this to its domain (side by button, qty, colour,
// send to the venue) and draws the resulting order line via createPriceLine.
export interface OrderPlace {
    price: number;
    button: number;   // 0 = left, 2 = right — a host can map buy/sell to it
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    metaKey: boolean;
}
export type OrderPlaceListener = (e: OrderPlace) => void;
// lwc-shaped logical range = fractional bar indices. {from:5.5, to:170.2}
// means "bar 5 plus halfway through bar 6 … bar 170 plus 20%". Used by
// the terminal to sync multiple panes on the BAR axis (independent of
// gaps in time — weekend / non-trading hours).
export interface LogicalRange { from: number; to: number }
export type LogicalRangeListener = (range: LogicalRange | null) => void;

export interface IPriceScaleApi {
    applyOptions(patch: PriceScaleOptions): void;
}

export interface ISeriesMarkersPlugin {
    setMarkers(markers: SeriesMarker[]): void;
}

export interface ISeriesApi<
    TData extends TimedSeriesData = TimedSeriesData,
    TOptions extends SeriesOptions = SeriesOptions,
> {
    setData(points: ReadonlyArray<TData>): void;
    update(point: TData): void;
    prependData(points: ReadonlyArray<TData>): void;
    pop(count?: number): TData[];
    data(): readonly TData[];
    dataByIndex(logicalIndex: number, mismatchDirection?: MismatchDirectionValue): TData | null;
    barsInLogicalRange(range: LogicalRange): BarsInfo | null;
    applyOptions(patch: Partial<TOptions>): void;
    priceScaleId(): string;
    priceScale(): IPriceScaleApi;
    createPriceLine(options: PriceLineOptions): IPriceLine;
    removePriceLine(line: IPriceLine): void;
    priceToCoordinate(price: number): number | null;
    coordinateToPrice(y: number): number | null;
}

export interface ITimeScaleApi {
    fitContent(): void;
    setVisibleRange(range: TimeRange): void;
    getVisibleRange(): TimeRange | null;
    scrollToRealTime(): void;
    subscribeVisibleTimeRangeChange(cb: RangeListener): void;
    unsubscribeVisibleTimeRangeChange(cb: RangeListener): void;
    getVisibleLogicalRange(): LogicalRange | null;
    setVisibleLogicalRange(range: LogicalRange): void;
    subscribeVisibleLogicalRangeChange(cb: LogicalRangeListener): void;
    unsubscribeVisibleLogicalRangeChange(cb: LogicalRangeListener): void;
    timeToCoordinate(time: Time): number | null;
    coordinateToTime(x: number): Time | null;
    logicalToCoordinate(index: number): number | null;
    coordinateToLogical(x: number): number | null;
}

export interface PaneSize {
    width: number;
    height: number;
    top: number;
}

export interface IPaneApi {
    id(): string;
    addSeries<TData extends TimedSeriesData, TOptions extends SeriesOptions = SeriesOptions>(
        definition: SeriesDefinition<TData, TOptions>,
        options?: Partial<TOptions>,
    ): ISeriesApi<TData, TOptions>;
    removeSeries(series: ISeriesApi): void;
    series(): readonly ISeriesApi[];
    priceScale(scaleId?: string): IPriceScaleApi;
    timeScale(): ITimeScaleApi;
    applyOptions(options: Omit<PaneOptions, 'id'>): void;
    options(): Required<PaneOptions>;
    getSize(): PaneSize;
}

export interface OrderPlacementOptions {
    modifier?: 'ctrl' | 'shift' | 'alt';
    color?: string;
    title?: string;
}

export interface IChartApi {
    addPane(options?: PaneOptions): IPaneApi;
    panes(): readonly IPaneApi[];
    removePane(pane: IPaneApi): void;
    addSeries<TData extends TimedSeriesData, TOptions extends SeriesOptions = SeriesOptions>(
        definition: SeriesDefinition<TData, TOptions>,
        options?: Partial<TOptions>,
        pane?: IPaneApi,
    ): ISeriesApi<TData, TOptions>;
    removeSeries(series: ISeriesApi): void;
    timeScale(): ITimeScaleApi;
    priceScale(scaleId?: string): IPriceScaleApi;
    subscribeClick(cb: ClickListener): void;
    unsubscribeClick(cb: ClickListener): void;
    subscribeCrosshairMove(cb: CrosshairListener): void;
    unsubscribeCrosshairMove(cb: CrosshairListener): void;
    setCrosshairPosition(position: CrosshairPosition): void;
    clearCrosshairPosition(): void;
    setOrderPlacement(options: OrderPlacementOptions | null): void;
    subscribeOrderPlace(cb: OrderPlaceListener): void;
    unsubscribeOrderPlace(cb: OrderPlaceListener): void;
    draggingLine(): IPriceLine | null;
    applyOptions(patch: ChartOptions): void;
    resize(width: number, height: number): void;
    takeScreenshot(): HTMLCanvasElement;
    remove(): void;
}

class TimeScaleApi implements ITimeScaleApi {
    constructor(private readonly chart: ChartImpl) {}
    fitContent(): void { this.chart.fitContent(); }
    setVisibleRange(range: TimeRange): void { this.chart.setVisibleRange(range, true); }
    getVisibleRange(): TimeRange | null { return this.chart.getVisibleRange(); }
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

class PaneApi implements IPaneApi {
    constructor(
        private readonly chart: ChartImpl,
        readonly model: PaneModel<Series>,
    ) {}

    id(): string { return this.model.id; }
    addSeries<TData extends TimedSeriesData, TOptions extends SeriesOptions = SeriesOptions>(
        definition: SeriesDefinition<TData, TOptions>,
        options?: Partial<TOptions>,
    ): ISeriesApi<TData, TOptions> {
        return this.chart.addSeries(definition, options, this);
    }
    removeSeries(series: ISeriesApi): void { this.chart.removeSeries(series); }
    series(): readonly ISeriesApi[] { return this.model.series.slice(); }
    priceScale(scaleId = 'right'): IPriceScaleApi { return new PriceScaleApi(this.chart, scaleId, this.model); }
    timeScale(): ITimeScaleApi { return this.chart.timeScale(); }
    applyOptions(options: Omit<PaneOptions, 'id'>): void { this.chart.applyPaneOptions(this, options); }
    options(): Required<PaneOptions> {
        return {
            id: this.model.id,
            height: this.model.height,
            minHeight: this.model.minHeight,
            order: this.model.order,
            state: this.model.state,
        };
    }
    getSize(): PaneSize { return this.chart.paneSize(this); }
}

interface ScaleBounds {
    min: number;
    max: number;
    mode: PriceScaleModeValue;
    baseValue: number;
    baseValues: ReadonlyMap<Series, number>;
}

class ChartImpl implements IChartApi {
    private readonly host: HTMLElement;
    private readonly root: HTMLDivElement;
    private readonly baseCanvas: HTMLCanvasElement;
    private readonly canvas: HTMLCanvasElement;
    private readonly baseCtx: CanvasRenderingContext2D;
    private readonly overlayCtx: CanvasRenderingContext2D;
    private ctx: CanvasRenderingContext2D;
    private readonly opts: ChartOptions;
    private readonly model = new ChartModel<Series>();
    private readonly tsApi = new TimeScaleApi(this);
    private readonly paneLayout = new PaneLayout();
    private readonly fullRangeCache = new WeakMap<Series, { key: string; min: number; max: number }>();
    private paneLayoutResult: PaneLayoutResult = { panes: [], splitters: [] };
    private readonly paneApis = new Map<string, PaneApi>();
    private activePane: PaneModel<Series> = this.model.mainPane;
    private activePaneRect: PaneLayoutRect = {
        paneId: 'main', state: 'normal', x: 0, y: 0, width: 0, height: 0,
    };

    private get series(): readonly Series[] { return this.model.series; }
    private get activeSeries(): readonly Series[] { return this.activePane.series; }
    private get viewFrom(): number { return this.model.timeScale.visibleFrom; }
    private set viewFrom(value: number) { this.model.timeScale.visibleFrom = value; }
    private get viewTo(): number { return this.model.timeScale.visibleTo; }
    private set viewTo(value: number) { this.model.timeScale.visibleTo = value; }
    private get dataMin(): number { return this.model.timeScale.dataFrom; }
    private get dataMax(): number { return this.model.timeScale.dataTo; }

    rangeListeners: RangeListener[] = [];
    logicalRangeListeners: LogicalRangeListener[] = [];
    private crosshairListeners: CrosshairListener[] = [];
    // Screen rects (CSS px) of the per-frame price-line "✕" close buttons, with the
    // callback to fire when one is clicked. Rebuilt every draw; hit-tested on mousedown.
    private _closeHits: { x: number; y: number; w: number; h: number; onClose: () => void }[] = [];

    private width = 0;
    private height = 0;
    private dpr = 1;

    private readonly disposables = new DisposableStore();
    private readonly renderScheduler: RenderScheduler;
    private disposed = false;
    // optional ResizeObserver when autoSize is on (default true)
    private autoResizer: ResizeObserver | null = null;

    // pointer state
    private mouseX: number | null = null;
    private mouseY: number | null = null;
    private controlledCrosshairTime: Time | null = null;
    private dragging = false;
    private lastDragX = 0;
    // manual vertical price-scale stretch (drag the price axis)
    private priceDragging = false;
    private gesturePane: PaneModel<Series> | null = null;
    private lastDragY = 0;
    // manual horizontal time-scale stretch (drag the time axis)
    private timeDragging = false;
    private lastAxisX = 0;
    private splitterDrag: {
        splitter: PaneSplitter;
        startY: number;
        beforeHeight: number;
        afterHeight: number;
    } | null = null;
    // order-line drag engine: the draggable price line currently grabbed (null = none)
    private lineDrag: { series: Series; line: PriceLine } | null = null;
    // true between a pointerdown that landed on the canvas and its release — so a stray global
    // pointerup (gesture started elsewhere) is ignored by finishGesture
    private pointerDown = false;
    // pointer-down origin, used to tell a click (place) from a drag (pan / line move)
    private downX = 0;
    private downY = 0;
    private downButton = 0;   // 0 = left, 2 = right — reported on the click so hosts can map buy/sell
    // click subscribers — fired on a press-release that did not move and did not grab a line
    private clickListeners: ((c: ChartClick) => void)[] = [];
    // order-placement mode: while its modifier is held over the plot the chart shows its own neutral
    // preview price line tracking the cursor, and on the click it EMITS an order-place SIGNAL
    // (subscribeOrderPlace) with the price + button — it does not form the order itself.
    private placement: { modifier: string; color: string; title: string } | null = null;
    private placementLine: IPriceLine | null = null;
    private modifierHeld = false;
    private orderPlaceListeners: ((e: OrderPlace) => void)[] = [];

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
            this.renderScheduler.reschedule();
        }
    };

    constructor(host: HTMLElement, opts: ChartOptions) {
        this.host = host;
        this.opts = opts;
        this.paneApis.set(this.model.mainPane.id, new PaneApi(this, this.model.mainPane));
        this.root = document.createElement('div');
        this.root.className = 'sschart-root';
        this.root.style.position = 'relative';
        this.root.style.overflow = 'hidden';
        this.root.style.display = 'block';

        this.baseCanvas = document.createElement('canvas');
        this.baseCanvas.dataset.sschartLayer = 'base';
        this.baseCanvas.style.position = 'absolute';
        this.baseCanvas.style.inset = '0';
        this.baseCanvas.style.display = 'block';
        this.baseCanvas.style.pointerEvents = 'none';

        this.canvas = document.createElement('canvas');
        this.canvas.dataset.sschartLayer = 'overlay';
        this.canvas.style.position = 'absolute';
        this.canvas.style.inset = '0';
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
        this.root.append(this.baseCanvas, this.canvas);
        host.appendChild(this.root);
        const baseCtx = this.baseCanvas.getContext('2d');
        const overlayCtx = this.canvas.getContext('2d');
        if (baseCtx === null || overlayCtx === null) throw new Error('sschart: 2d context unavailable');
        this.baseCtx = baseCtx;
        this.overlayCtx = overlayCtx;
        this.ctx = baseCtx;
        this.renderScheduler = this.disposables.add(new RenderScheduler((dirty) => this.draw(dirty)));

        const w = num(opts.width, host.clientWidth || 600);
        const h = num(opts.height, host.clientHeight || 300);
        this.applySize(w, h);
        this.bindPointer();
        this.listen(document, 'visibilitychange', this.onVisChange);
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
            const observer = this.autoResizer;
            this.disposables.defer(() => {
                observer.disconnect();
                if (this.autoResizer === observer) this.autoResizer = null;
            });
        }
        // Seed scale margins from constructor options.
        if (opts.rightPriceScale?.scaleMargins) {
            const sm = opts.rightPriceScale.scaleMargins;
            this.model.mainPane.priceScale('right').setMargins(sm);
        }
        if (opts.leftPriceScale?.scaleMargins) {
            const sm = opts.leftPriceScale.scaleMargins;
            this.model.mainPane.priceScale('left').setMargins(sm);
        }
    }

    // ---- public-ish (IChartApi) -------------------------------------
    addPane(options: PaneOptions = {}): PaneApi {
        const model = this.model.addPane(options);
        const api = new PaneApi(this, model);
        this.paneApis.set(model.id, api);
        this.recomputeAxisPads();
        this.recomputePaneLayout();
        this.scheduleDraw(RenderDirty.Layout);
        return api;
    }
    panes(): readonly PaneApi[] {
        return this.model.panes.map((pane) => this.paneApiFor(pane));
    }
    removePane(pane: IPaneApi): void {
        const model = this.resolvePane(pane);
        const removed = this.model.removePane(model);
        for (const series of removed) {
            series.chart = null;
            series.pane = null;
        }
        this.paneApis.delete(model.id);
        if (this.activePane === model) this.activePane = this.model.mainPane;
        if (this.gesturePane === model) this.gesturePane = null;
        this.recomputeAxisPads();
        this.recomputePaneLayout();
        this.onDataChanged();
    }
    addSeries<TData extends TimedSeriesData, TOptions extends SeriesOptions = SeriesOptions>(
        def: SeriesDefinition<TData, TOptions>,
        options?: Partial<TOptions>,
        pane?: IPaneApi,
    ): ISeriesApi<TData, TOptions>;
    addSeries(def: SeriesDefinition<any, any>, options: SeriesOptions = {}, pane?: IPaneApi): Series {
        const target = pane === undefined ? this.model.mainPane : this.resolvePane(pane);
        const resolved = seriesRendererRegistry.resolve(def) as CustomSeriesDefinition<AnyPoint, SeriesOptions>;
        const s = new Series(resolved, { ...resolved.defaultOptions, ...options });
        s.chart = this;
        s.pane = target;
        this.model.addSeries(s, target);
        // Reserve gutters only for scales that actually carry a series, so
        // a left-scale-only pane (equity overlay) doesn't paint an empty
        // 0..1 right axis.
        this.recomputeAxisPads();
        this.onDataChanged();
        return s;
    }
    removeSeries(series: ISeriesApi): void {
        const s = series as Series;
        if (!this.model.removeSeries(s)) return;
        s.chart = null;
        s.pane = null;
        this.recomputeAxisPads();
        this.onDataChanged();
    }
    private hasScale(id: string): boolean {
        return this.activeSeries.some((s) => s.priceScaleId() === id);
    }
    private hasAnyScale(id: string): boolean { return this.series.some((s) => s.priceScaleId() === id); }
    private recomputeAxisPads(): void {
        this.padLeft = this.hasAnyScale('left') ? 56 : 0;
        this.padR = this.hasAnyScale('right') ? 64 : 8;
    }
    private paneApiFor(pane: PaneModel<Series>): PaneApi {
        const api = this.paneApis.get(pane.id);
        if (api === undefined) throw new Error(`sschart: pane '${pane.id}' is not available`);
        return api;
    }
    private resolvePane(pane: IPaneApi): PaneModel<Series> {
        if (!(pane instanceof PaneApi)) throw new Error('sschart: invalid pane handle');
        const owned = this.paneApis.get(pane.id());
        if (owned !== pane) throw new Error('sschart: pane does not belong to this chart');
        return pane.model;
    }
    applyPaneOptions(pane: PaneApi, options: Omit<PaneOptions, 'id'>): void {
        const model = this.resolvePane(pane);
        if (options.state === 'maximized') {
            for (const sibling of this.model.panes) {
                if (sibling !== model && sibling.state === 'maximized') sibling.state = 'normal';
            }
        }
        model.applyOptions(options);
        this.recomputePaneLayout();
        this.scheduleDraw(RenderDirty.Layout);
    }
    paneSize(pane: PaneApi): PaneSize {
        const model = this.resolvePane(pane);
        const rect = this.paneLayoutResult.panes.find((item) => item.paneId === model.id);
        return rect === undefined
            ? { width: this.width, height: 0, top: 0 }
            : { width: rect.width, height: rect.height, top: rect.y };
    }
    timeScale(): TimeScaleApi { return this.tsApi; }
    // Per-scale margins (PriceScaleApi accessor). Defaults to {0,0}.
    getScaleMargins(scaleId: string, pane: PaneModel<Series> | null = null): { top: number; bottom: number } {
        return { ...(pane ?? this.model.mainPane).priceScale(scaleId).margins };
    }
    setScaleMargins(scaleId: string, m: { top: number; bottom: number }, pane: PaneModel<Series> | null = null): void {
        (pane ?? this.model.mainPane).priceScale(scaleId).setMargins(m);
        this.scheduleDraw();
    }
    // Freeze / unfreeze the price range for a scale (PriceScaleApi.applyOptions({autoScale})).
    // Disabling captures the current fully-computed bounds and pins them; enabling resumes auto-fit.
    setAutoScale(scaleId: string, enabled: boolean, pane: PaneModel<Series> | null = null): void {
        const target = pane ?? this.model.mainPane;
        const scale = target.priceScale(scaleId);
        if (enabled) {
            scale.frozenRange = null;
        } else if (scale.frozenRange === null) {
            // priceBounds() checks the frozen map first, but it is still empty here, so this
            // computes fresh bounds — exactly what we want to pin.
            scale.frozenRange = this.priceBounds(scaleId, target);
        }
        this.scheduleDraw();
    }
    getScaleMode(scaleId: string, pane: PaneModel<Series> | null = null): PriceScaleModeValue {
        return (pane ?? this.activePane).priceScale(scaleId).mode as PriceScaleModeValue;
    }
    setScaleMode(scaleId: string, mode: PriceScaleModeValue, pane: PaneModel<Series> | null = null): void {
        (pane ?? this.model.mainPane).priceScale(scaleId).setMode(mode);
        this.scheduleDraw();
    }
    subscribeClick(cb: ClickListener): void { this.clickListeners.push(cb); }
    unsubscribeClick(cb: ClickListener): void { this.clickListeners = this.clickListeners.filter((x) => x !== cb); }

    // Enable order-placement mode: while `modifier` (ctrl/shift/alt) is held over the plot the chart
    // shows a neutral preview price line (its own colour/title) tracking the cursor, and on the click
    // it emits an OrderPlace signal (subscribeOrderPlace). The chart owns the mode and the preview;
    // the host owns the order. Pass null to disable.
    setOrderPlacement(opts: OrderPlacementOptions | null): void {
        this.placement = opts ? { modifier: opts.modifier ?? 'ctrl', color: opts.color ?? '#ffb74d', title: opts.title ?? '⊕ ORDER' } : null;
        if (!this.placement) this.clearPlacementPreview();
        this.scheduleDraw();
    }
    // Catch the order-place signal (see OrderPlace). Fires on a click in placement mode; the host
    // forms the order from it.
    subscribeOrderPlace(cb: OrderPlaceListener): void { this.orderPlaceListeners.push(cb); }
    unsubscribeOrderPlace(cb: OrderPlaceListener): void { this.orderPlaceListeners = this.orderPlaceListeners.filter((x) => x !== cb); }
    // The order price line currently being dragged, or null when no line drag is in progress. A host
    // uses this to skip repainting that line from canonical order data mid-drag — while a drag is
    // live the line's price is the user's preview, not the server's value, until they release and
    // onDragCommit fires.
    draggingLine(): IPriceLine | null { return this.lineDrag?.line ?? null; }
    private modifierMatches(e: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean }): boolean {
        switch (this.placement?.modifier) {
            case 'ctrl': return !!e.ctrlKey;
            case 'shift': return !!e.shiftKey;
            case 'alt': return !!e.altKey;
            default: return false;
        }
    }
    private mainSeries(pane: PaneModel<Series> = this.model.mainPane): Series | null {
        return pane.series.find((s) => s.priceScaleId() === 'right') ?? pane.series[0] ?? null;
    }
    private updatePlacementPreview(): void {
        const placement = this.placement;
        const ok = placement !== null && this.modifierHeld && this.lineDrag === null &&
            this.mouseX !== null && this.mouseY !== null &&
            !this.inTimeGutter(this.mouseY) && !this.inPriceGutter(this.mouseX);
        const pane = this.mouseY === null ? this.model.mainPane : (this.paneAt(this.mouseY) ?? this.model.mainPane);
        const s = this.mainSeries(pane);
        if (!ok || placement === null || s === null) { this.clearPlacementPreview(); return; }
        const p = this.yToPrice(this.mouseY as number, s.priceScaleId(), pane, s);
        if (p === null) { this.clearPlacementPreview(); return; }
        const color = placement.color;
        const title = placement.title + ' @ ' + this.fmtPrice(p, s.opts.priceFormat);
        if (this.placementLine === null) {
            try { s.priceScale().applyOptions({ autoScale: false }); } catch { /* */ }
            this.placementLine = s.createPriceLine({ price: p, color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, anchored: true, title });
        } else {
            this.placementLine.applyOptions({ price: p, color, title });
        }
        this.canvas.style.cursor = 'crosshair';
    }
    private clearPlacementPreview(): void {
        if (this.placementLine === null) return;
        const s = this.placementLine instanceof PriceLine
            ? this.series.find((series) => series.priceLines.includes(this.placementLine as PriceLine)) ?? null
            : this.mainSeries();
        try { s?.removePriceLine(this.placementLine); } catch { /* */ }
        try { s?.priceScale().applyOptions({ autoScale: true }); } catch { /* */ }
        this.placementLine = null;
        if (this.canvas.style.cursor === 'crosshair') this.canvas.style.cursor = '';
    }
    subscribeCrosshairMove(cb: CrosshairListener): void { this.crosshairListeners.push(cb); }
    unsubscribeCrosshairMove(cb: CrosshairListener): void {
        this.crosshairListeners = this.crosshairListeners.filter((x) => x !== cb);
    }
    setCrosshairPosition(position: CrosshairPosition): void {
        if (!Number.isFinite(position.time))
            throw new RangeError('sschart: crosshair time must be a finite UNIX timestamp');
        if (position.price !== undefined && !Number.isFinite(position.price))
            throw new RangeError('sschart: crosshair price must be finite');

        const series = position.series === undefined ? null : position.series as Series;
        if (series !== null && (!(series instanceof Series) || series.chart !== this))
            throw new Error('sschart: crosshair series does not belong to this chart');
        const explicitPane = position.pane === undefined ? null : this.resolvePane(position.pane);
        if (series !== null && series.pane !== null && explicitPane !== null && series.pane !== explicitPane)
            throw new Error('sschart: crosshair pane and series refer to different panes');
        const pane = explicitPane ?? series?.pane ?? this.model.mainPane;
        const rect = this.paneRect(pane);
        if (rect === undefined) throw new Error(`sschart: pane '${pane.id}' is not visible`);
        this.activatePane(pane, rect);

        const x = this.timeToX(position.time);
        const coordinateSeries = series ?? this.mainSeries(pane);
        const y = position.price === undefined
            ? (this.plotT() + this.plotB()) / 2
            : this.priceToY(position.price, coordinateSeries?.priceScaleId() ?? 'right', pane, coordinateSeries ?? undefined);
        if (y === null) throw new Error('sschart: crosshair price cannot be mapped to the selected pane');
        this.mouseX = x;
        this.mouseY = y;
        this.controlledCrosshairTime = position.time;
        this.emitCrosshair(null);
        this.scheduleDraw(RenderDirty.Overlay);
    }
    clearCrosshairPosition(): void {
        this.controlledCrosshairTime = null;
        this.mouseX = null;
        this.mouseY = null;
        this.clearPlacementPreview();
        this.emitCrosshair(null);
        this.scheduleDraw(RenderDirty.Overlay);
    }
    applyOptions(patch: ChartOptions): void {
        Object.assign(this.opts, patch);
        // Toggling time-axis visibility must re-reserve (or free) its vertical strip so the axis
        // actually appears/disappears — not just flip a flag with no layout room for it.
        if (patch.timeScale) {
            this.recomputeTimeAxisPad();
            this.recomputePaneLayout();
        }
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
        this.scheduleDraw(RenderDirty.All);
    }
    resize(width: number, height: number): void {
        if (width < 2 || height < 2) return;
        this.applySize(width, height);
        this.scheduleDraw(RenderDirty.Layout);
    }
    remove(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.disposables.dispose();
        this.root.remove();
        this.rangeListeners = [];
        this.logicalRangeListeners = [];
        this.crosshairListeners = [];
        this.clickListeners = [];
        this.orderPlaceListeners = [];
        this._closeHits = [];
        for (const series of this.series) {
            series.chart = null;
            series.pane = null;
            this.model.removeSeries(series);
        }
        this.paneApis.clear();
    }
    // Snapshot of the current frame as an HTMLCanvasElement (lwc parity).
    // Caller typically converts via .toDataURL('image/png') for export.
    takeScreenshot(): HTMLCanvasElement {
        const out = document.createElement('canvas');
        out.width = this.canvas.width;
        out.height = this.canvas.height;
        const c = out.getContext('2d');
        if (c !== null) {
            c.drawImage(this.baseCanvas, 0, 0);
            c.drawImage(this.canvas, 0, 0);
        }
        return out;
    }

    // ---- internal ---------------------------------------------------
    private applySize(w: number, h: number): void {
        this.width = w;
        this.height = h;
        this.dpr = window.devicePixelRatio || 1;
        this.root.style.width = `${w}px`;
        this.root.style.height = `${h}px`;
        for (const canvas of [this.baseCanvas, this.canvas]) {
            canvas.width = Math.round(w * this.dpr);
            canvas.height = Math.round(h * this.dpr);
            canvas.style.width = `${w}px`;
            canvas.style.height = `${h}px`;
        }
        this.baseCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        this.overlayCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        this.recomputeTimeAxisPad();
        this.recomputePaneLayout();
    }

    // Reserve room for the time axis only when it is visible. Bidirectional on purpose: toggling
    // timeScale.visible at runtime (the sub-pane stack hands the axis between charts on add/remove)
    // must both HIDE and RESTORE the strip. The old one-way latch only ever shrank padB, so once a
    // pane was created hidden it never got its axis room back, and the main chart never got it back
    // after the last sub-pane was removed.
    private recomputeTimeAxisPad(): void {
        this.padB = this.opts.timeScale?.visible === false ? 4 : 22;
    }

    private recomputePaneLayout(): void {
        this.paneLayoutResult = this.paneLayout.compute(
            this.width,
            Math.max(0, this.height - this.padB),
            this.model.panes,
        );
        const activeRect = this.paneLayoutResult.panes.find((rect) => rect.paneId === this.activePane.id);
        if (activeRect !== undefined) this.activePaneRect = activeRect;
        else {
            const first = this.paneLayoutResult.panes[0];
            if (first !== undefined) {
                this.activePane = this.model.paneById(first.paneId) ?? this.model.mainPane;
                this.activePaneRect = first;
            }
        }
    }

    onDataChanged(_change?: DataChangeSet): void {
        let lo = Infinity;
        let hi = -Infinity;
        for (const s of this.series) {
            if (s.points.length === 0 || !s.affectsTimeScale) continue;
            const t0 = s.points[0].time;
            const t1 = s.points[s.points.length - 1].time;
            if (!Number.isFinite(t0) || !Number.isFinite(t1)) continue;
            lo = Math.min(lo, t0);
            hi = Math.max(hi, t1);
        }
        if (Number.isFinite(lo) && Number.isFinite(hi) && hi > lo) {
            this.model.timeScale.updateDataRange(lo, hi);
        }
        this.scheduleDraw();
    }

    fitContent(): void {
        this.model.timeScale.fitContent();
        for (const pane of this.model.panes) pane.priceZoom = 1;
        this.emitRange();
        this.scheduleDraw();
    }
    // Pin the right edge to the newest data, keeping the current view width
    // (plus a small right gap). onDataChanged deliberately leaves a panned
    // view alone, so a realtime feed opts into following the tape by calling
    // this after each append.
    scrollToRealTime(): void {
        if (!this.model.timeScale.scrollToRealTime()) return;
        this.emitRange();
        this.scheduleDraw();
    }
    // Chart-level price-scale handle by id (mirrors Series.priceScale() but lets
    // callers address a scale — e.g. 'right' — without holding a series). Used by
    // indicator renderers to set an oscillator pane's scaleMargins.
    priceScale(scaleId: string = 'right'): PriceScaleApi {
        return new PriceScaleApi(this, scaleId, this.model.mainPane);
    }
    getVisibleRange(): { from: Time; to: Time } | null {
        return this.model.timeScale.visibleRange;
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
        this.model.timeScale.clampVisibleRange(nf, nt);
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
            if (!s.affectsTimeScale) continue;
            if (s.points.length === 0) continue;
            if (best === null || s.points.length > best.points.length) best = s;
        }
        return best;
    }
    // Map a unix time to a fractional bar index relative to the
    // reference series. Linear interpolation between adjacent bars;
    // extrapolation past the edges uses the nearest-bar spacing.
    timeToLogical(t: Time): number | null {
        const s = this.indexRefSeries();
        if (s === null) return null;
        const d = s.points;
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
        const d = s.points;
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

    seriesDataByLogicalIndex(
        series: Series,
        logicalIndex: number,
        mismatchDirection: MismatchDirectionValue,
    ): AnyPoint | null {
        const time = this.logicalToTime(logicalIndex);
        if (time === null) return null;
        const exact = series.store.pointAtTime(time);
        if (exact !== null || mismatchDirection === MismatchDirection.None) return exact;
        const right = series.store.lowerBound(time);
        if (mismatchDirection === MismatchDirection.NearestLeft)
            return series.store.dataByIndex(right - 1, MismatchDirection.None);
        return series.store.dataByIndex(right, MismatchDirection.None);
    }

    seriesBarsInLogicalRange(series: Series, range: LogicalRange): BarsInfo | null {
        const fromTime = this.logicalToTime(range.from);
        const toTime = this.logicalToTime(range.to);
        if (fromTime === null || toTime === null || series.store.length === 0) return null;
        const fromIndex = series.store.lowerBound(fromTime);
        const exclusiveTo = series.store.upperBound(toTime);
        if (fromIndex >= exclusiveTo || fromIndex >= series.store.length) return null;
        const toIndex = exclusiveTo - 1;
        const from = series.store.dataByIndex(fromIndex);
        const to = series.store.dataByIndex(toIndex);
        if (from === null || to === null) return null;
        return {
            barsBefore: fromIndex,
            barsAfter: series.store.length - 1 - toIndex,
            from: from.time,
            to: to.time,
        };
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

    scheduleDraw(dirty: RenderDirtyFlags = RenderDirty.All): void {
        if (!this.disposed) this.renderScheduler.invalidate(dirty);
    }

    private listen<TEvent extends Event>(
        target: EventTarget,
        type: string,
        listener: (event: TEvent) => void,
        options?: boolean | AddEventListenerOptions,
    ): void {
        this.disposables.listen(target, type, listener, options);
    }

    // ---- geometry ---------------------------------------------------
    private plotL(): number { return this.padL + this.padLeft; }
    private plotR(): number { return this.width - this.padR; }
    private plotW(): number { return Math.max(1, this.plotR() - this.plotL()); }
    private plotT(): number { return this.activePaneRect.y + this.padT; }
    private plotB(): number { return this.activePaneRect.y + this.activePaneRect.height; }
    private plotH(): number { return Math.max(1, this.plotB() - this.plotT()); }

    private activatePane(pane: PaneModel<Series>, rect?: PaneLayoutRect): void {
        const nextRect = rect ?? this.paneLayoutResult.panes.find((item) => item.paneId === pane.id);
        if (nextRect === undefined) return;
        this.activePane = pane;
        this.activePaneRect = nextRect;
    }

    private paneAt(y: number): PaneModel<Series> | null {
        const rect = this.paneLayoutResult.panes.find((item) => y >= item.y && y <= item.y + item.height);
        return rect === undefined ? null : (this.model.paneById(rect.paneId) ?? null);
    }

    private paneRect(pane: PaneModel<Series>): PaneLayoutRect | undefined {
        return this.paneLayoutResult.panes.find((item) => item.paneId === pane.id);
    }

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
    private priceBounds(
        scaleId: string,
        pane: PaneModel<Series> = this.activePane,
    ): ScaleBounds {
        // Autoscale disabled: return the pinned range so live data / view changes cannot shift the
        // price<->pixel mapping (used by hosts to keep a drag WYSIWYG).
        const scale = pane.priceScale(scaleId);
        if (scale.frozenRange !== null) return scale.frozenRange as ScaleBounds;

        const mode = this.getScaleMode(scaleId, pane);
        const candidates = pane.series.filter((series) => series.priceScaleId() === scaleId);
        const baseValues = new Map<Series, number>();
        let baseValue = 1;
        let hasBaseValue = false;
        let min = Infinity;
        let max = -Infinity;
        const accumulate = (visibleOnly: boolean): void => {
            for (const series of candidates) {
                const render = series.renderData();
                const points = visibleOnly
                    ? render.store.visibleRange(this.viewFrom, this.viewTo).points
                    : render.store.values;
                const range = visibleOnly
                    ? this.scanSeriesRange(series, points)
                    : this.fullSeriesRange(series);
                if (!Number.isFinite(range.min) || !Number.isFinite(range.max)) continue;

                let reference = 1;
                if (isRelativePriceScale(mode)) {
                    reference = this.referencePrice(series, points)
                        ?? this.referencePrice(series, render.store.values)
                        ?? NaN;
                    if (!Number.isFinite(reference) || reference === 0) continue;
                    baseValues.set(series, reference);
                    if (!hasBaseValue) {
                        baseValue = reference;
                        hasBaseValue = true;
                    }
                }

                let rawMin = range.min;
                let rawMax = range.max;
                if (mode === PriceScaleMode.Logarithmic) {
                    if (!(rawMax > 0)) continue;
                    if (!(rawMin > 0)) rawMin = Math.max(1e-9, rawMax * 1e-6);
                }
                const first = priceToScale(rawMin, mode, reference);
                const last = priceToScale(rawMax, mode, reference);
                if (!Number.isFinite(first) || !Number.isFinite(last)) continue;
                min = Math.min(min, first, last);
                max = Math.max(max, first, last);
            }
        };

        accumulate(true);
        // Fallback: no points fell inside the visible time window — e.g. an
        // ordinal-axis sub-pane whose view is tracked in bar-index space, where
        // a raw-time filter matches nothing. Scale to all data on this axis so
        // the series stays visible instead of collapsing to a default [0,1].
        if (!Number.isFinite(min) || !Number.isFinite(max)) {
            min = Infinity;
            max = -Infinity;
            baseValues.clear();
            hasBaseValue = false;
            baseValue = 1;
            accumulate(false);
        }
        if (!Number.isFinite(min) || !Number.isFinite(max)) {
            const fallback = mode === PriceScaleMode.Percentage
                ? { min: -1, max: 1 }
                : mode === PriceScaleMode.IndexedTo100
                    ? { min: 99, max: 101 }
                    : { min: 0, max: 1 };
            return { ...fallback, mode, baseValue, baseValues };
        }
        if (min === max) {
            const half = Math.max(1, Math.abs(min) * 0.01);
            min -= half;
            max += half;
        }
        const pad = (max - min) * 0.08;
        let lo = min - pad;
        let hi = max + pad;
        // Manual vertical stretch: shrink/grow the range around its
        // centre (priceZoom>1 → smaller range → data drawn taller).
        if (pane.priceZoom !== 1) {
            const c = (lo + hi) / 2;
            const half = (hi - lo) / 2 / pane.priceZoom;
            lo = c - half;
            hi = c + half;
        }
        // Apply scaleMargins: expand the virtual range so the data occupies
        // only (1 - top - bottom) of the plot. Used for volume overlays
        // (top:0.85 → bars hug the bottom 15%) and similar.
        const m = scale.margins;
        if (m.top > 0 || m.bottom > 0) {
            const denom = 1 - m.top - m.bottom;
            if (denom > 0.05) {
                const span = hi - lo;
                hi = hi + span * m.top    / denom;
                lo = lo - span * m.bottom / denom;
            }
        }
        return { min: lo, max: hi, mode, baseValue, baseValues };
    }

    private referencePrice(series: Series, points: readonly AnyPoint[]): number | null {
        const priceValue = series.definition.renderer.priceValue;
        if (priceValue === undefined) return null;
        for (const point of points) {
            const value = priceValue(point, series.opts);
            if (value !== null && Number.isFinite(value) && value > 0) return value;
        }
        return null;
    }

    private fullSeriesRange(series: Series): { min: number; max: number } {
        const render = series.renderData();
        const key = `${render.key}:${num(series.opts.base, 0)}`;
        const cached = this.fullRangeCache.get(series);
        if (cached?.key === key) return cached;
        const range = this.scanSeriesRange(series, render.store.values);
        const result = { key, ...range };
        this.fullRangeCache.set(series, result);
        return result;
    }

    private scanSeriesRange(
        series: Series,
        points: readonly AnyPoint[],
    ): { min: number; max: number } {
        const range = series.definition.renderer.priceRange?.(points, series.opts) ?? null;
        return range ?? { min: Infinity, max: -Infinity };
    }
    private scaleBase(bounds: ScaleBounds, series?: Series): number {
        return series === undefined ? bounds.baseValue : (bounds.baseValues.get(series) ?? bounds.baseValue);
    }
    private valueToDomain(value: number, bounds: ScaleBounds, series?: Series): number {
        return priceToScale(value, bounds.mode, this.scaleBase(bounds, series));
    }
    private domainToValue(value: number, bounds: ScaleBounds, series?: Series): number {
        return scaleToPrice(value, bounds.mode, this.scaleBase(bounds, series));
    }
    private domainToY(value: number, bounds: ScaleBounds): number {
        const span = bounds.max - bounds.min || 1;
        return this.plotB() - ((value - bounds.min) / span) * this.plotH();
    }
    private yToDomain(y: number, bounds: ScaleBounds): number {
        const span = bounds.max - bounds.min || 1;
        return bounds.min + ((this.plotB() - y) / this.plotH()) * span;
    }
    private valueToY(value: number, bounds: ScaleBounds, series?: Series): number {
        const scaled = this.valueToDomain(value, bounds, series);
        if (!Number.isFinite(scaled)) return this.plotB();
        return this.domainToY(scaled, bounds);
    }
    private yToValue(y: number, bounds: ScaleBounds, series?: Series): number {
        return this.domainToValue(this.yToDomain(y, bounds), bounds, series);
    }
    private visiblePriceRange(bounds: ScaleBounds, series: Series): { min: number; max: number } {
        const first = this.domainToValue(bounds.min, bounds, series);
        const last = this.domainToValue(bounds.max, bounds, series);
        return { min: Math.min(first, last), max: Math.max(first, last) };
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
    private fmtScaleValue(value: number, bounds: ScaleBounds, fmt?: PriceFormat): string {
        if (bounds.mode === PriceScaleMode.Percentage) return `${value.toFixed(2)}%`;
        if (bounds.mode === PriceScaleMode.IndexedTo100) return value.toFixed(2);
        return this.fmtPrice(this.domainToValue(value, bounds), fmt);
    }
    // Find the primary right-scale series — used by axis ticks /
    // cursor pill (price-without-series). Falls back to "no format".
    private primaryFormat(scaleId: string = 'right'): PriceFormat | undefined {
        for (const s of this.activeSeries) {
            if (s.priceScaleId() !== scaleId) continue;
            const data = s.renderData().store.values;
            const point = data[data.length - 1];
            if (point === undefined || this.seriesPriceValue(s, point) === null) continue;
            if (s.opts.priceFormat !== undefined) return s.opts.priceFormat;
        }
        return undefined;
    }
    // Public price ↔ pixel for the named price scale ('right' default,
    // 'left' for the equity overlay). Used by external order overlays.
    priceToY(
        price: number,
        scaleId: string = 'right',
        pane: PaneModel<Series> | null = null,
        series?: Series,
    ): number | null {
        const target = pane ?? this.model.mainPane;
        const rect = this.paneRect(target);
        if (rect === undefined) return null;
        this.activatePane(target, rect);
        const b = this.priceBounds(scaleId, target);
        if (!Number.isFinite(b.min) || !Number.isFinite(b.max)) return null;
        return this.valueToY(price, b, series);
    }
    yToPrice(
        y: number,
        scaleId: string = 'right',
        pane: PaneModel<Series> | null = null,
        series?: Series,
    ): number | null {
        const target = pane ?? this.model.mainPane;
        const rect = this.paneRect(target);
        if (rect === undefined) return null;
        this.activatePane(target, rect);
        const b = this.priceBounds(scaleId, target);
        if (!Number.isFinite(b.min) || !Number.isFinite(b.max)) return null;
        return this.yToValue(y, b, series);
    }

    // ---- drawing ----------------------------------------------------
    private draw(requested: RenderDirtyFlags): void {
        const dirty = (requested & RenderDirty.Layout) !== 0 ? RenderDirty.All : requested;
        const redrawBase = (dirty & (RenderDirty.Base | RenderDirty.Axes)) !== 0;
        if (redrawBase) this.drawBase();
        if (redrawBase || (dirty & RenderDirty.Overlay) !== 0) this.drawOverlay();
    }

    private drawBase(): void {
        const ctx = this.baseCtx;
        this.ctx = ctx;
        const lay = this.opts.layout ?? {};
        ctx.clearRect(0, 0, this.width, this.height);
        ctx.fillStyle = lay.background?.color ?? DEF_LAYOUT_BG;
        ctx.fillRect(0, 0, this.width, this.height);

        // Auto-fit right gutter to the widest PRICE label (the price
        // pill lives in the gutter; the title pill lives on the plot).
        if (this.hasAnyScale('right')) {
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

        const visible = this.paneLayoutResult.panes;
        for (let index = 0; index < visible.length; index++) {
            const rect = visible[index];
            const pane = this.model.paneById(rect.paneId);
            if (pane === undefined) continue;
            this.activatePane(pane, rect);
            const last = index === visible.length - 1;
            ctx.save();
            ctx.beginPath();
            ctx.rect(rect.x, rect.y, rect.width, rect.height + (last ? this.padB : 0));
            ctx.clip();

            const hasRight = this.hasScale('right');
            const hasLeft = this.hasScale('left');
            const rb = this.priceBounds('right', pane);
            const lb = hasLeft ? this.priceBounds('left', pane) : rb;
            const primary = hasRight ? rb : lb;

            if (pane === this.model.mainPane) this.drawWatermark();
            this.drawGrid(primary);
            for (const s of pane.series) {
                // Draw each series against bounds of ITS OWN scale. Overlay
                // scales remain independent inside their owning pane.
                const sid = s.priceScaleId();
                const sb = sid === 'right'
                    ? rb
                    : (sid === 'left' && hasLeft ? lb : this.priceBounds(sid, pane));
                this.drawSeries(s, sb);
            }
            this.drawMarkers(rb, lb);
            this.drawAxes(hasRight ? rb : null, hasLeft ? lb : null, last);
            this.drawPriceTags(rb, lb);
            ctx.restore();
        }

        ctx.fillStyle = this.opts.rightPriceScale?.borderColor ?? DEF_BORDER;
        for (const splitter of this.paneLayoutResult.splitters) {
            const y = Math.round(splitter.rect.y + splitter.rect.height / 2) + 0.5;
            ctx.fillRect(splitter.rect.x, y, splitter.rect.width, 1);
        }
        this.activatePane(this.model.mainPane);
    }

    private drawOverlay(): void {
        const ctx = this.overlayCtx;
        this.ctx = ctx;
        ctx.clearRect(0, 0, this.width, this.height);
        this._closeHits = [];
        const visible = this.paneLayoutResult.panes;
        for (let index = 0; index < visible.length; index++) {
            const rect = visible[index];
            const pane = this.model.paneById(rect.paneId);
            if (pane === undefined) continue;
            this.activatePane(pane, rect);
            const last = index === visible.length - 1;
            ctx.save();
            ctx.beginPath();
            ctx.rect(rect.x, rect.y, rect.width, rect.height + (last ? this.padB : 0));
            ctx.clip();
            const hasLeft = this.hasScale('left');
            const rb = this.priceBounds('right', pane);
            const lb = hasLeft ? this.priceBounds('left', pane) : rb;
            // Interactive price lines and the shared crosshair are rendered
            // once per pane against that pane's independent price scale.
            this.drawPriceLines(rb, lb);
            this.drawCrosshair(rb, lb, last);
            this.drawClusterTip(rb, lb);
            ctx.restore();
        }
        this.activatePane(this.model.mainPane);
        this.ctx = this.baseCtx;
    }

    // Horizontal lines (orders / alerts / preview-on-Ctrl). The LINE
    // stays at the true price; the LABEL slides along the axis with
    // collision avoidance + eased animation, so dragging one label
    // through another pushes it out of the way (industry-standard behaviour).
    private drawPriceLines(rb: ScaleBounds, lb: ScaleBounds): void {
        const ctx = this.ctx;
        const lay = this.opts.layout ?? {};
        const font = `11px ${lay.fontFamily ?? DEF_FONT}`;
        const labelH = 18;
        const labelGap = 1;                  // extra spacing between adjacent labels
        const slot = labelH + labelGap;

        // Pass 1 — collect drawables with their natural y per scale.
        interface Item {
            pl: PriceLine; s: Series; o: PriceLineOptions;
            yLine: number; yLabelNatural: number; b: ScaleBounds;
        }
        const items: Item[] = [];
        for (const s of this.activeSeries) {
            if (s.priceLines.length === 0) continue;
            const b = s.priceScaleId() === 'left' ? lb : rb;
            for (const pl of s.priceLines) {
                const o = pl.raw();
                if (o.lineVisible === false) continue;
                if (!Number.isFinite(o.price)) continue;
                // Pin the line to the SAME bounds the label is kept within (a half-label-height in
                // from each edge). Otherwise, near an edge, the label stays fully visible while the
                // line runs to the very edge — so the line ends up above/below its label. Clamping
                // both identically keeps line and label together; the label text still shows the
                // true price. In-range lines are unaffected.
                const yNat = Math.max(this.plotT() + labelH / 2,
                    Math.min(this.plotB() - labelH / 2, this.valueToY(o.price, b, s)));
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

        // Pass 3 — ease the collision OFFSET (target minus the line's own y), not the absolute y.
        // The label therefore follows its own line 1:1 when the line moves (zoom / axis stretch /
        // scroll / drag) with no lag, and only the sideways spread that resolves overlaps animates.
        // Anchored labels and the first frame snap outright.
        let stillMoving = false;
        for (let i = 0; i < items.length; i++) {
            const pl = items[i].pl;
            const targetOffset = targets[i] - items[i].yLine;
            if (pl.labelOffset === null || anchored[i]) {
                pl.labelOffset = targetOffset;
            } else {
                const d = targetOffset - pl.labelOffset;
                if (Math.abs(d) < 0.5) pl.labelOffset = targetOffset;
                else { pl.labelOffset += d * 0.28; stillMoving = true; }
            }
            pl.displayY = items[i].yLine + pl.labelOffset;
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
            const priceText = showLabels && Number.isFinite(o.price)
                ? this.fmtScaleValue(this.valueToDomain(o.price, it.b, it.s), it.b, it.s.opts.priceFormat)
                : '';
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
            // "✕" close button, just outside the title pill (left of a right-side
            // label, right of a left-side one). Clicking it fires o.onClose — the
            // terminal wires this to cancel the resting order on that line.
            if (o.onClose && titleText) {
                const closeW = labelH;
                const closeX = onLeft ? (titleX + titleW) : (titleX - closeW);
                ctx.fillStyle = labCol;
                ctx.fillRect(closeX, yLab - labelH / 2, closeW, labelH);
                ctx.fillStyle = txtCol;
                ctx.textAlign = 'center';
                ctx.fillText('✕', closeX + closeW / 2, yLab + 1);
                ctx.textAlign = 'left';
                this._closeHits.push({ x: closeX, y: yLab - labelH / 2, w: closeW, h: labelH, onClose: o.onClose });
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
        if (stillMoving) this.scheduleDraw(RenderDirty.Overlay);
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
    private drawClusterTip(rb: ScaleBounds, lb: ScaleBounds): void {
        if (this.mouseX === null || this.mouseY === null) return;
        if (this.mouseX < this.plotL() || this.mouseX > this.plotR()) return;
        if (this.mouseY < this.plotT() || this.mouseY > this.plotB()) return;
        const cs = this.activeSeries.find((s) => s.kind === 'Cluster');
        if (cs === undefined) return;
        const st = this.crosshairTime(this.mouseX);
        if (st === null) return;
        const p = cs.store.pointAtTime(st) as
            (AnyPoint & { levels?: Array<{ price: number; vol: number }> }) | undefined;
        if (p === undefined || p.levels === undefined || p.levels.length === 0) return;
        const bnd = cs.priceScaleId() === 'left' ? lb : rb;
        let best = p.levels[0];
        let bestD = Infinity;
        for (const l of p.levels) {
            const d = Math.abs(this.valueToY(l.price, bnd, cs) - this.mouseY);
            if (d < bestD) { bestD = d; best = l; }
        }
        if (bestD > 18) return;
        const ctx = this.ctx;
        const txt = `${this.fmtPrice(best.price, cs.opts.priceFormat)}   vol ${best.vol}`;
        ctx.font = `11px ${this.opts.layout?.fontFamily ?? DEF_FONT}`;
        const w = ctx.measureText(txt).width + 14;
        const h = 19;
        let x = this.mouseX + 14;
        let y = this.valueToY(best.price, bnd, cs) - h / 2;
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
        return s.definition.renderer.colorAt?.(p, s.opts)
            ?? s.opts.lineColor ?? s.opts.color ?? '#89b4ff';
    }
    private seriesPriceValue(s: Series, p: AnyPoint): number | null {
        return s.definition.renderer.priceValue?.(p, s.opts) ?? null;
    }
    // Per-series colour tag on the price axis — ALWAYS the rightmost
    // visible value of each series, live during pan/zoom (industry-
    // standard behaviour). Cursor-time values live in the top-left legend; the
    // axis tags must not chase the cursor, otherwise dragging the chart
    // looks frozen until you release.
    private drawPriceTags(rb: ScaleBounds, lb: ScaleBounds): void {
        const ctx = this.ctx;
        ctx.font = `10px ${this.opts.layout?.fontFamily ?? DEF_FONT}`;
        ctx.textBaseline = 'middle';
        for (const s of this.activeSeries) {
            if (s.points.length === 0) continue;
            if (s.opts.lastValueVisible === false) continue;
            // lwc parity: priceLineSource = 'lastBar' (default) shows
            // the absolute last data point; 'lastVisible' tracks the
            // right edge of the visible window (terminal-style).
            let p: AnyPoint;
            const src = s.opts.priceLineSource ?? 'lastVisible';
            if (src === 'lastBar') {
                p = s.points[s.points.length - 1];
            } else {
                const index = s.store.upperBound(this.viewTo) - 1;
                p = s.store.dataByIndex(index) ?? s.points[s.points.length - 1];
            }
            const val = this.seriesPriceValue(s, p);
            if (val === null || !Number.isFinite(val)) continue;
            const b = s.priceScaleId() === 'left' ? lb : rb;
            const y = Math.max(this.plotT() + 7, Math.min(this.plotB() - 7, this.valueToY(val, b, s)));
            const col = this.seriesColor(s, p);
            const txt = this.fmtScaleValue(this.valueToDomain(val, b, s), b, s.opts.priceFormat);
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
    private scaleTicks(bounds: ScaleBounds, count: number): number[] {
        if (bounds.mode !== PriceScaleMode.Logarithmic)
            return this.niceTicks(bounds.min, bounds.max, count);
        const rawMin = scaleToPrice(bounds.min, bounds.mode);
        const rawMax = scaleToPrice(bounds.max, bounds.mode);
        return this.niceTicks(rawMin, rawMax, count)
            .filter((value) => value > 0)
            .map((value) => priceToScale(value, bounds.mode));
    }

    private drawGrid(rb: ScaleBounds): void {
        const ctx = this.ctx;
        const g = this.opts.grid ?? {};
        ctx.lineWidth = 1;
        if (g.horzLines?.visible !== false) {
            ctx.strokeStyle = g.horzLines?.color ?? DEF_GRID;
            for (const v of this.scaleTicks(rb, this.priceTickCount())) {
                const y = Math.round(this.domainToY(v, rb)) + 0.5;
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
        // Use the densest time series. Sparse overlays such as Fractals have
        // only a handful of points across the whole range and must not widen
        // every candle/histogram slot underneath them.
        return calculateBarStepPx(this.series, this.viewTo - this.viewFrom, this.plotW());
    }

    private drawSeries(s: Series, b: ScaleBounds): void {
        const render = s.renderData();
        const visible = render.store.visibleRange(
            this.viewFrom,
            this.viewTo,
            s.definition.renderer.dataPadding ?? 1,
        ).points;
        if (visible.length === 0) return;
        const context: SeriesRendererContext<AnyPoint, SeriesOptions> = {
            target: this.ctx,
            data: visible,
            allData: render.store.values,
            options: s.opts,
            priceRange: this.visiblePriceRange(b, s),
            pane: {
                left: this.plotL(),
                right: this.plotR(),
                top: this.plotT(),
                bottom: this.plotB(),
                width: this.plotW(),
                height: this.plotH(),
            },
            theme: {
                fontFamily: this.opts.layout?.fontFamily ?? DEF_FONT,
                textColor: this.opts.layout?.textColor ?? DEF_TEXT,
                horizontalGridColor: this.opts.grid?.horzLines?.color ?? DEF_GRID,
                verticalGridColor: this.opts.grid?.vertLines?.color ?? DEF_GRID,
            },
            barSpacing: this.barStepPx(),
            metadata: render.metadata,
            timeToCoordinate: (time) => this.timeToX(time),
            priceToCoordinate: (price) => this.valueToY(price, b, s),
        };
        this.ctx.save();
        try { s.definition.renderer.draw(context); }
        finally { this.ctx.restore(); }
    }

    private drawMarkers(rb: ScaleBounds, lb: ScaleBounds): void {
        const ctx = this.ctx;
        ctx.font = `10px ${this.opts.layout?.fontFamily ?? DEF_FONT}`;
        for (const s of this.activeSeries) {
            if (s.markers.length === 0) continue;   // markers on ANY series kind
            const b = s.priceScaleId() === 'left' ? lb : rb;
            const markers = s.markerStore.visibleRange(this.viewFrom, this.viewTo).points;
            for (const m of markers) {
                const p = s.store.pointAtTime(m.time) as AnyPoint | null;
                if (p === null) continue;
                const x = this.timeToX(m.time);
                const anchorV = m.position === 'aboveBar' && Number.isFinite(p.high)
                    ? p.high
                    : m.position === 'belowBar' && Number.isFinite(p.low)
                        ? p.low
                        : this.seriesPriceValue(s, p);
                if (anchorV === null || !Number.isFinite(anchorV)) continue;
                const baseY = this.valueToY(anchorV, b, s);
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
        if (s === null || s.points.length === 0) return { ticks: [], step: 60 };
        const d = s.points;
        const n = d.length;
        const lfRaw = this.timeToLogical(this.viewFrom) ?? 0;
        const ltRaw = this.timeToLogical(this.viewTo) ?? (n - 1);
        // Clamp BOTH ends into [0, n-1]. The visible window can sit fully past
        // either edge (scrolled beyond the data, or a sub-pane whose spine has
        // fewer bars than the logical range synced onto it), which would leave
        // lf/lt out of range and read `.time` of an undefined bar below.
        const lf = Math.min(n - 1, Math.max(0, Math.floor(lfRaw)));
        const lt = Math.min(n - 1, Math.max(lf, Math.ceil(ltRaw)));
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

    private drawAxes(
        rb: ScaleBounds | null,
        lb: ScaleBounds | null,
        drawTimeAxis: boolean,
    ): void {
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
            for (const v of this.scaleTicks(rb, this.priceTickCount())) {
                const y = this.domainToY(v, rb);
                if (y < this.plotT() - 1 || y > this.plotB() + 1) continue;
                ctx.fillText(this.fmtScaleValue(v, rb, rFmt), this.plotR() + 6, y);
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
            for (const v of this.scaleTicks(lb, this.priceTickCount())) {
                const y = this.domainToY(v, lb);
                if (y < this.plotT() - 1 || y > this.plotB() + 1) continue;
                ctx.fillText(this.fmtScaleValue(v, lb, lFmt), this.plotL() - 6, y);
            }
        }

        // time axis
        if (drawTimeAxis && this.opts.timeScale?.visible !== false) {
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

    private drawCrosshair(
        rb: ScaleBounds,
        lb: ScaleBounds,
        showTimeLabel: boolean,
    ): void {
        if (this.mouseX === null || this.mouseY === null) return;
        const ch = this.opts.crosshair ?? {};
        if (this.mouseX < this.plotL() || this.mouseX > this.plotR()) return;
        const ctx = this.ctx;
        const st = this.crosshairTime(this.mouseX);
        // Vertical line snaps to the bar (industry-standard behaviour).
        const vx = st !== null ? this.timeToX(st) : this.mouseX;
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
        if (crossMode === CrosshairMode.Magnet && st !== null) {
            for (const s of this.activeSeries) {
                const magnetValues = s.definition.renderer.magnetValues;
                if (magnetValues === undefined) continue;
                const p = s.renderData().store.pointAtTime(st);
                if (p === null) continue;
                const b = s.priceScaleId() === 'left' ? lb : rb;
                const candidates = magnetValues(p, s.opts);
                let bestY = this.mouseY, bestD = Infinity;
                for (const v of candidates) {
                    if (!Number.isFinite(v)) continue;
                    const y = this.valueToY(v, b, s);
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
        if (st !== null) {
            for (const s of this.activeSeries) {
                const p = s.renderData().store.pointAtTime(st);
                if (p === null) continue;
                const b = s.priceScaleId() === 'left' ? lb : rb;
                const val = this.seriesPriceValue(s, p);
                if (val === null || !Number.isFinite(val)) continue;
                const dx = this.timeToX(st);
                const dy = this.valueToY(val, b, s);
                if (dy < this.plotT() - 2 || dy > this.plotB() + 2) continue;
                const col = this.seriesColor(s, p);
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
        if (showTimeLabel && st !== null && vx >= this.plotL() && vx <= this.plotR()
            && ch.vertLine?.visible !== false)
            pill(this.fmtTime(st), vx, this.plotB() + 11, 'center');
        // Right-axis price pill at the cursor's y. Gated by horzLine.visible
        // so the host can suppress it during an order drag (the order title
        // already shows the live price; this pill would overlap and obscure
        // the colored order label).
        if (crossY >= this.plotT() && crossY <= this.plotB()
            && ch.horzLine?.visible !== false) {
            const scaleValue = this.yToDomain(crossY, rb);
            pill(this.fmtScaleValue(scaleValue, rb, this.primaryFormat('right')),
                this.plotR() + 1, crossY, 'left');
        }
    }

    // ---- pointer / interaction --------------------------------------
    private snapTime(x: number): Time | undefined {
        // Ignore overlays that explicitly opt out of the chart time domain.
        const primary =
            this.series.find((s) => s.affectsTimeScale && s.points.length > 0
                && Number.isFinite(s.points[0].time))
            ?? this.series.find((s) => s.points.length > 0 && Number.isFinite(s.points[0].time));
        if (primary === undefined) return undefined;
        const t = this.xToTime(x);
        return primary.store.nearest(t)?.time;
    }

    private crosshairTime(x: number): Time | null {
        return this.controlledCrosshairTime ?? this.snapTime(x) ?? null;
    }

    private hoveredCrosshairObject(
        pane: PaneModel<Series> | null,
        seriesData: ReadonlyMap<ISeriesApi<any, any>, TimedSeriesData>,
        x: number,
        y: number,
    ): HoveredObject | null {
        if (pane === null || this.inTimeGutter(y) || this.inPriceGutter(x)) return null;
        const lineHit = this.hitPriceLine(y, x, false);
        if (lineHit !== null) {
            return {
                type: 'price-line',
                series: lineHit.series,
                priceLine: lineHit.line,
                id: lineHit.line.raw().id ?? null,
            };
        }

        this.activatePane(pane);
        let closest: SeriesHoveredObject | null = null;
        let closestDistance = 8;
        for (const series of pane.series) {
            const data = seriesData.get(series) as AnyPoint | undefined;
            if (data === undefined) continue;
            const price = this.seriesPriceValue(series, data);
            if (price === null || !Number.isFinite(price)) continue;
            const bounds = this.priceBounds(series.priceScaleId(), pane);
            const distance = Math.abs(this.valueToY(price, bounds, series) - y);
            if (distance <= closestDistance) {
                closestDistance = distance;
                closest = { type: 'series', series, data };
            }
        }
        return closest;
    }

    private crosshairEvent(sourceEvent: PointerEvent | MouseEvent | null): CrosshairEvent {
        if (this.mouseX === null || this.mouseY === null) {
            return {
                time: null,
                logical: null,
                point: null,
                paneId: null,
                seriesData: new Map(),
                hoveredObject: null,
                sourceEvent,
            };
        }
        const time = this.crosshairTime(this.mouseX);
        const pane = this.paneAt(this.mouseY);
        const seriesData = new Map<ISeriesApi<any, any>, TimedSeriesData>();
        if (time !== null) {
            for (const series of this.series) {
                const point = series.renderData().store.pointAtTime(time);
                if (point !== null) seriesData.set(series, point);
            }
        }
        return {
            time,
            logical: time === null ? null : this.timeToLogical(time),
            point: { x: this.mouseX, y: this.mouseY },
            paneId: pane?.id ?? null,
            seriesData,
            hoveredObject: this.hoveredCrosshairObject(pane, seriesData, this.mouseX, this.mouseY),
            sourceEvent,
        };
    }

    private emitCrosshair(sourceEvent: PointerEvent | MouseEvent | null): void {
        const event = this.crosshairEvent(sourceEvent);
        for (const listener of this.crosshairListeners) listener(event);
    }

    private inPriceGutter(x: number): boolean {
        return x >= this.plotR() || (this.padLeft > 0 && x <= this.plotL());
    }
    private inTimeGutter(y: number): boolean {
        return this.opts.timeScale?.visible !== false && y >= this.height - this.padB;
    }

    private splitterAt(x: number, y: number): PaneSplitter | null {
        return this.paneLayout.hitTestSplitter(this.paneLayoutResult, { x, y });
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

    // Nearest price line whose rendered Y is within grab tolerance. The general
    // form feeds crosshair hover metadata; pointer dragging requests draggable lines only.
    private hitPriceLine(
        my: number,
        mx: number,
        draggableOnly: boolean,
    ): { series: Series; line: PriceLine } | null {
        if (this.inTimeGutter(my) || this.inPriceGutter(mx)) return null;
        const pane = this.paneAt(my);
        if (pane === null) return null;
        this.activatePane(pane);
        const TOL = 6;
        let best: { series: Series; line: PriceLine } | null = null;
        let bestDist = TOL;
        for (const s of pane.series) {
            for (const pl of s.priceLines) {
                if (draggableOnly && pl.raw().draggable !== true) continue;
                const raw = this.priceToY(pl.raw().price, s.priceScaleId(), pane, s);
                if (raw === null) continue;
                // Hit-test against the RENDERED y: a line whose price is off-view is pinned to the
                // edge (plotT/plotB ± half a label height), so grab it where it's actually drawn —
                // otherwise an order pinned at the top/bottom can't be picked up until you rescale.
                const y = Math.max(this.plotT() + 9, Math.min(this.plotB() - 9, raw));
                const d = Math.abs(y - my);
                if (d <= bestDist) { bestDist = d; best = { series: s, line: pl }; }
            }
        }
        return best;
    }

    private hitDraggableLine(my: number, mx: number): { series: Series; line: PriceLine } | null {
        return this.hitPriceLine(my, mx, true);
    }

    // True when the cursor is over a price-line "✕" close button. The button is a click target,
    // not a drag handle, so the hover cursor must read as a button (pointer) — never the ns-resize
    // arrow the draggable line itself shows.
    private hitCloseButton(mx: number, my: number): boolean {
        for (const h of this._closeHits) {
            if (mx >= h.x && mx <= h.x + h.w && my >= h.y && my <= h.y + h.h) return true;
        }
        return false;
    }

    private bindPointer(): void {
        this.listen<PointerEvent>(this.canvas, 'pointermove', (e) => {
            const r = this.canvas.getBoundingClientRect();
            this.mouseX = e.clientX - r.left;
            this.mouseY = e.clientY - r.top;
            this.controlledCrosshairTime = null;
            const pointerPane = this.paneAt(this.mouseY);
            if (pointerPane !== null) this.activatePane(pointerPane);
            if (this.splitterDrag !== null) {
                const before = this.model.paneById(this.splitterDrag.splitter.beforePaneId);
                const after = this.model.paneById(this.splitterDrag.splitter.afterPaneId);
                if (before !== undefined && after !== undefined) {
                    before.height = this.splitterDrag.beforeHeight;
                    after.height = this.splitterDrag.afterHeight;
                    this.paneLayout.resizePair(
                        this.model.panes,
                        this.splitterDrag.splitter,
                        this.mouseY - this.splitterDrag.startY,
                    );
                    this.recomputePaneLayout();
                    this.scheduleDraw(RenderDirty.Layout);
                }
                this.canvas.style.cursor = 'row-resize';
                return;
            }
            if (this.lineDrag) {                        // dragging a resting order line: it follows the cursor
                // Clamp to the plot so the line can't be dragged past the visible price range (the
                // pointer keeps sending events off-canvas via capture; without this the price
                // extrapolates beyond the axis and the line/label part ways at the edge).
                const pane = this.lineDrag.series.pane ?? this.model.mainPane;
                this.activatePane(pane);
                const y = Math.max(this.plotT(), Math.min(this.plotB(), this.mouseY));
                const p = this.yToPrice(y, this.lineDrag.series.priceScaleId(), pane, this.lineDrag.series);
                if (p !== null) {
                    this.lineDrag.line.applyOptions({ price: p, anchored: true });
                    const cb = this.lineDrag.line.raw().onDrag;
                    if (cb) { try { cb(p); } catch { /* a host callback must not break the gesture */ } }
                }
                this.scheduleDraw();
                return;
            }
            if (this.priceDragging) {
                const dy = this.mouseY - this.lastDragY;
                this.lastDragY = this.mouseY;
                // drag up → stretch (zoom in), drag down → compress
                const pane = this.gesturePane ?? this.model.mainPane;
                pane.priceZoom = Math.min(12, Math.max(0.15, pane.priceZoom * Math.exp(-dy * 0.006)));
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
            this.canvas.style.cursor = this.splitterAt(this.mouseX, this.mouseY) !== null ? 'row-resize'
                : this.inTimeGutter(this.mouseY) ? 'ew-resize'
                : this.inPriceGutter(this.mouseX) ? 'ns-resize'
                : this.hitCloseButton(this.mouseX, this.mouseY) ? 'pointer'
                : this.hitDraggableLine(this.mouseY, this.mouseX) ? 'ns-resize' : 'default';
            if (this.placement !== null && this.modifierHeld) this.updatePlacementPreview();   // order-placement preview follows the cursor
            let viewChanged = false;
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
                viewChanged = true;
            }
            this.emitCrosshair(e);
            this.scheduleDraw(viewChanged ? RenderDirty.All : RenderDirty.Overlay);
        });
        this.listen<PointerEvent>(this.canvas, 'pointerleave', (e) => {
            this.mouseX = null;
            this.mouseY = null;
            this.controlledCrosshairTime = null;
            this.clearPlacementPreview();   // no cursor over the plot → no placement preview
            this.emitCrosshair(e);
            this.scheduleDraw(RenderDirty.Overlay);
        });
        // Price-line "✕" close buttons: a mousedown landing on one fires its callback and
        // is consumed here, so it neither pans the chart nor bubbles to the host element
        // (whose own mousedown would start a line drag). This uses mousedown — not
        // pointerdown — precisely so stopPropagation blocks the host's mousedown handler.
        this.listen<MouseEvent>(this.canvas, 'mousedown', (e) => {
            const r = this.canvas.getBoundingClientRect();
            const mx = e.clientX - r.left;
            const my = e.clientY - r.top;
            for (const h of this._closeHits) {
                if (mx >= h.x && mx <= h.x + h.w && my >= h.y && my <= h.y + h.h) {
                    e.preventDefault();
                    e.stopPropagation();
                    try { h.onClose(); } catch { /* ignore */ }
                    return;
                }
            }
        });
        this.listen<PointerEvent>(this.canvas, 'pointerdown', (e) => {
            // capture so a finger / mouse leaving the canvas mid-drag
            // keeps sending us pointermove events
            try { (this.canvas as Element).setPointerCapture(e.pointerId); } catch { /* unsupported */ }
            const r = this.canvas.getBoundingClientRect();
            const mx = e.clientX - r.left;
            const my = e.clientY - r.top;
            this.downX = mx; this.downY = my; this.downButton = e.button; this.pointerDown = true;
            this.gesturePane = this.paneAt(my);
            // A press on a "✕" close button is handled by the mousedown listener above — don't drag.
            for (const h of this._closeHits) {
                if (mx >= h.x && mx <= h.x + h.w && my >= h.y && my <= h.y + h.h) return;
            }
            // Only the left button drags/pans; a right (or middle) press is left to become a click
            // (a host maps right-click to "sell here", left to "buy here").
            if (e.button !== 0) return;
            const splitter = this.splitterAt(mx, my);
            if (splitter !== null) {
                const before = this.model.paneById(splitter.beforePaneId);
                const after = this.model.paneById(splitter.afterPaneId);
                if (before !== undefined && after !== undefined) {
                    this.splitterDrag = {
                        splitter,
                        startY: my,
                        beforeHeight: before.height,
                        afterHeight: after.height,
                    };
                    this.canvas.style.cursor = 'row-resize';
                }
                return;
            }
            // Grab a draggable order line before any pan / axis-stretch gesture. Freeze the scale
            // and anchor the label for the whole drag so the line stays WYSIWYG under the cursor.
            const hit = this.hitDraggableLine(my, mx);
            if (hit) {
                this.lineDrag = hit;
                hit.line.applyOptions({ anchored: true });
                try { hit.series.priceScale().applyOptions({ autoScale: false }); } catch { /* */ }
                this.canvas.style.cursor = 'ns-resize';
                return;
            }
            if (this.inTimeGutter(my)) {
                // grab the time axis → horizontal stretch
                this.timeDragging = true;
                this.lastAxisX = mx;
            } else if (this.inPriceGutter(mx)) {
                // grab the price axis → vertical stretch, not a time pan
                if (this.gesturePane !== null) {
                    this.priceDragging = true;
                    this.lastDragY = my;
                }
            } else {
                this.dragging = true;
                this.lastDragX = mx;
            }
        });
        const finishGesture = (e?: PointerEvent): void => {
            if (!this.pointerDown) return;   // ignore releases from a gesture that began off-canvas
            this.pointerDown = false;
            if (this.splitterDrag !== null) {
                this.splitterDrag = null;
                this.gesturePane = null;
                this.canvas.style.cursor = 'default';
                return;
            }
            // Commit an order-line drag: unfreeze the scale, drop the anchor, notify the host.
            if (this.lineDrag) {
                const pane = this.lineDrag.series.pane ?? this.model.mainPane;
                this.activatePane(pane);
                const p = this.mouseY !== null
                    ? this.yToPrice(
                        Math.max(this.plotT(), Math.min(this.plotB(), this.mouseY)),
                        this.lineDrag.series.priceScaleId(),
                        pane,
                        this.lineDrag.series,
                    )
                    : null;
                this.lineDrag.line.applyOptions({ anchored: false });
                try { this.lineDrag.series.priceScale().applyOptions({ autoScale: true }); } catch { /* */ }
                const cb = this.lineDrag.line.raw().onDragCommit;
                if (cb && p !== null) { try { cb(p); } catch { /* */ } }
                this.lineDrag = null;
                this.dragging = false; this.priceDragging = false; this.timeDragging = false;
                this.gesturePane = null;
                return;
            }
            const moved = this.mouseX !== null && this.mouseY !== null &&
                Math.hypot(this.mouseX - this.downX, this.mouseY - this.downY) > 4;
            this.dragging = false; this.priceDragging = false; this.timeDragging = false;
            // A press-release that did not move and did not grab a line is a click (a pan that never
            // moved still counts as a click).
            if (e && !moved && this.mouseX !== null && this.mouseY !== null &&
                !this.inTimeGutter(this.mouseY) && !this.inPriceGutter(this.mouseX)) {
                const pane = this.paneAt(this.mouseY) ?? this.model.mainPane;
                const clickSeries = this.mainSeries(pane);
                const price = this.yToPrice(this.mouseY, 'right', pane, clickSeries ?? undefined);
                if (this.placement !== null && this.modifierMatches(e) && price !== null) {
                    // Placement-mode click → EMIT the order-place signal (the chart does not form the
                    // order). Then drop the preview so it doesn't linger on the just-placed spot.
                    const ev: OrderPlace = {
                        price, button: this.downButton,
                        ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey,
                    };
                    for (const cb of this.orderPlaceListeners) { try { cb(ev); } catch { /* */ } }
                    this.clearPlacementPreview();
                } else if (this.clickListeners.length > 0) {
                    const time = this.snapTime(this.mouseX);
                    const c: ChartClick = {
                        price, time: time ?? null, point: { x: this.mouseX, y: this.mouseY },
                        button: this.downButton,
                        ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey,
                    };
                    for (const cb of this.clickListeners) { try { cb(c); } catch { /* */ } }
                }
            }
            this.gesturePane = null;
        };
        // window (not canvas) so a release off the plot still ends the gesture; the pointerDown
        // guard inside finishGesture keeps unrelated global releases from being processed.
        this.listen<PointerEvent>(window, 'pointerup', (e) => finishGesture(e));
        this.listen(window, 'pointercancel', () => finishGesture());
        // Order-placement mode: pressing/releasing the configured modifier shows/hides the preview
        // (updated on move too), even without moving the mouse. Losing focus cancels it.
        this.listen<KeyboardEvent>(window, 'keydown', (e) => {
            if (this.placement !== null && !this.modifierHeld && this.modifierMatches(e)) { this.modifierHeld = true; this.updatePlacementPreview(); this.scheduleDraw(); }
        });
        this.listen<KeyboardEvent>(window, 'keyup', (e) => {
            if (this.placement !== null && this.modifierHeld && !this.modifierMatches(e)) { this.modifierHeld = false; this.clearPlacementPreview(); this.scheduleDraw(); }
        });
        this.listen(window, 'blur', () => { if (this.modifierHeld) { this.modifierHeld = false; this.clearPlacementPreview(); this.scheduleDraw(); } });
        // Double-click anywhere → fit all data to the full width
        // (the desktop/terminal/Designer chart behaviour).
        // In placement mode with the modifier held, a right-click is a gesture (e.g. "sell here"),
        // so suppress the browser context menu and let it land as a click instead.
        this.listen<MouseEvent>(this.canvas, 'contextmenu', (e) => {
            if (this.placement !== null && this.modifierHeld) e.preventDefault();
        });
        this.listen<MouseEvent>(this.canvas, 'dblclick', (e) => { e.preventDefault(); this.fitContent(); });
        {
            this.listen<WheelEvent>(this.canvas, 'wheel', (e) => {
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
        this.listen<TouchEvent>(this.canvas, 'touchstart', (e) => {
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
        this.listen<TouchEvent>(this.canvas, 'touchmove', (e) => {
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
        this.listen(this.canvas, 'touchend', endPinch);
        this.listen(this.canvas, 'touchcancel', endPinch);
    }
}

// ---- public factory surface (the `SSChart` global) --------
export function createChart(container: HTMLElement, options: ChartOptions = {}): IChartApi {
    return new ChartImpl(container, options);
}

export function createSeriesMarkers(series: ISeriesApi, markers: SeriesMarker[] = []): ISeriesMarkersPlugin {
    const plugin = new MarkersPlugin(series as Series);
    plugin.setMarkers(markers);
    return plugin;
}

export const version = 'sschart-experimental-0.1';
