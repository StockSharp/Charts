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
import { SessionTimeProjection } from '../time/session-time-projection.js';
import {
    TimeAxisFormatter,
    type TimeScaleFormatter,
} from '../time/time-axis-formatter.js';
import type {
    ITradingCalendar,
    TradingSessionKind,
} from '../time/trading-calendar.js';
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
import { HitTestEngine, type HitTestCandidate } from './interaction/hit-test.js';
import { CommandStack, type ICommandStack } from './interaction/command-stack.js';
import {
    InteractionController,
    InteractionState,
    type InteractionMovement,
    type InteractionObjectRef,
    type InteractionStateSnapshot,
} from './interaction/interaction-controller.js';
import { PrimitiveHost } from './primitives/primitive-host.js';
import { primitiveLayerRank } from './primitives/primitive-layer.js';
import {
    applyAutoscalePixelMargins,
    normalizeAutoscaleInfo,
    type NormalizedAutoscaleInfo,
} from './primitives/primitive-autoscale.js';
import {
    PriceLinesPrimitive,
    isPriceLinePrimitiveHitData,
    type PriceLinePrimitiveEntry,
} from './primitives/price-lines-primitive.js';
import { SeriesMarkersPrimitive } from './primitives/series-markers-primitive.js';
import {
    PrimitiveHitTestLocation,
    PrimitivePaneViewClip,
    PrimitiveZOrder,
} from './primitives/primitive-api.js';
import type {
    CanvasRenderTarget,
    HitTestContext,
    IChartPrimitive,
    PrimitiveAxisView,
    PrimitiveAttachedContext,
    PrimitiveAttachOptions,
    PrimitivePaneGeometry,
    PrimitivePaneView,
    PrimitiveInteractionEvent,
    PrimitiveInteractionOptions,
    PrimitiveHitTestRole as PrimitiveHitTestRoleValue,
    PrimitiveTheme,
    PrimitiveZOrder as PrimitiveZOrderValue,
} from './primitives/primitive-api.js';
import { CanvasRenderTarget2D } from './render/canvas-render-target.js';
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
    type IIncrementalSeriesDataProcessor,
    type SeriesDataProcessorPatch,
    type SeriesDefinition,
    type SeriesRendererContext,
    type TimedSeriesData,
} from '../series/registry.js';

export type { TimeRange } from './scale/time-scale.js';
export type { PaneOptions, PaneState } from './model/pane-model.js';
export { MismatchDirection } from './model/series-store.js';
export type { BarsInfo, MismatchDirectionValue } from './model/series-store.js';
export type { DataChangeKind, DataChangeSet } from './model/data-change-set.js';
export type {
    AutoscaleInfo,
    BitmapCoordinatesRenderingScope,
    CanvasRenderTarget,
    HitTestContext,
    IChartPrimitive,
    IPrimitiveRenderer,
    MediaCoordinatesRenderingScope,
    PrimitiveAxisView,
    PrimitiveAttachedContext,
    PrimitiveAttachOptions,
    PrimitiveDisposable,
    PrimitivePaneGeometry,
    PrimitivePaneView,
    PrimitiveHit,
    PrimitiveInteractionEvent,
    PrimitiveInteractionOptions,
    PrimitiveRect,
    PrimitiveSize,
    PrimitiveTheme,
} from './primitives/primitive-api.js';
export {
    PrimitiveHitTestLocation,
    PrimitiveHitTestRole,
    PrimitivePaneViewClip,
    PrimitiveZOrder,
} from './primitives/primitive-api.js';
export { InteractionState } from './interaction/interaction-controller.js';
export type {
    InteractionObjectRef,
    InteractionStateSnapshot,
} from './interaction/interaction-controller.js';
export { CommandStack } from './interaction/command-stack.js';
export type {
    CommandStackListener,
    CommandStackSnapshot,
    ICommand,
    ICommandStack,
} from './interaction/command-stack.js';
export {
    getSeriesDefinition,
    getSeriesTypes,
    registerSeries,
    seriesRendererRegistry,
    unregisterSeries,
} from '../series/registry.js';
export type {
    CustomSeriesDefinition,
    IIncrementalSeriesDataProcessor,
    IncrementalSeriesDataProcessorFactory,
    ISeriesRenderer,
    PreparedSeriesData,
    SeriesDefinition,
    SeriesDataProcessor,
    SeriesDataProcessorPatch,
    SeriesDataUpdateKind,
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
/** @deprecated Approximate candle-volume profile input. Use exact orderflow FootprintBar levels. */
export interface VolumeProfileData extends CandlestickData { vol?: number }
/** @deprecated Unclassified total volume. It is not exact bid/ask footprint data. */
export interface PriceLevelData { price: number; vol: number }
/** @deprecated Legacy approximate cluster input. Use FootprintBar and FootprintSeries. */
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
/** @deprecated Candle-only input is unsupported. Use ExactVolumeProfileSeries with FootprintBar. */
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

export const TimeScaleMode = {
    Continuous: 'continuous',
    Ordinal: 'ordinal',
    SessionAware: 'session-aware',
} as const;
export type TimeScaleModeValue = typeof TimeScaleMode[keyof typeof TimeScaleMode];

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
    upperLineWidth?: number; lowerLineWidth?: number;
    upperLineStyle?: LineStyleValue; lowerLineStyle?: LineStyleValue;
    upperLineVisible?: boolean; lowerLineVisible?: boolean; fillVisible?: boolean;
    // histogram
    base?: number;
    // shared
    /** Stable persistence key. Generated once when omitted and immutable afterwards. */
    id?: string;
    /** False for runtime-owned output series (for example indicator painter internals). */
    persist?: boolean;
    /** False hides rendering, autoscale, crosshair values and series-owned primitives. */
    visible?: boolean;
    priceScaleId?: string;
    priceLineVisible?: boolean;
    lastValueVisible?: boolean;     // hide the per-series last-value pill on the right axis
    priceLineSource?: 'lastBar' | 'lastVisible';   // last-bar (default) or last-visible point
    priceFormat?: PriceFormat;
    // point&figure / renko
    boxSize?: number;
    reversal?: number;
}

export interface TimeScaleOptions {
    borderColor?: string;
    timeVisible?: boolean;
    secondsVisible?: boolean;
    visible?: boolean;
    /** Explicit time-domain mapping. Defaults to continuous. */
    mode?: TimeScaleModeValue;
    /** Required by session-aware mode. */
    calendar?: ITradingCalendar;
    /** Sessions retained by session-aware mode. Omit to retain every kind. */
    sessionKinds?: readonly TradingSessionKind[];
    /** BCP 47 locale. Defaults to deterministic en-GB. */
    locale?: string;
    /** IANA timezone. Defaults to the calendar timezone, then UTC. */
    timeZone?: string;
    /** Optional formatter shared by tick and crosshair labels. */
    formatter?: TimeScaleFormatter;
    /** @deprecated Use mode: TimeScaleMode.Ordinal. */
    ordinal?: boolean;
}

export interface ChartOptions {
    width?: number; height?: number;
    autoSize?: boolean;       // observe the host with ResizeObserver and re-fit
    commandHistoryLimit?: number;
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
    timeScale?: TimeScaleOptions;
    crosshair?: {
        vertLine?: { color?: string; visible?: boolean };
        horzLine?: { color?: string; visible?: boolean };
        mode?: CrosshairModeValue;          // Normal (default) | Magnet (snap horz line to OHLC)
    };
    handleScroll?: boolean | { mouseWheel?: boolean; pressedMouseMove?: boolean };
    handleScale?: boolean | { axisPressedMouseMove?: boolean; mouseWheel?: boolean };
}

type AnyPoint = CandlestickData & LineData & HistogramData & AreaData & BandData;

let nextSeriesId = 1;

const DEF_LAYOUT_BG = '#1f1f23';
const DEF_TEXT = '#d7d7d7';
const DEF_GRID = '#2f2f35';
const DEF_BORDER = '#3a3a40';
const DEF_FONT = 'Segoe UI, Tahoma, sans-serif';

function num(v: unknown, fallback: number): number {
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

const TIME_SCALE_MODES = new Set<TimeScaleModeValue>(Object.values(TimeScaleMode));
const TRADING_SESSION_KINDS = new Set<TradingSessionKind>(['pre-market', 'regular', 'post-market']);

function isTradingCalendar(value: unknown): value is ITradingCalendar {
    if (value === null || typeof value !== 'object') return false;
    const calendar = value as Partial<ITradingCalendar>;
    return typeof calendar.schedule === 'function'
        && typeof calendar.sessionsInRange === 'function'
        && typeof calendar.sessionAt === 'function'
        && typeof calendar.isTradingTime === 'function'
        && typeof calendar.nextSession === 'function'
        && typeof calendar.previousSession === 'function';
}

function normalizeTimeScaleOptions(value: TimeScaleOptions | undefined): TimeScaleOptions | undefined {
    if (value === undefined) return undefined;
    if (value === null || typeof value !== 'object')
        throw new TypeError('sschart: timeScale options must be an object');
    if (value.mode !== undefined && !TIME_SCALE_MODES.has(value.mode))
        throw new TypeError(`sschart: invalid timeScale mode ${String(value.mode)}`);
    if (value.ordinal !== undefined && typeof value.ordinal !== 'boolean')
        throw new TypeError('sschart: timeScale.ordinal must be boolean');
    if (value.calendar !== undefined && !isTradingCalendar(value.calendar))
        throw new TypeError('sschart: timeScale.calendar must implement ITradingCalendar');
    if (value.formatter !== undefined && typeof value.formatter !== 'function')
        throw new TypeError('sschart: timeScale.formatter must be a function');
    let locale: string | undefined;
    if (value.locale !== undefined) {
        if (typeof value.locale !== 'string' || value.locale.trim().length === 0)
            throw new TypeError('sschart: timeScale.locale must be a non-empty string');
        locale = value.locale.trim();
        try { new Intl.DateTimeFormat(locale); }
        catch { throw new RangeError(`sschart: invalid timeScale locale ${locale}`); }
    }
    let timeZone: string | undefined;
    if (value.timeZone !== undefined) {
        if (typeof value.timeZone !== 'string' || value.timeZone.trim().length === 0)
            throw new TypeError('sschart: timeScale.timeZone must be a non-empty string');
        timeZone = value.timeZone.trim();
        try { new Intl.DateTimeFormat('en-US', { timeZone }); }
        catch { throw new RangeError(`sschart: invalid timeScale IANA timezone ${timeZone}`); }
    }

    let sessionKinds: readonly TradingSessionKind[] | undefined;
    if (value.sessionKinds !== undefined) {
        if (!Array.isArray(value.sessionKinds) || value.sessionKinds.length === 0)
            throw new TypeError('sschart: timeScale.sessionKinds must be a non-empty array');
        const unique = [...new Set(value.sessionKinds)];
        if (unique.some((kind) => !TRADING_SESSION_KINDS.has(kind)))
            throw new TypeError('sschart: timeScale.sessionKinds contains an invalid kind');
        sessionKinds = Object.freeze(unique);
    }

    const mode = value.mode ?? (value.ordinal === true ? TimeScaleMode.Ordinal : TimeScaleMode.Continuous);
    if (mode === TimeScaleMode.SessionAware && !isTradingCalendar(value.calendar))
        throw new TypeError('sschart: session-aware timeScale mode requires a trading calendar');
    return Object.freeze({ ...value, locale, timeZone, sessionKinds });
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
    private readonly stableId: string;
    private persistable: boolean;
    readonly kind: string;
    readonly definition: CustomSeriesDefinition<AnyPoint, SeriesOptions>;
    opts: SeriesOptions;
    get affectsTimeScale(): boolean { return this.definition.affectsTimeScale !== false; }
    get visible(): boolean { return this.opts.visible !== false; }
    get sourcePoints(): readonly AnyPoint[] { return this.values; }
    get points(): readonly AnyPoint[] {
        return this.definition.dataProcessor !== undefined
            || this.incrementalProcessor !== null
            ? this.renderData().store.values
            : this.sourcePoints;
    }
    private prepared: {
        key: string;
        store: SeriesStore<AnyPoint>;
        metadata: Readonly<Record<string, unknown>>;
    } | null = null;
    private readonly incrementalProcessor: IIncrementalSeriesDataProcessor<
        AnyPoint,
        SeriesOptions
    > | null;
    private optionsVersion = 0;
    constructor(definition: CustomSeriesDefinition<AnyPoint, SeriesOptions>, opts: SeriesOptions) {
        super();
        this.definition = definition;
        this.kind = definition.type;
        this.stableId = normalizeSeriesId(opts.id, definition.type);
        if (opts.persist !== undefined && typeof opts.persist !== 'boolean')
            throw new TypeError('sschart: series persist must be a boolean');
        if (opts.visible !== undefined && typeof opts.visible !== 'boolean')
            throw new TypeError('sschart: series visible must be a boolean');
        this.persistable = opts.persist !== false;
        const { id: _id, persist: _persist, ...rendererOptions } = opts;
        this.opts = rendererOptions;
        const factory = definition.incrementalDataProcessorFactory;
        this.incrementalProcessor = factory === undefined ? null : factory();
        if (this.incrementalProcessor !== null
            && (typeof this.incrementalProcessor !== 'object'
                || typeof this.incrementalProcessor.reset !== 'function'
                || typeof this.incrementalProcessor.update !== 'function')) {
            throw new TypeError(
                `sschart: series type '${this.kind}' returned an invalid incremental data processor`,
            );
        }
    }
    setData(points: ReadonlyArray<AnyPoint>): void {
        if (this.incrementalProcessor !== null) {
            const candidate = this.prepareReset(points);
            const change = this.replaceData(points);
            this.prepared = {
                key: `${this.kind}:${this.store.version}:${this.optionsVersion}`,
                store: candidate.store,
                metadata: candidate.metadata,
            };
            this.chart?.onDataChanged(change);
            return;
        }
        const change = this.replaceData(points);
        this.resetPreparedData();
        this.chart?.onDataChanged(change);
    }
    // Streaming-style single-point push:
    // same time as last -> replace; newer time -> append; older -> ignore.
    update(point: AnyPoint): void {
        if (this.incrementalProcessor !== null) {
            const last = this.store.last;
            let kind: 'append' | 'update';
            if (last === undefined) kind = 'append';
            else if (Number.isFinite(point.time) && Number.isFinite(last.time)) {
                if (point.time < last.time) return;
                kind = point.time === last.time ? 'update' : 'append';
            } else kind = 'update';
            if (this.prepared === null) this.resetPreparedData();
            const prepared = this.prepared;
            if (prepared === null)
                throw new Error(`sschart: series type '${this.kind}' did not prepare its data`);
            let patch: SeriesDataProcessorPatch<AnyPoint> | null;
            try {
                patch = this.incrementalProcessor.update(point, this.opts, kind);
                if (patch !== null) {
                    prepared.store.replaceTail(
                        patch.fromIndex,
                        patch.removed,
                        patch.data as readonly AnyPoint[],
                    );
                }
            } catch (error) {
                this.resetPreparedData();
                throw error;
            }
            const change = this.updateTail(point);
            if (change === null) {
                this.resetPreparedData();
                throw new Error(`sschart: series type '${this.kind}' produced a stale update`);
            }
            this.prepared = {
                key: `${this.kind}:${this.store.version}:${this.optionsVersion}`,
                store: prepared.store,
                metadata: patch?.metadata === undefined
                    ? prepared.metadata
                    : Object.freeze({ ...patch.metadata }),
            };
            this.chart?.onDataChanged(change);
            return;
        }
        const change = this.updateTail(point);
        if (change === null) return;
        this.prepared = null;
        this.chart?.onDataChanged(change);
    }
    prependData(points: ReadonlyArray<AnyPoint>): void {
        if (this.incrementalProcessor !== null) {
            const candidateSource = new SeriesStore<AnyPoint>();
            candidateSource.replace(this.sourcePoints);
            const candidateChange = candidateSource.prepend(points);
            if (candidateChange === null) return;
            const candidate = this.prepareReset(candidateSource.values);
            const change = this.store.prepend(points);
            if (change === null)
                throw new Error(`sschart: series type '${this.kind}' produced a stale prepend`);
            this.prepared = {
                key: `${this.kind}:${this.store.version}:${this.optionsVersion}`,
                store: candidate.store,
                metadata: candidate.metadata,
            };
            this.chart?.onDataChanged(change);
            return;
        }
        const change = this.store.prepend(points);
        if (change !== null) {
            this.resetPreparedData();
            this.chart?.onDataChanged(change);
        }
    }
    pop(count = 1): AnyPoint[] {
        if (this.incrementalProcessor !== null) {
            const amount = Math.min(
                this.store.length,
                Math.max(0, Number.isFinite(count) ? Math.floor(count) : 0),
            );
            if (amount === 0) return [];
            const candidate = this.prepareReset(this.sourcePoints.slice(0, -amount));
            const result = this.store.pop(amount);
            if (result.change === null)
                throw new Error(`sschart: series type '${this.kind}' produced a stale pop`);
            this.prepared = {
                key: `${this.kind}:${this.store.version}:${this.optionsVersion}`,
                store: candidate.store,
                metadata: candidate.metadata,
            };
            this.chart?.onDataChanged(result.change);
            return result.points;
        }
        const result = this.store.pop(count);
        if (result.change !== null) {
            this.resetPreparedData();
            this.chart?.onDataChanged(result.change);
        }
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
        const wasVisible = this.visible;
        if (patch.id !== undefined
            && (typeof patch.id !== 'string' || patch.id.trim() !== this.stableId)) {
            throw new Error('sschart: series id cannot change after creation');
        }
        if (patch.persist !== undefined && typeof patch.persist !== 'boolean')
            throw new TypeError('sschart: series persist must be a boolean');
        if (patch.visible !== undefined && typeof patch.visible !== 'boolean')
            throw new TypeError('sschart: series visible must be a boolean');
        const { id: _id, persist: _persist, ...rendererPatch } = patch;
        const nextOptions = { ...this.opts, ...rendererPatch };
        const dataOptionsChanged = Object.keys(rendererPatch).some(key => key !== 'visible');
        let candidate: {
            store: SeriesStore<AnyPoint>;
            metadata: Readonly<Record<string, unknown>>;
        } | null = null;
        if (dataOptionsChanged && this.incrementalProcessor !== null) {
            try {
                candidate = this.prepareReset(this.sourcePoints, nextOptions);
            } catch (error) {
                this.prepareReset(this.sourcePoints, this.opts);
                throw error;
            }
        }
        this.opts = nextOptions;
        if (patch.persist !== undefined) this.persistable = patch.persist;
        if (dataOptionsChanged) {
            this.optionsVersion++;
            if (candidate === null) this.resetPreparedData();
            else {
                this.prepared = {
                    key: `${this.kind}:${this.store.version}:${this.optionsVersion}`,
                    store: candidate.store,
                    metadata: candidate.metadata,
                };
            }
        }
        const visibilityChanged = wasVisible !== this.visible;
        if (visibilityChanged) this.chart?.seriesVisibilityChanged(this);
        if (dataOptionsChanged
            && (this.definition.dataProcessor !== undefined || this.incrementalProcessor !== null)) {
            this.chart?.onDataChanged();
        } else if (!visibilityChanged) this.chart?.scheduleDraw();
    }
    renderData(): {
        key: string;
        store: SeriesStore<AnyPoint>;
        metadata: Readonly<Record<string, unknown>>;
    } {
        const key = `${this.kind}:${this.store.version}:${this.optionsVersion}`;
        if (this.incrementalProcessor !== null) {
            if (this.prepared === null) this.resetPreparedData();
            if (this.prepared === null)
                throw new Error(`sschart: series type '${this.kind}' did not prepare its data`);
            return this.prepared;
        }
        const processor = this.definition.dataProcessor;
        if (processor === undefined) return { key, store: this.store, metadata: {} };
        if (this.prepared?.key === key) return this.prepared;

        const result = processor(this.sourcePoints, this.opts);
        const store = new SeriesStore<AnyPoint>();
        store.replace(result.data as readonly AnyPoint[]);
        this.prepared = {
            key,
            store,
            metadata: Object.freeze({ ...(result.metadata ?? {}) }),
        };
        return this.prepared;
    }
    renderStore(): SeriesStore<AnyPoint> { return this.renderData().store; }
    private resetPreparedData(): void {
        this.prepared = null;
        if (this.incrementalProcessor === null) return;
        const candidate = this.prepareReset(this.sourcePoints);
        this.prepared = {
            key: `${this.kind}:${this.store.version}:${this.optionsVersion}`,
            store: candidate.store,
            metadata: candidate.metadata,
        };
    }
    private prepareReset(
        points: readonly AnyPoint[],
        options: SeriesOptions = this.opts,
    ): {
        store: SeriesStore<AnyPoint>;
        metadata: Readonly<Record<string, unknown>>;
    } {
        if (this.incrementalProcessor === null)
            throw new Error(`sschart: series type '${this.kind}' has no incremental processor`);
        const ordered = new SeriesStore<AnyPoint>();
        ordered.replace(points);
        const result = this.incrementalProcessor.reset(ordered.values, options);
        const store = new SeriesStore<AnyPoint>();
        store.replace(result.data as readonly AnyPoint[]);
        return {
            store,
            metadata: Object.freeze({ ...(result.metadata ?? {}) }),
        };
    }
    priceScaleId(): string { return this.opts.priceScaleId ?? 'right'; }
    id(): string { return this.stableId; }
    type(): string { return this.kind; }
    options(): Readonly<SeriesOptions> {
        const options: SeriesOptions = {
            ...this.opts,
            id: this.stableId,
            persist: this.persistable,
        };
        if (this.opts.priceFormat !== undefined)
            options.priceFormat = Object.freeze({ ...this.opts.priceFormat });
        return Object.freeze(options);
    }
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
        this.chart?.priceLineAdded(this, pl);
        return pl;
    }
    removePriceLine(line: IPriceLine): void {
        const i = this.priceLines.indexOf(line as PriceLine);
        if (i >= 0) {
            const removed = this.priceLines[i];
            this.priceLines.splice(i, 1);
            this.chart?.priceLineRemoved(this, removed);
        }
    }
    magnetValues(point: AnyPoint): readonly number[] {
        const explicit = this.definition.renderer.magnetValues?.(point, this.opts);
        const values = explicit ?? [this.definition.renderer.priceValue?.(point, this.opts) ?? null];
        const finite: number[] = [];
        for (const value of values) {
            if (typeof value === 'number' && Number.isFinite(value)) finite.push(value);
        }
        return Object.freeze(finite);
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

function normalizeSeriesId(value: string | undefined, type: string): string {
    if (value === undefined) return `${type.toLowerCase()}-${nextSeriesId++}`;
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new TypeError('sschart: series id must be a non-empty string');
    return value.trim();
}

// Concrete handle returned by Series.createPriceLine — mutable via
// applyOptions, repaints on each change. Drawn by the chart, not by
// itself, so the only state worth keeping is the options blob + a
// back-ref to the owning series. displayY caches the eased label
// position used by the primitive's collision-avoidance pass.
let nextPriceLinePrimitiveId = 1;

class PriceLine implements IPriceLine {
    private opts: PriceLineOptions;
    readonly stablePrimitiveId: string;
    // last drawn label y = its line's y + labelOffset. The OFFSET (the collision-avoidance shift
    // away from the line) is what eases, not the absolute y — so the label tracks its own line
    // instantly when the line moves (zoom / scroll / drag) and only the spread animates.
    displayY: number | null = null;
    // eased collision offset from the line; null until the first frame (then it snaps, no fly-in).
    labelOffset: number | null = null;
    constructor(opts: PriceLineOptions, private readonly series: Series) {
        this.opts = { ...opts };
        this.stablePrimitiveId = opts.id?.length ? opts.id : `price-line-${nextPriceLinePrimitiveId++}`;
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
export interface ResolvedPriceScaleOptions {
    readonly scaleMargins: Readonly<{ top: number; bottom: number }>;
    readonly mode: PriceScaleModeValue;
    readonly autoScale: boolean;
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
    options(): ResolvedPriceScaleOptions {
        return this.chart?.getScaleOptions(this.scaleId, this.pane) ?? Object.freeze({
            scaleMargins: Object.freeze({ top: 0, bottom: 0 }),
            mode: PriceScaleMode.Normal,
            autoScale: true,
        });
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
export interface PrimitiveHoveredObject {
    readonly type: 'primitive';
    readonly primitive: IChartPrimitive;
    readonly id: string;
    readonly role: PrimitiveHitTestRoleValue;
    readonly cursor: string;
    readonly zOrder: PrimitiveZOrderValue;
    readonly data: unknown;
    readonly interaction: Readonly<Required<PrimitiveInteractionOptions>>;
}
export type HoveredObject = SeriesHoveredObject | PriceLineHoveredObject | PrimitiveHoveredObject;
export interface CrosshairEvent {
    readonly time: Time | null;
    readonly logical: number | null;
    readonly point: { x: number; y: number } | null;
    readonly paneId: string | null;
    readonly price: number | null;
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
    paneId: string;
    seriesData: ReadonlyMap<ISeriesApi<any, any>, TimedSeriesData>;
    button: number;   // 0 = left, 2 = right (a host can map buy/sell to the mouse button)
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    metaKey: boolean;
    hoveredObject: HoveredObject | null;
}
export type ClickListener = (c: ChartClick) => void;
export type InteractionStateListener = (state: InteractionStateSnapshot) => void;
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
    options(): ResolvedPriceScaleOptions;
}

export interface ISeriesMarkersPlugin {
    setMarkers(markers: SeriesMarker[]): void;
}

export interface ISeriesApi<
    TData extends TimedSeriesData = TimedSeriesData,
    TOptions extends SeriesOptions = SeriesOptions,
> {
    id(): string;
    type(): string;
    options(): Readonly<TOptions>;
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
    /** Finite renderer-defined prices eligible for cursor and drawing snapping. */
    magnetValues(data: TData): readonly number[];
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
    priceScaleIds(): readonly string[];
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
    /** Moves the existing series instance and its attached primitives to another pane. */
    moveSeries(series: ISeriesApi, pane: IPaneApi): void;
    removeSeries(series: ISeriesApi): void;
    attachPrimitive(primitive: IChartPrimitive, options?: PrimitiveAttachOptions): void;
    detachPrimitive(primitive: IChartPrimitive): void;
    commandStack(): ICommandStack;
    interactionState(): InteractionStateSnapshot;
    subscribeInteractionStateChange(cb: InteractionStateListener): void;
    unsubscribeInteractionStateChange(cb: InteractionStateListener): void;
    beginDrawing(): void;
    finishDrawing(): void;
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
    options(): Readonly<ChartOptions>;
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
    priceScaleIds(): readonly string[] { return this.model.priceScaleIds(); }
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

interface PrimitiveAutoscaleEntry extends NormalizedAutoscaleInfo {
    readonly pane: IPaneApi;
    readonly scaleId: string;
    readonly series: Series | null;
}

interface PrimitiveRoute {
    paneModel: PaneModel<Series>;
    pane: PaneApi;
    series: Series | null;
    priceScaleId: string;
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
    private readonly priceLinePrimitives = new Map<PaneModel<Series>, PriceLinesPrimitive>();
    private readonly markerPrimitives = new Map<Series, SeriesMarkersPrimitive>();
    private activePane: PaneModel<Series> = this.model.mainPane;
    private activePaneRect: PaneLayoutRect = {
        paneId: 'main', state: 'normal', x: 0, y: 0, width: 0, height: 0,
    };

    private get series(): readonly Series[] { return this.model.series; }
    private get activeSeries(): readonly Series[] {
        return this.activePane.series.filter(series => series.visible);
    }
    private get viewFrom(): number { return this.model.timeScale.visibleFrom; }
    private set viewFrom(value: number) { this.model.timeScale.visibleFrom = value; }
    private get viewTo(): number { return this.model.timeScale.visibleTo; }
    private set viewTo(value: number) { this.model.timeScale.visibleTo = value; }
    private get dataMin(): number { return this.model.timeScale.dataFrom; }
    private get dataMax(): number { return this.model.timeScale.dataTo; }

    rangeListeners: RangeListener[] = [];
    logicalRangeListeners: LogicalRangeListener[] = [];
    private crosshairListeners: CrosshairListener[] = [];
    private width = 0;
    private height = 0;
    private dpr = 1;

    private readonly disposables = new DisposableStore();
    private readonly renderScheduler: RenderScheduler;
    private readonly primitiveHost: PrimitiveHost;
    private readonly primitiveRoutes = new WeakMap<IChartPrimitive, PrimitiveRoute>();
    private readonly hitTestEngine = new HitTestEngine();
    private readonly interactionController: InteractionController;
    private readonly commands: CommandStack;
    private interactionListeners: InteractionStateListener[] = [];
    private primitiveAutoscaleCache: readonly PrimitiveAutoscaleEntry[] | null = null;
    private primitiveAutoscaleComputing = false;
    private sessionProjectionCache: {
        readonly calendar: ITradingCalendar;
        readonly kindsKey: string;
        readonly from: number;
        readonly to: number;
        readonly projection: SessionTimeProjection;
    } | null = null;
    private timeAxisFormatterCache: {
        readonly locale: string;
        readonly timeZone: string;
        readonly timeVisible: boolean;
        readonly secondsVisible: boolean;
        readonly custom: TimeScaleFormatter | undefined;
        readonly formatter: TimeAxisFormatter;
    } | null = null;
    private disposed = false;
    // optional ResizeObserver when autoSize is on (default true)
    private autoResizer: ResizeObserver | null = null;

    // pointer state
    private mouseX: number | null = null;
    private mouseY: number | null = null;
    private controlledCrosshairTime: Time | null = null;
    private gesturePane: PaneModel<Series> | null = null;
    private scaleDrag: { kind: 'price'; pane: PaneModel<Series> } | { kind: 'time' } | null = null;
    private activePrimitiveInteraction: {
        hit: PrimitiveHoveredObject;
        start: Readonly<{ x: number; y: number }>;
        last: Readonly<{ x: number; y: number }>;
    } | null = null;
    private splitterDrag: {
        splitter: PaneSplitter;
        startY: number;
        beforeHeight: number;
        afterHeight: number;
    } | null = null;
    // true between a pointerdown that landed on the canvas and its release — so a stray global
    // pointerup (gesture started elsewhere) is ignored by finishGesture
    private pointerDown = false;
    // pointer-down origin, used to tell a click (place) from a drag (pan / line move)
    private downX = 0;
    private downY = 0;
    private downButton = 0;   // 0 = left, 2 = right — reported on the click so hosts can map buy/sell
    private drawingPointerDown = false;
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
        this.opts = { ...opts, timeScale: normalizeTimeScaleOptions(opts.timeScale) };
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
        this.primitiveHost = this.disposables.add(new PrimitiveHost(() => this.scheduleDraw(RenderDirty.All)));
        this.commands = new CommandStack(this.opts.commandHistoryLimit ?? 100);
        this.interactionController = new InteractionController((snapshot) => {
            for (const listener of this.interactionListeners) {
                try { listener(snapshot); } catch { /* a listener must not break pointer state */ }
            }
        });

        const w = num(this.opts.width, host.clientWidth || 600);
        const h = num(this.opts.height, host.clientHeight || 300);
        this.applySize(w, h);
        this.bindPointer();
        this.listen(document, 'visibilitychange', this.onVisChange);
        // autoSize defaults ON when the caller doesn't pass explicit
        // width/height — track the host with ResizeObserver and re-fit.
        const autoOn = this.opts.autoSize === true
            || (this.opts.autoSize !== false && this.opts.width === undefined && this.opts.height === undefined);
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
        if (this.opts.rightPriceScale?.scaleMargins) {
            const sm = this.opts.rightPriceScale.scaleMargins;
            this.model.mainPane.priceScale('right').setMargins(sm);
        }
        if (this.opts.leftPriceScale?.scaleMargins) {
            const sm = this.opts.leftPriceScale.scaleMargins;
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
        if (model === this.model.mainPane) throw new Error('sschart: the main pane cannot be removed');
        this.priceLinePrimitives.delete(model);
        for (const attachment of this.primitiveHost.attachments()) {
            if (attachment.options.pane === pane) {
                this.forgetPrimitiveInteraction(attachment.primitive);
                this.primitiveRoutes.delete(attachment.primitive);
            }
        }
        this.primitiveHost.detachWhere((attachment) => attachment.pane === pane);
        const removed = this.model.removePane(model);
        for (const series of removed) {
            this.markerPrimitives.delete(series);
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
        if (this.series.some(existing => existing.id() === s.id()))
            throw new Error(`sschart: duplicate series id '${s.id()}'`);
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
        if (!(s instanceof Series) || s.chart !== this) return;
        const pane = s.pane;
        if (pane !== null) {
            const primitive = this.priceLinePrimitives.get(pane);
            for (const line of s.priceLines) primitive?.lineRemoved(line);
        }
        for (const attachment of this.primitiveHost.attachments()) {
            if (attachment.options.series === series) {
                this.forgetPrimitiveInteraction(attachment.primitive);
                this.primitiveRoutes.delete(attachment.primitive);
            }
        }
        this.primitiveHost.detachWhere((attachment) => attachment.series === series);
        this.markerPrimitives.delete(s);
        if (!this.model.removeSeries(s)) return;
        s.chart = null;
        s.pane = null;
        if (pane !== null) this.refreshPriceLinesPrimitive(pane);
        this.recomputeAxisPads();
        this.onDataChanged();
    }
    moveSeries(series: ISeriesApi, pane: IPaneApi): void {
        const item = this.resolveSeries(series);
        const target = this.resolvePane(pane);
        const source = item.pane;
        if (source === null) throw new Error('sschart: series is detached');
        if (source === target) return;

        this.model.addSeries(item, target);
        item.pane = target;
        const targetApi = this.paneApiFor(target);
        for (const attachment of this.primitiveHost.attachments()) {
            if (attachment.options.series !== series) continue;
            const route = this.primitiveRoutes.get(attachment.primitive);
            if (route !== undefined) {
                route.paneModel = target;
                route.pane = targetApi;
            }
            this.primitiveHost.updateOptions(attachment.primitive, {
                ...attachment.options,
                pane: targetApi,
            });
        }
        this.refreshPriceLinesPrimitive(source);
        if (item.priceLines.length > 0) this.ensurePriceLinesPrimitive(target);
        this.recomputeAxisPads();
        this.recomputePaneLayout();
        this.onDataChanged();
    }
    priceLineAdded(series: Series, _line: PriceLine): void {
        const pane = series.pane;
        if (pane === null || !series.visible) return;
        this.ensurePriceLinesPrimitive(pane);
        this.scheduleDraw(RenderDirty.All);
    }
    priceLineRemoved(series: Series, line: PriceLine): void {
        const pane = series.pane;
        if (pane === null) return;
        this.priceLinePrimitives.get(pane)?.lineRemoved(line);
        this.refreshPriceLinesPrimitive(pane);
        this.scheduleDraw(RenderDirty.All);
    }
    private ensurePriceLinesPrimitive(pane: PaneModel<Series>): PriceLinesPrimitive {
        const existing = this.priceLinePrimitives.get(pane);
        if (existing !== undefined) return existing;
        const primitive = new PriceLinesPrimitive(
            () => this.priceLineEntries(pane),
            () => `11px ${this.opts.layout?.fontFamily ?? DEF_FONT}`,
        );
        this.priceLinePrimitives.set(pane, primitive);
        try {
            this.attachPrimitive(primitive, { pane: this.paneApiFor(pane), priceScaleId: 'right' });
        } catch (error) {
            this.priceLinePrimitives.delete(pane);
            throw error;
        }
        return primitive;
    }
    private refreshPriceLinesPrimitive(pane: PaneModel<Series>): void {
        if (pane.series.some((series) => series.visible && series.priceLines.length > 0)) return;
        const primitive = this.priceLinePrimitives.get(pane);
        if (primitive === undefined) return;
        this.priceLinePrimitives.delete(pane);
        this.detachPrimitive(primitive);
    }
    seriesVisibilityChanged(series: Series): void {
        const pane = series.pane;
        if (pane !== null) {
            if (series.visible && series.priceLines.length > 0) this.ensurePriceLinesPrimitive(pane);
            else this.refreshPriceLinesPrimitive(pane);
        }
        this.recomputeAxisPads();
        this.scheduleDraw(RenderDirty.All);
    }
    private priceLineEntries(pane: PaneModel<Series>): readonly PriceLinePrimitiveEntry[] {
        return pane.series.filter(series => series.visible).flatMap((series) => series.priceLines.map((line) => ({
            series,
            line,
            formatPrice: (price: number) => this.formatPriceLine(series, pane, price),
        })));
    }
    private formatPriceLine(series: Series, pane: PaneModel<Series>, price: number): string {
        const bounds = this.priceBounds(series.priceScaleId(), pane);
        return this.fmtScaleValue(
            this.valueToDomain(price, bounds, series),
            bounds,
            series.opts.priceFormat,
        );
    }
    seriesMarkers(series: Series): SeriesMarkersPrimitive {
        if (series.chart !== this || series.pane === null)
            throw new Error('sschart: marker series does not belong to an active chart');
        const existing = this.markerPrimitives.get(series);
        if (existing !== undefined) return existing;
        const primitive = new SeriesMarkersPrimitive({
            series,
            pointAtTime: (time) => series.renderStore().pointAtTime(time),
            priceValue: (point) => this.seriesPriceValue(series, point as AnyPoint),
        });
        this.markerPrimitives.set(series, primitive);
        try {
            this.attachPrimitive(primitive, { series });
        } catch (error) {
            this.markerPrimitives.delete(series);
            throw error;
        }
        return primitive;
    }
    attachPrimitive(primitive: IChartPrimitive, options: PrimitiveAttachOptions = {}): void {
        if (this.disposed) throw new Error('sschart: chart is disposed');
        const series = options.series === undefined ? null : this.resolveSeries(options.series);
        const explicitPane = options.pane === undefined ? null : this.resolvePane(options.pane);
        if (series !== null && explicitPane !== null && series.pane !== explicitPane)
            throw new Error('sschart: primitive series does not belong to the requested pane');

        const paneModel = explicitPane ?? series?.pane ?? this.model.mainPane;
        if (paneModel === null) throw new Error('sschart: primitive series is detached');
        const pane = this.paneApiFor(paneModel);
        const priceScaleId = options.priceScaleId ?? series?.priceScaleId() ?? 'right';
        if (priceScaleId.length === 0) throw new Error('sschart: primitive price scale id cannot be empty');
        const normalized = Object.freeze({ pane, series: series ?? undefined, priceScaleId });
        const route: PrimitiveRoute = { paneModel, pane, series, priceScaleId };
        this.primitiveRoutes.set(primitive, route);
        try {
            this.primitiveHost.attach(primitive, normalized, ({ requestUpdate, addDisposable }) => {
                const context: PrimitiveAttachedContext = {
                    chart: this,
                    get pane() { return route.pane; },
                    get series() { return route.series; },
                    get priceScaleId() { return route.priceScaleId; },
                    commandStack: this.commands,
                    requestUpdate,
                    timeToCoordinate: (time) => this.timeToXPublic(time),
                    coordinateToTime: (x) => this.xToTimePublic(x),
                    priceToCoordinate: (price, scaleId) => {
                        const id = scaleId ?? route.priceScaleId;
                        const coordinateSeries = route.series !== null
                            && id === route.series.priceScaleId() ? route.series : undefined;
                        return this.priceToY(price, id, route.paneModel, coordinateSeries);
                    },
                    coordinateToPrice: (y, scaleId) => {
                        const id = scaleId ?? route.priceScaleId;
                        const coordinateSeries = route.series !== null
                            && id === route.series.priceScaleId() ? route.series : undefined;
                        return this.yToPrice(y, id, route.paneModel, coordinateSeries);
                    },
                    pixelRatio: () => this.dpr,
                    theme: () => this.primitiveTheme(),
                    addDisposable,
                };
                return Object.freeze(context);
            });
        } catch (error) {
            this.primitiveRoutes.delete(primitive);
            throw error;
        }
        this.recomputeAxisPads();
        this.recomputePaneLayout();
    }
    detachPrimitive(primitive: IChartPrimitive): void {
        if (!this.primitiveHost.primitives().includes(primitive)) return;
        this.forgetPrimitiveInteraction(primitive);
        this.primitiveRoutes.delete(primitive);
        this.primitiveHost.detach(primitive);
        this.recomputeAxisPads();
        this.recomputePaneLayout();
    }
    commandStack(): ICommandStack { return this.commands; }
    interactionState(): InteractionStateSnapshot { return this.interactionController.snapshot(); }
    subscribeInteractionStateChange(cb: InteractionStateListener): void {
        this.interactionListeners.push(cb);
    }
    unsubscribeInteractionStateChange(cb: InteractionStateListener): void {
        this.interactionListeners = this.interactionListeners.filter((listener) => listener !== cb);
    }
    beginDrawing(): void {
        this.interactionController.beginDrawing();
        this.canvas.style.cursor = 'crosshair';
        this.scheduleDraw(RenderDirty.Overlay);
    }
    finishDrawing(): void {
        this.drawingPointerDown = false;
        this.interactionController.finishDrawing();
        this.canvas.style.cursor = 'default';
        this.scheduleDraw(RenderDirty.Overlay);
    }
    private forgetPrimitiveInteraction(primitive: IChartPrimitive): void {
        this.interactionController.forgetPrimitive(primitive);
        if (this.activePrimitiveInteraction?.hit.primitive === primitive) {
            this.activePrimitiveInteraction = null;
            this.pointerDown = false;
            this.gesturePane = null;
            this.canvas.style.cursor = 'default';
        }
    }
    private hasScale(id: string): boolean {
        if (this.activeSeries.some((s) => s.priceScaleId() === id)) return true;
        const pane = this.paneApiFor(this.activePane);
        return this.primitiveHost.attachments().some((attachment) => (
            this.primitiveAttachmentVisible(attachment.options)
            && attachment.options.pane === pane
            && attachment.options.priceScaleId === id
        ));
    }
    private hasAnyScale(id: string): boolean {
        return this.series.some((s) => s.visible && s.priceScaleId() === id)
            || this.primitiveHost.attachments().some((attachment) => (
                this.primitiveAttachmentVisible(attachment.options)
                && attachment.options.priceScaleId === id
            ));
    }
    private recomputeAxisPads(): void {
        this.padLeft = this.hasAnyScale('left') ? 56 : 0;
        this.padR = this.hasAnyScale('right') ? 64 : 8;
    }
    private primitiveAttachmentVisible(options: PrimitiveAttachOptions): boolean {
        return !(options.series instanceof Series) || options.series.visible;
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
    private resolveSeries(series: ISeriesApi<any, any>): Series {
        if (!(series instanceof Series) || series.chart !== this || series.pane === null)
            throw new Error('sschart: series does not belong to this chart');
        return series;
    }
    private primitiveTheme(): Readonly<PrimitiveTheme> {
        return Object.freeze({
            backgroundColor: this.opts.layout?.background?.color ?? DEF_LAYOUT_BG,
            textColor: this.opts.layout?.textColor ?? DEF_TEXT,
            fontFamily: this.opts.layout?.fontFamily ?? DEF_FONT,
            fontSize: this.opts.layout?.fontSize ?? 11,
            verticalGridColor: this.opts.grid?.vertLines?.color ?? DEF_GRID,
            horizontalGridColor: this.opts.grid?.horzLines?.color ?? DEF_GRID,
        });
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
    private applyPanePairHeights(
        beforePaneId: string,
        beforeHeight: number,
        afterPaneId: string,
        afterHeight: number,
    ): void {
        const before = this.model.paneById(beforePaneId);
        const after = this.model.paneById(afterPaneId);
        if (before === undefined || after === undefined) return;
        before.height = beforeHeight;
        after.height = afterHeight;
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
    getScaleOptions(
        scaleId: string,
        pane: PaneModel<Series> | null = null,
    ): ResolvedPriceScaleOptions {
        const scale = (pane ?? this.model.mainPane).priceScale(scaleId);
        return Object.freeze({
            scaleMargins: Object.freeze({ ...scale.margins }),
            mode: scale.mode as PriceScaleModeValue,
            autoScale: scale.frozenRange === null,
        });
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
    draggingLine(): IPriceLine | null {
        for (const primitive of this.priceLinePrimitives.values()) {
            const line = primitive.draggingLine();
            if (line !== null) return line;
        }
        return null;
    }
    private modifierMatches(e: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean }): boolean {
        switch (this.placement?.modifier) {
            case 'ctrl': return !!e.ctrlKey;
            case 'shift': return !!e.shiftKey;
            case 'alt': return !!e.altKey;
            default: return false;
        }
    }
    private mainSeries(pane: PaneModel<Series> = this.model.mainPane): Series | null {
        const visible = pane.series.filter(series => series.visible);
        return visible.find((s) => s.priceScaleId() === 'right') ?? visible[0] ?? null;
    }
    private updatePlacementPreview(): void {
        const placement = this.placement;
        const ok = placement !== null && this.modifierHeld && this.draggingLine() === null &&
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
    options(): Readonly<ChartOptions> { return cloneChartOptions(this.opts); }
    applyOptions(patch: ChartOptions): void {
        const timeScale = patch.timeScale === undefined
            ? undefined
            : normalizeTimeScaleOptions({ ...this.opts.timeScale, ...patch.timeScale });
        Object.assign(this.opts, patch);
        if (timeScale !== undefined) {
            this.opts.timeScale = timeScale;
            this.sessionProjectionCache = null;
        }
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
        this.interactionController.cancel();
        this.activePrimitiveInteraction = null;
        this.interactionListeners = [];
        this.commands.dispose();
        this.clickListeners = [];
        this.orderPlaceListeners = [];
        this.priceLinePrimitives.clear();
        this.markerPrimitives.clear();
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
        this.sessionProjectionCache = null;
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
        const store = series.renderStore();
        const exact = store.pointAtTime(time);
        if (exact !== null || mismatchDirection === MismatchDirection.None) return exact;
        const right = store.lowerBound(time);
        if (mismatchDirection === MismatchDirection.NearestLeft)
            return store.dataByIndex(right - 1, MismatchDirection.None);
        return store.dataByIndex(right, MismatchDirection.None);
    }

    seriesBarsInLogicalRange(series: Series, range: LogicalRange): BarsInfo | null {
        const fromTime = this.logicalToTime(range.from);
        const toTime = this.logicalToTime(range.to);
        const store = series.renderStore();
        if (fromTime === null || toTime === null || store.length === 0) return null;
        const fromIndex = store.lowerBound(fromTime);
        const exclusiveTo = store.upperBound(toTime);
        if (fromIndex >= exclusiveTo || fromIndex >= store.length) return null;
        const toIndex = exclusiveTo - 1;
        const from = store.dataByIndex(fromIndex);
        const to = store.dataByIndex(toIndex);
        if (from === null || to === null) return null;
        return {
            barsBefore: fromIndex,
            barsAfter: store.length - 1 - toIndex,
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
        if (this.disposed) return;
        this.primitiveAutoscaleCache = null;
        this.renderScheduler.invalidate(dirty);
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

    private timeScaleMode(): TimeScaleModeValue {
        return this.opts.timeScale?.mode
            ?? (this.opts.timeScale?.ordinal === true ? TimeScaleMode.Ordinal : TimeScaleMode.Continuous);
    }

    private ordinalMode(): boolean { return this.timeScaleMode() === TimeScaleMode.Ordinal; }

    private sessionProjection(): SessionTimeProjection | null {
        if (this.timeScaleMode() !== TimeScaleMode.SessionAware) return null;
        const calendar = this.opts.timeScale?.calendar;
        if (!isTradingCalendar(calendar)) return null;
        const kinds = this.opts.timeScale?.sessionKinds;
        const kindsKey = kinds?.join('\u0000') ?? '*';
        const week = 7 * 86_400;
        const padding = 32 * 86_400;
        const rangeFrom = Math.floor((Math.min(this.viewFrom, this.viewTo) - padding) / week) * week;
        const rangeTo = Math.ceil((Math.max(this.viewFrom, this.viewTo) + padding) / week) * week;
        const cached = this.sessionProjectionCache;
        if (cached !== null
            && cached.calendar === calendar
            && cached.kindsKey === kindsKey
            && cached.from === rangeFrom
            && cached.to === rangeTo) {
            return cached.projection;
        }
        const projection = new SessionTimeProjection(calendar, { from: rangeFrom, to: rangeTo }, kinds);
        this.sessionProjectionCache = {
            calendar,
            kindsKey,
            from: rangeFrom,
            to: rangeTo,
            projection,
        };
        return projection;
    }

    private timeToDomain(time: Time): number {
        if (this.ordinalMode()) return this.timeToLogical(time) ?? time;
        const projection = this.sessionProjection();
        return projection?.timeToTradingTime(time) ?? time;
    }

    private domainToTime(value: number): Time {
        if (this.ordinalMode()) return this.logicalToTime(value) ?? value;
        const projection = this.sessionProjection();
        return projection?.tradingTimeToTime(value) ?? value;
    }

    private timeDomainRange(): { from: number; to: number } {
        return {
            from: this.timeToDomain(this.viewFrom),
            to: this.timeToDomain(this.viewTo),
        };
    }

    private setTimeDomainRange(from: number, to: number): void {
        if (!Number.isFinite(from) || !Number.isFinite(to) || !(to > from)) return;
        const fromTime = this.domainToTime(from);
        const toTime = this.domainToTime(to);
        if (!Number.isFinite(fromTime) || !Number.isFinite(toTime) || !(toTime > fromTime)) return;
        this.clampView(fromTime, toTime);
    }

    private timeToX(t: Time): number {
        const range = this.timeDomainRange();
        const span = range.to - range.from || 1;
        return this.plotL() + ((this.timeToDomain(t) - range.from) / span) * this.plotW();
    }
    private xToTime(x: number): Time {
        const range = this.timeDomainRange();
        const value = range.from + ((x - this.plotL()) / this.plotW()) * ((range.to - range.from) || 1);
        return this.domainToTime(value);
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
        const candidates = pane.series.filter((series) => (
            series.visible && series.priceScaleId() === scaleId
        ));
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

        let primitiveMarginAbove = 0;
        let primitiveMarginBelow = 0;
        const paneApi = this.paneApiFor(pane);
        for (const contribution of this.primitiveAutoscaleEntries()) {
            if (contribution.pane !== paneApi || contribution.scaleId !== scaleId) continue;
            let rawMin = contribution.min;
            let rawMax = contribution.max;
            if (mode === PriceScaleMode.Logarithmic) {
                if (!(rawMax > 0)) continue;
                if (!(rawMin > 0)) rawMin = Math.max(1e-9, rawMax * 1e-6);
            }
            const reference = contribution.series === null
                ? baseValue
                : (baseValues.get(contribution.series) ?? baseValue);
            const first = priceToScale(rawMin, mode, reference);
            const last = priceToScale(rawMax, mode, reference);
            if (!Number.isFinite(first) || !Number.isFinite(last)) continue;
            min = Math.min(min, first, last);
            max = Math.max(max, first, last);
            primitiveMarginAbove = Math.max(primitiveMarginAbove, contribution.above);
            primitiveMarginBelow = Math.max(primitiveMarginBelow, contribution.below);
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
        const paneHeight = Math.max(1, (this.paneRect(pane)?.height ?? this.activePaneRect.height) - this.padT);
        ({ min: lo, max: hi } = applyAutoscalePixelMargins(
            lo,
            hi,
            primitiveMarginAbove,
            primitiveMarginBelow,
            paneHeight,
        ));
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

    private primitiveAutoscaleEntries(): readonly PrimitiveAutoscaleEntry[] {
        if (this.primitiveAutoscaleCache !== null) return this.primitiveAutoscaleCache;
        // An autoscale callback may legitimately ask the attached context for
        // a coordinate. That conversion needs base series bounds but must not
        // recursively invoke the same callback.
        if (this.primitiveAutoscaleComputing) return [];
        this.primitiveAutoscaleComputing = true;
        const range = this.getVisibleLogicalRange() ?? { from: 0, to: 0 };
        const entries: PrimitiveAutoscaleEntry[] = [];
        try {
            for (const attachment of this.primitiveHost.attachments()) {
                if (!this.primitiveAttachmentVisible(attachment.options)) continue;
                const provider = attachment.primitive.autoscaleInfo;
                if (provider === undefined) continue;
                const normalized = normalizeAutoscaleInfo(provider.call(attachment.primitive, range));
                if (normalized === null || attachment.options.pane === undefined) continue;
                entries.push(Object.freeze({
                    ...normalized,
                    pane: attachment.options.pane,
                    scaleId: attachment.options.priceScaleId
                        ?? attachment.options.series?.priceScaleId()
                        ?? 'right',
                    series: attachment.options.series instanceof Series
                        ? attachment.options.series
                        : null,
                }));
            }
        } finally {
            this.primitiveAutoscaleComputing = false;
        }
        this.primitiveAutoscaleCache = Object.freeze(entries);
        return this.primitiveAutoscaleCache;
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
        this.primitiveHost.updateAllViews();
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
                if (!s.visible) continue;
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
            const paneApi = this.paneApiFor(pane);
            const geometry = this.primitivePaneGeometry(rect, last);
            const primitiveTarget = new CanvasRenderTarget2D(
                ctx,
                this.width,
                this.height,
                this.dpr,
                geometry,
            );

            this.drawPrimitivePaneViews(paneApi, primitiveTarget, PrimitiveZOrder.Background);
            if (pane === this.model.mainPane) this.drawWatermark();
            this.drawGrid(primary);
            this.drawPrimitivePaneViews(paneApi, primitiveTarget, PrimitiveZOrder.Bottom);
            for (const s of pane.series) {
                if (!s.visible) continue;
                // Draw each series against bounds of ITS OWN scale. Overlay
                // scales remain independent inside their owning pane.
                const sid = s.priceScaleId();
                const sb = sid === 'right'
                    ? rb
                    : (sid === 'left' && hasLeft ? lb : this.priceBounds(sid, pane));
                this.drawSeries(s, sb);
            }
            this.drawPrimitivePaneViews(paneApi, primitiveTarget, PrimitiveZOrder.Normal);
            this.drawAxes(hasRight ? rb : null, hasLeft ? lb : null, last);
            this.drawPriceTags(rb, lb);
            this.drawPrimitivePriceAxisViews(paneApi);
            if (last) this.drawPrimitiveTimeAxisViews();
            ctx.restore();
        }

        ctx.fillStyle = this.opts.rightPriceScale?.borderColor ?? DEF_BORDER;
        for (const splitter of this.paneLayoutResult.splitters) {
            const y = Math.round(splitter.rect.y + splitter.rect.height / 2) + 0.5;
            ctx.fillRect(splitter.rect.x, y, splitter.rect.width, 1);
        }
        this.activatePane(this.model.mainPane);
    }

    private primitivePaneGeometry(rect: PaneLayoutRect, isLast: boolean): PrimitivePaneGeometry {
        return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            plot: {
                x: this.plotL(),
                y: this.plotT(),
                width: this.plotW(),
                height: this.plotH(),
            },
            isLast,
        };
    }

    private drawPrimitivePaneViews(
        pane: PaneApi,
        target: CanvasRenderTarget,
        layer: PrimitiveZOrderValue,
    ): void {
        for (const attachment of this.primitiveHost.attachments()) {
            if (!this.primitiveAttachmentVisible(attachment.options)
                || attachment.options.pane !== pane) continue;
            const views: readonly PrimitivePaneView[] = attachment.primitive.paneViews?.() ?? [];
            for (const view of views) {
                const viewLayer = view.zOrder();
                primitiveLayerRank(viewLayer);
                if (viewLayer !== layer) continue;
                const renderer = view.renderer();
                if (renderer === null) continue;

                const clip = view.clip?.() ?? PrimitivePaneViewClip.Plot;
                const clipRect = clip === PrimitivePaneViewClip.Pane ? target.pane : target.pane.plot;
                this.ctx.save();
                this.ctx.beginPath();
                this.ctx.rect(clipRect.x, clipRect.y, clipRect.width, clipRect.height);
                this.ctx.clip();
                try {
                    renderer.draw(target);
                } finally {
                    this.ctx.restore();
                }
            }
        }
    }

    private drawPrimitivePriceAxisViews(pane: PaneApi): void {
        for (const attachment of this.primitiveHost.attachments()) {
            if (!this.primitiveAttachmentVisible(attachment.options)
                || attachment.options.pane !== pane) continue;
            const views: readonly PrimitiveAxisView[] = attachment.primitive.priceAxisViews?.() ?? [];
            for (const view of views) {
                if (view.visible?.() === false) continue;
                const y = view.coordinate();
                if (y === null || !Number.isFinite(y) || y < this.plotT() || y > this.plotB()) continue;
                const scaleId = view.priceScaleId?.() ?? attachment.options.series?.priceScaleId() ?? 'right';
                this.drawPrimitivePriceAxisLabel(view, y, scaleId === 'left');
            }
        }
    }

    private drawPrimitivePriceAxisLabel(view: PrimitiveAxisView, y: number, left: boolean): void {
        const ctx = this.ctx;
        const text = view.text();
        if (text.length === 0) return;
        const background = view.backgroundColor();
        const foreground = view.textColor?.() ?? textOn(background);
        const height = 18;
        ctx.save();
        ctx.font = `10px ${this.opts.layout?.fontFamily ?? DEF_FONT}`;
        ctx.textBaseline = 'middle';
        const width = Math.ceil(ctx.measureText(text).width) + 12;
        const top = Math.max(this.plotT(), Math.min(this.plotB() - height, y - height / 2));
        const x = left ? Math.max(0, this.plotL() - width - 1) : this.plotR() + 1;
        ctx.fillStyle = background;
        ctx.fillRect(x, top, width, height);
        if (view.tickVisible?.() !== false) {
            ctx.strokeStyle = background;
            ctx.beginPath();
            if (left) {
                ctx.moveTo(this.plotL() - 5, Math.round(y) + 0.5);
                ctx.lineTo(this.plotL(), Math.round(y) + 0.5);
            } else {
                ctx.moveTo(this.plotR(), Math.round(y) + 0.5);
                ctx.lineTo(this.plotR() + 5, Math.round(y) + 0.5);
            }
            ctx.stroke();
        }
        ctx.fillStyle = foreground;
        ctx.textAlign = left ? 'right' : 'left';
        ctx.fillText(text, left ? this.plotL() - 7 : this.plotR() + 7, top + height / 2);
        ctx.restore();
    }

    private drawPrimitiveTimeAxisViews(): void {
        if (this.opts.timeScale?.visible === false) return;
        const ctx = this.ctx;
        for (const attachment of this.primitiveHost.attachments()) {
            if (!this.primitiveAttachmentVisible(attachment.options)) continue;
            const views: readonly PrimitiveAxisView[] = attachment.primitive.timeAxisViews?.() ?? [];
            for (const view of views) {
                if (view.visible?.() === false) continue;
                const x = view.coordinate();
                if (x === null || !Number.isFinite(x) || x < this.plotL() || x > this.plotR()) continue;
                const text = view.text();
                if (text.length === 0) continue;
                const background = view.backgroundColor();
                const foreground = view.textColor?.() ?? textOn(background);
                const height = Math.max(1, Math.min(18, this.padB - 2));
                ctx.save();
                ctx.font = `10px ${this.opts.layout?.fontFamily ?? DEF_FONT}`;
                const width = Math.ceil(ctx.measureText(text).width) + 12;
                const left = Math.max(this.plotL(), Math.min(this.plotR() - width, x - width / 2));
                const top = this.plotB() + 1;
                ctx.fillStyle = background;
                ctx.fillRect(left, top, width, height);
                if (view.tickVisible?.() !== false) {
                    ctx.strokeStyle = background;
                    ctx.beginPath();
                    ctx.moveTo(Math.round(x) + 0.5, this.plotB());
                    ctx.lineTo(Math.round(x) + 0.5, this.plotB() + 5);
                    ctx.stroke();
                }
                ctx.fillStyle = foreground;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(text, left + width / 2, top + height / 2);
                ctx.restore();
            }
        }
    }

    private drawOverlay(): void {
        const ctx = this.overlayCtx;
        this.ctx = ctx;
        ctx.clearRect(0, 0, this.width, this.height);
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
            const paneApi = this.paneApiFor(pane);
            const primitiveTarget = new CanvasRenderTarget2D(
                ctx,
                this.width,
                this.height,
                this.dpr,
                this.primitivePaneGeometry(rect, last),
            );
            this.drawPrimitivePaneViews(paneApi, primitiveTarget, PrimitiveZOrder.Top);
            this.drawCrosshair(rb, lb, last);
            this.drawClusterTip(rb, lb);
            ctx.restore();
        }
        this.activatePane(this.model.mainPane);
        this.ctx = this.baseCtx;
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
                const store = s.renderStore();
                const index = store.upperBound(this.viewTo) - 1;
                p = store.dataByIndex(index) ?? s.points[s.points.length - 1];
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
        if (this.timeScaleMode() === TimeScaleMode.SessionAware) {
            const range = this.timeDomainRange();
            const span = range.to - range.from;
            const reference = this.indexRefSeries();
            if (span > 0 && reference !== null) {
                const points = reference.renderStore()
                    .visibleRange(this.viewFrom, this.viewTo, 1).points;
                const stride = Math.max(1, Math.floor((points.length - 1) / 512));
                let domainStep = Infinity;
                for (let index = stride; index < points.length; index += stride) {
                    const delta = this.timeToDomain(points[index].time)
                        - this.timeToDomain(points[index - stride].time);
                    if (delta > 0) domainStep = Math.min(domainStep, delta / stride);
                }
                if (Number.isFinite(domainStep)) return this.plotW() * domainStep / span;
            }
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
        if (visible.length === 0 && s.definition.renderer.drawOutsideVisibleRange !== true) return;
        const context: SeriesRendererContext<AnyPoint, SeriesOptions> = {
            target: this.ctx,
            data: visible,
            allData: render.store.values,
            options: s.opts,
            priceRange: this.visiblePriceRange(b, s),
            visibleTimeRange: Object.freeze({ from: this.viewFrom, to: this.viewTo }),
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

    private axisTimeFormatter(): TimeAxisFormatter {
        const options = this.opts.timeScale;
        const locale = options?.locale ?? 'en-GB';
        const calendar = options?.calendar;
        const timeZone = options?.timeZone
            ?? (isTradingCalendar(calendar) ? calendar.schedule().timeZone : 'UTC');
        const timeVisible = options?.timeVisible === true;
        const secondsVisible = options?.secondsVisible === true;
        const custom = options?.formatter;
        const cached = this.timeAxisFormatterCache;
        if (cached !== null
            && cached.locale === locale
            && cached.timeZone === timeZone
            && cached.timeVisible === timeVisible
            && cached.secondsVisible === secondsVisible
            && cached.custom === custom) {
            return cached.formatter;
        }
        const formatter = new TimeAxisFormatter({
            locale,
            timeZone,
            timeVisible,
            secondsVisible,
            formatter: custom,
        });
        this.timeAxisFormatterCache = {
            locale,
            timeZone,
            timeVisible,
            secondsVisible,
            custom,
            formatter,
        };
        return formatter;
    }

    private fmtTime(t: Time): string {
        return this.axisTimeFormatter().formatCrosshair(t);
    }
    // Nice, boundary-aligned time ticks + the chosen step, so labels
    // land on round moments (month starts, day starts, …).
    private timeTicks(): { ticks: Time[]; step: number } {
        if (this.ordinalMode()) return this.ordinalTimeTicks();
        if (this.timeScaleMode() === TimeScaleMode.SessionAware) {
            const projected = this.sessionTimeTicks();
            if (projected !== null) return projected;
        }
        const span = this.viewTo - this.viewFrom || 1;
        const target = Math.max(2, Math.floor(this.plotW() / 80));
        const step = this.timeTickStep(span, target);
        const start = Math.ceil(this.viewFrom / step) * step;
        const ticks: Time[] = [];
        for (let t = start; t <= this.viewTo; t += step) ticks.push(t);
        return { ticks, step };
    }

    private timeTickStep(span: number, target: number): number {
        const S = [60, 300, 900, 1800, 3600, 7200, 14400, 21600, 43200,
                   86400, 172800, 604800, 1209600, 2592000, 5184000,
                   7776000, 15552000, 31536000];
        const raw = span / target;
        let step = S[S.length - 1];
        for (const s of S) { if (s >= raw) { step = s; break; } }
        return step;
    }

    private sessionTimeTicks(): { ticks: Time[]; step: number } | null {
        const projection = this.sessionProjection();
        if (projection === null || !projection.hasSessions) return null;
        const range = this.timeDomainRange();
        const span = range.to - range.from;
        if (!(span > 0)) return null;
        const target = Math.max(2, Math.floor(this.plotW() / 80));
        const step = this.timeTickStep(span, target);
        const start = Math.ceil(range.from / step) * step;
        const ticks: Time[] = [];
        for (let value = start; value <= range.to; value += step) {
            const time = projection.tradingTimeToTime(value);
            if (time !== null && time >= this.viewFrom && time <= this.viewTo
                && ticks[ticks.length - 1] !== time) {
                ticks.push(time);
            }
        }
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
        return this.axisTimeFormatter().formatTick(t, step);
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

        // Magnet mode uses the same renderer-defined values as drawing tools.
        let crossY = this.mouseY;
        const crossMode = ch.mode ?? CrosshairMode.Normal;
        if (crossMode === CrosshairMode.Magnet && st !== null) {
            let bestDistance = Infinity;
            for (const s of this.activeSeries) {
                const p = s.renderData().store.pointAtTime(st);
                if (p === null) continue;
                const b = s.priceScaleId() === 'left' ? lb : rb;
                for (const v of s.magnetValues(p)) {
                    const y = this.valueToY(v, b, s);
                    const d = Math.abs(y - this.mouseY);
                    if (d < bestDistance) {
                        bestDistance = d;
                        crossY = y;
                    }
                }
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
        return primary.renderStore().nearest(t)?.time;
    }

    private crosshairTime(x: number): Time | null {
        return this.controlledCrosshairTime ?? this.snapTime(x) ?? null;
    }

    private hoveredCrosshairObject(
        pane: PaneModel<Series> | null,
        seriesData: ReadonlyMap<ISeriesApi<any, any>, TimedSeriesData>,
        x: number,
        y: number,
        sourceEvent: PointerEvent | MouseEvent | null,
        knownPrimitiveHit?: PrimitiveHoveredObject | null,
    ): HoveredObject | null {
        const primitiveHit = knownPrimitiveHit === undefined
            ? this.hitTestPrimitive(x, y, sourceEvent)
            : knownPrimitiveHit;
        if (primitiveHit !== null) {
            if (isPriceLinePrimitiveHitData(primitiveHit.data)) {
                return {
                    type: 'price-line',
                    series: primitiveHit.data.series,
                    priceLine: primitiveHit.data.priceLine,
                    id: primitiveHit.data.priceLine.options().id ?? null,
                };
            }
            return primitiveHit;
        }
        if (pane === null || this.inTimeGutter(y) || this.inPriceGutter(x)) return null;

        this.activatePane(pane);
        let closest: SeriesHoveredObject | null = null;
        let closestDistance = 8;
        for (const series of pane.series) {
            if (!series.visible) continue;
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

    private crosshairEvent(
        sourceEvent: PointerEvent | MouseEvent | null,
        knownPrimitiveHit?: PrimitiveHoveredObject | null,
    ): CrosshairEvent {
        if (this.mouseX === null || this.mouseY === null) {
            return {
                time: null,
                logical: null,
                point: null,
                paneId: null,
                price: null,
                seriesData: new Map(),
                hoveredObject: null,
                sourceEvent,
            };
        }
        const time = this.crosshairTime(this.mouseX);
        const pane = this.paneAt(this.mouseY);
        const paneSeries = pane === null ? null : this.mainSeries(pane);
        const price = pane === null
            ? null
            : this.yToPrice(this.mouseY, 'right', pane, paneSeries ?? undefined);
        const seriesData = new Map<ISeriesApi<any, any>, TimedSeriesData>();
        if (time !== null) {
            for (const series of this.series) {
                if (!series.visible) continue;
                const point = series.renderData().store.pointAtTime(time);
                if (point !== null) seriesData.set(series, point);
            }
        }
        return {
            time,
            logical: time === null ? null : this.timeToLogical(time),
            point: { x: this.mouseX, y: this.mouseY },
            paneId: pane?.id ?? null,
            price,
            seriesData,
            hoveredObject: this.hoveredCrosshairObject(
                pane,
                seriesData,
                this.mouseX,
                this.mouseY,
                sourceEvent,
                knownPrimitiveHit,
            ),
            sourceEvent,
        };
    }

    private emitCrosshair(
        sourceEvent: PointerEvent | MouseEvent | null,
        knownPrimitiveHit?: PrimitiveHoveredObject | null,
    ): void {
        const event = this.crosshairEvent(sourceEvent, knownPrimitiveHit);
        for (const listener of this.crosshairListeners) listener(event);
    }

    private hitTestPrimitive(
        x: number,
        y: number,
        sourceEvent: PointerEvent | MouseEvent | null,
    ): PrimitiveHoveredObject | null {
        const location = this.inTimeGutter(y)
            ? PrimitiveHitTestLocation.TimeAxis
            : this.inPriceGutter(x)
                ? PrimitiveHitTestLocation.PriceAxis
                : PrimitiveHitTestLocation.Pane;
        const pointedPane = location === PrimitiveHitTestLocation.TimeAxis ? null : this.paneAt(y);
        if (pointedPane === null && location !== PrimitiveHitTestLocation.TimeAxis) return null;
        const pointedPaneApi = pointedPane === null ? null : this.paneApiFor(pointedPane);
        const point = Object.freeze({ x, y });
        const candidates: HitTestCandidate[] = [];

        const attachments = this.primitiveHost.attachments();
        for (let index = 0; index < attachments.length; index++) {
            const attachment = attachments[index];
            if (!this.primitiveAttachmentVisible(attachment.options)) continue;
            const test = attachment.primitive.hitTest;
            const pane = attachment.options.pane;
            if (test === undefined || pane === undefined) continue;
            if (location !== PrimitiveHitTestLocation.TimeAxis && pane !== pointedPaneApi) continue;

            let zOrder: PrimitiveZOrderValue = location === PrimitiveHitTestLocation.Pane
                ? PrimitiveZOrder.Normal
                : PrimitiveZOrder.Top;
            if (location === PrimitiveHitTestLocation.Pane) {
                for (const view of attachment.primitive.paneViews?.() ?? []) {
                    const candidateLayer = view.zOrder();
                    if (primitiveLayerRank(candidateLayer) > primitiveLayerRank(zOrder))
                        zOrder = candidateLayer;
                }
            }
            const context: HitTestContext = Object.freeze({
                pane,
                series: attachment.options.series ?? null,
                priceScaleId: attachment.options.priceScaleId
                    ?? attachment.options.series?.priceScaleId()
                    ?? 'right',
                location,
                sourceEvent,
            });
            candidates.push({
                primitive: attachment.primitive,
                attachmentOrder: index,
                zOrder,
                test: () => test.call(attachment.primitive, point, context),
            });
        }

        const hit = this.hitTestEngine.hitTest(candidates);
        return hit === null ? null : Object.freeze({
            type: 'primitive',
            primitive: hit.primitive,
            id: hit.id,
            role: hit.role,
            cursor: hit.cursor,
            zOrder: hit.zOrder,
            data: hit.data,
            interaction: hit.interaction,
        });
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

    private interactionObject(hit: PrimitiveHoveredObject): InteractionObjectRef {
        return Object.freeze({ primitive: hit.primitive, id: hit.id, role: hit.role });
    }

    private primitiveInteractionEvent(
        hit: PrimitiveHoveredObject,
        movement: InteractionMovement,
        sourceEvent: PointerEvent,
    ): PrimitiveInteractionEvent {
        return Object.freeze({
            point: movement.point,
            startPoint: movement.startPoint,
            delta: movement.delta,
            totalDelta: movement.totalDelta,
            hit: Object.freeze({ id: hit.id, role: hit.role, data: hit.data }),
            sourceEvent,
        });
    }

    private initialInteractionMovement(x: number, y: number): InteractionMovement {
        const point = Object.freeze({ x, y });
        return Object.freeze({
            point,
            startPoint: point,
            delta: Object.freeze({ x: 0, y: 0 }),
            totalDelta: Object.freeze({ x: 0, y: 0 }),
            state: this.interactionController.snapshot().state,
            started: false,
        });
    }

    private dispatchPrimitivePointer(
        method: 'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel',
        hit: PrimitiveHoveredObject,
        movement: InteractionMovement,
        sourceEvent: PointerEvent,
    ): void {
        const callback = hit.primitive[method];
        if (callback === undefined) return;
        try {
            callback.call(hit.primitive, this.primitiveInteractionEvent(hit, movement, sourceEvent));
        } catch { /* a primitive callback cannot strand the shared gesture */ }
    }

    private bindPointer(): void {
        this.listen<PointerEvent>(this.canvas, 'pointermove', (e) => {
            const r = this.canvas.getBoundingClientRect();
            this.mouseX = e.clientX - r.left;
            this.mouseY = e.clientY - r.top;
            this.controlledCrosshairTime = null;
            const pointerPane = this.paneAt(this.mouseY);
            if (pointerPane !== null) this.activatePane(pointerPane);
            const point = { x: this.mouseX, y: this.mouseY };
            if (this.splitterDrag !== null) {
                this.interactionController.pointerMove(point);
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
            if (this.scaleDrag !== null) {
                const movement = this.interactionController.pointerMove(point);
                if (movement !== null && this.scaleDrag.kind === 'price') {
                    // drag up → stretch (zoom in), drag down → compress
                    const pane = this.scaleDrag.pane;
                    pane.priceZoom = Math.min(12, Math.max(
                        0.15,
                        pane.priceZoom * Math.exp(-movement.delta.y * 0.006),
                    ));
                } else if (movement !== null) {
                    // drag left → expand time (zoom in), right → compress;
                    // anchored at the right edge (industry-standard behaviour).
                    const range = this.timeDomainRange();
                    const span = range.to - range.from;
                    const nextSpan = Math.max(1, span * Math.exp(movement.delta.x * 0.004));
                    this.setTimeDomainRange(range.to - nextSpan, range.to);
                    this.emitRange();
                }
                this.scheduleDraw();
                return;
            }
            if (this.activePrimitiveInteraction !== null) {
                const active = this.activePrimitiveInteraction;
                const movement = this.interactionController.pointerMove(point);
                if (movement !== null) {
                    active.last = movement.point;
                    if (movement.state === InteractionState.DraggingBody
                        || movement.state === InteractionState.DraggingHandle) {
                        this.dispatchPrimitivePointer('onPointerMove', active.hit, movement, e);
                        this.scheduleDraw(RenderDirty.All);
                    } else {
                        this.scheduleDraw(RenderDirty.Overlay);
                    }
                }
                this.canvas.style.cursor = movement?.state === InteractionState.DraggingBody
                    || movement?.state === InteractionState.DraggingHandle
                    ? 'grabbing'
                    : active.hit.cursor;
                this.emitCrosshair(e, active.hit);
                return;
            }
            const primitiveHit = this.hitTestPrimitive(this.mouseX, this.mouseY, e);
            this.interactionController.hover(primitiveHit === null ? null : this.interactionObject(primitiveHit));
            const movement = this.interactionController.pointerMove(point);
            const drawing = this.interactionController.snapshot().state === InteractionState.Drawing;
            this.canvas.style.cursor = drawing ? 'crosshair'
                : this.splitterAt(this.mouseX, this.mouseY) !== null ? 'row-resize'
                : this.inTimeGutter(this.mouseY) ? 'ew-resize'
                : this.inPriceGutter(this.mouseX) ? 'ns-resize'
                : movement?.state === InteractionState.Panning ? 'grabbing'
                : primitiveHit?.cursor ?? 'default';
            if (this.placement !== null && this.modifierHeld) this.updatePlacementPreview();   // order-placement preview follows the cursor
            let viewChanged = false;
            if (movement?.state === InteractionState.Panning && this.dragPanEnabled) {
                const dx = movement.delta.x;
                const range = this.timeDomainRange();
                const shift = -(dx / this.plotW()) * (range.to - range.from);
                this.setTimeDomainRange(range.from + shift, range.to + shift);
                this.emitRange();
                viewChanged = true;
            }
            this.emitCrosshair(e, primitiveHit);
            this.scheduleDraw(viewChanged ? RenderDirty.All : RenderDirty.Overlay);
        });
        this.listen<PointerEvent>(this.canvas, 'pointerleave', (e) => {
            this.mouseX = null;
            this.mouseY = null;
            this.controlledCrosshairTime = null;
            this.canvas.style.cursor = 'default';
            this.interactionController.hover(null);
            this.clearPlacementPreview();   // no cursor over the plot → no placement preview
            this.emitCrosshair(e);
            this.scheduleDraw(RenderDirty.Overlay);
        });
        this.listen<PointerEvent>(this.canvas, 'pointerdown', (e) => {
            // capture so a finger / mouse leaving the canvas mid-drag
            // keeps sending us pointermove events
            try { (this.canvas as Element).setPointerCapture(e.pointerId); } catch { /* unsupported */ }
            const r = this.canvas.getBoundingClientRect();
            const mx = e.clientX - r.left;
            const my = e.clientY - r.top;
            this.mouseX = mx;
            this.mouseY = my;
            this.downX = mx; this.downY = my; this.downButton = e.button; this.pointerDown = true;
            this.gesturePane = this.paneAt(my);
            this.drawingPointerDown = this.interactionController.snapshot().state === InteractionState.Drawing;
            if (this.drawingPointerDown) {
                this.canvas.style.cursor = 'crosshair';
                return;
            }
            const primitiveHit = this.hitTestPrimitive(mx, my, e);
            this.interactionController.hover(primitiveHit === null ? null : this.interactionObject(primitiveHit));
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
                    this.interactionController.pointerDown({ x: mx, y: my }, { kind: 'scale' });
                    this.canvas.style.cursor = 'row-resize';
                }
                return;
            }
            if (primitiveHit?.interaction.consumePointer === true) {
                const point = Object.freeze({ x: mx, y: my });
                this.activePrimitiveInteraction = { hit: primitiveHit, start: point, last: point };
                this.interactionController.pointerDown(point, {
                    kind: 'primitive',
                    object: this.interactionObject(primitiveHit),
                    selectable: primitiveHit.interaction.selectable,
                    draggable: primitiveHit.interaction.draggable,
                });
                this.dispatchPrimitivePointer(
                    'onPointerDown',
                    primitiveHit,
                    this.initialInteractionMovement(mx, my),
                    e,
                );
                this.canvas.style.cursor = primitiveHit.cursor;
                return;
            }
            if (this.inTimeGutter(my)) {
                // grab the time axis → horizontal stretch
                this.scaleDrag = { kind: 'time' };
                this.interactionController.pointerDown({ x: mx, y: my }, { kind: 'scale' });
            } else if (this.inPriceGutter(mx)) {
                // grab the price axis → vertical stretch, not a time pan
                if (this.gesturePane !== null) {
                    this.scaleDrag = { kind: 'price', pane: this.gesturePane };
                    this.interactionController.pointerDown({ x: mx, y: my }, { kind: 'scale' });
                }
            } else {
                this.interactionController.pointerDown({ x: mx, y: my }, { kind: 'pane' });
            }
        });
        const finishGesture = (e: PointerEvent, cancelled = false): void => {
            if (!this.pointerDown) return;   // ignore releases from a gesture that began off-canvas
            this.pointerDown = false;
            const drawingGesture = this.drawingPointerDown;
            this.drawingPointerDown = false;
            const point = {
                x: this.mouseX ?? this.downX,
                y: this.mouseY ?? this.downY,
            };
            if (this.splitterDrag !== null) {
                const drag = this.splitterDrag;
                this.splitterDrag = null;
                const before = this.model.paneById(drag.splitter.beforePaneId);
                const after = this.model.paneById(drag.splitter.afterPaneId);
                if (before !== undefined && after !== undefined) {
                    const beforePaneId = before.id;
                    const afterPaneId = after.id;
                    const finalBeforeHeight = before.height;
                    const finalAfterHeight = after.height;
                    this.applyPanePairHeights(
                        beforePaneId,
                        drag.beforeHeight,
                        afterPaneId,
                        drag.afterHeight,
                    );
                    if (!cancelled && (Math.abs(finalBeforeHeight - drag.beforeHeight) > 1e-9
                        || Math.abs(finalAfterHeight - drag.afterHeight) > 1e-9)) {
                        this.commands.execute({
                            label: 'Resize panes',
                            execute: () => this.applyPanePairHeights(
                                beforePaneId,
                                finalBeforeHeight,
                                afterPaneId,
                                finalAfterHeight,
                            ),
                            undo: () => this.applyPanePairHeights(
                                beforePaneId,
                                drag.beforeHeight,
                                afterPaneId,
                                drag.afterHeight,
                            ),
                        });
                    }
                }
                this.gesturePane = null;
                if (cancelled) this.interactionController.cancel();
                else this.interactionController.pointerUp(point);
                this.canvas.style.cursor = 'default';
                return;
            }
            if (this.activePrimitiveInteraction !== null) {
                const active = this.activePrimitiveInteraction;
                const movement = cancelled
                    ? Object.freeze({
                        point: Object.freeze({ ...point }),
                        startPoint: active.start,
                        delta: Object.freeze({ x: point.x - active.last.x, y: point.y - active.last.y }),
                        totalDelta: Object.freeze({ x: point.x - active.start.x, y: point.y - active.start.y }),
                        state: this.interactionController.snapshot().state,
                        started: false,
                    })
                    : this.interactionController.pointerUp(point);
                if (cancelled) this.interactionController.cancel();
                if (movement !== null) this.dispatchPrimitivePointer(
                    cancelled ? 'onPointerCancel' : 'onPointerUp',
                    active.hit,
                    movement,
                    e,
                );
                this.activePrimitiveInteraction = null;
                this.gesturePane = null;
                this.canvas.style.cursor = active.hit.cursor;
                this.scheduleDraw(RenderDirty.All);
                return;
            }
            if (this.scaleDrag !== null) {
                this.scaleDrag = null;
                this.gesturePane = null;
                if (cancelled) this.interactionController.cancel();
                else this.interactionController.pointerUp(point);
                this.canvas.style.cursor = 'default';
                return;
            }
            const moved = this.mouseX !== null && this.mouseY !== null &&
                Math.hypot(this.mouseX - this.downX, this.mouseY - this.downY) > 4;
            if (cancelled) {
                if (!drawingGesture) this.interactionController.cancel();
            } else if (!drawingGesture) {
                this.interactionController.pointerUp(point);
            }
            // A press-release that did not move and did not grab a line is a click (a pan that never
            // moved still counts as a click).
            if (!cancelled && !moved && this.mouseX !== null && this.mouseY !== null &&
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
                    const crosshair = this.crosshairEvent(e);
                    const c: ChartClick = {
                        price, time: time ?? null, point: { x: this.mouseX, y: this.mouseY },
                        paneId: pane.id,
                        seriesData: crosshair.seriesData,
                        button: this.downButton,
                        ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey,
                        hoveredObject: crosshair.hoveredObject,
                    };
                    for (const cb of this.clickListeners) { try { cb(c); } catch { /* */ } }
                }
            }
            this.gesturePane = null;
        };
        // window (not canvas) so a release off the plot still ends the gesture; the pointerDown
        // guard inside finishGesture keeps unrelated global releases from being processed.
        this.listen<PointerEvent>(window, 'pointerup', (e) => finishGesture(e));
        this.listen<PointerEvent>(window, 'pointercancel', (e) => finishGesture(e, true));
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
                const pivot = this.timeToDomain(this.xToTime(px));
                const range = this.timeDomainRange();
                // Smooth, delta-proportional zoom (no fixed 1.15 jumps) —
                // same fix as the diagram. deltaY>0 widens (zoom out).
                const factor = Math.exp(e.deltaY * 0.0015);
                const nf = pivot - (pivot - range.from) * factor;
                const nt = pivot + (range.to - pivot) * factor;
                this.setTimeDomainRange(nf, nt);
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
                const range = this.timeDomainRange();
                pinchSpan = range.to - range.from;
                const midX = (x0 + x1) / 2;
                pinchPivot = this.timeToDomain(this.xToTime(midX));
                pinchRatio = (midX - this.plotL()) / this.plotW();
                pinching = true;
                this.scaleDrag = null;
                this.interactionController.cancel();
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
                this.setTimeDomainRange(nf, nt);
                this.emitRange();
                this.scheduleDraw();
            }
        }, { passive: false });
        const endPinch = (): void => { pinching = false; };
        this.listen(this.canvas, 'touchend', endPinch);
        this.listen(this.canvas, 'touchcancel', endPinch);
    }
}

function cloneChartOptions(options: ChartOptions): Readonly<ChartOptions> {
    return Object.freeze({
        ...options,
        layout: options.layout === undefined ? undefined : Object.freeze({
            ...options.layout,
            background: options.layout.background === undefined
                ? undefined
                : Object.freeze({ ...options.layout.background }),
        }),
        watermark: options.watermark === undefined
            ? undefined : Object.freeze({ ...options.watermark }),
        grid: options.grid === undefined ? undefined : Object.freeze({
            vertLines: options.grid.vertLines === undefined
                ? undefined : Object.freeze({ ...options.grid.vertLines }),
            horzLines: options.grid.horzLines === undefined
                ? undefined : Object.freeze({ ...options.grid.horzLines }),
        }),
        rightPriceScale: cloneChartScaleOptions(options.rightPriceScale),
        leftPriceScale: cloneChartScaleOptions(options.leftPriceScale),
        timeScale: options.timeScale === undefined ? undefined : Object.freeze({
            ...options.timeScale,
            sessionKinds: options.timeScale.sessionKinds === undefined
                ? undefined : Object.freeze([...options.timeScale.sessionKinds]),
        }),
        crosshair: options.crosshair === undefined ? undefined : Object.freeze({
            ...options.crosshair,
            vertLine: options.crosshair.vertLine === undefined
                ? undefined : Object.freeze({ ...options.crosshair.vertLine }),
            horzLine: options.crosshair.horzLine === undefined
                ? undefined : Object.freeze({ ...options.crosshair.horzLine }),
        }),
        handleScroll: typeof options.handleScroll === 'object' && options.handleScroll !== null
            ? Object.freeze({ ...options.handleScroll }) : options.handleScroll,
        handleScale: typeof options.handleScale === 'object' && options.handleScale !== null
            ? Object.freeze({ ...options.handleScale }) : options.handleScale,
    });
}

function cloneChartScaleOptions(
    options: ChartOptions['rightPriceScale'],
): ChartOptions['rightPriceScale'] {
    return options === undefined ? undefined : Object.freeze({
        ...options,
        scaleMargins: options.scaleMargins === undefined
            ? undefined : Object.freeze({ ...options.scaleMargins }),
    });
}

// ---- public factory surface (the `SSChart` global) --------
export function createChart(container: HTMLElement, options: ChartOptions = {}): IChartApi {
    return new ChartImpl(container, options);
}

export function createSeriesMarkers(series: ISeriesApi, markers: SeriesMarker[] = []): ISeriesMarkersPlugin {
    const internal = series as Series;
    if (!(internal instanceof Series) || internal.chart === null)
        throw new Error('sschart: marker series does not belong to an active chart');
    const plugin = internal.chart.seriesMarkers(internal);
    plugin.setMarkers(markers);
    return plugin;
}

export const version = 'sschart-experimental-0.1';
