// Public API module: index.d.ts
export * from './core/chart-api.js';
export * from './primitives/horizontal-line.js';
export * from './primitives/trend-line.js';
export * from './primitives/session-shading.js';
export * from './data/index.js';
export * from './time/index.js';
export * from './indicators/index.js';
export * from './drawings/index.js';
export * from './persistence/index.js';
export * from './workspace/index.js';
export * from './orderflow/index.js';

// Public API module: core/chart-api.d.ts
import { type TimeScaleFormatter } from '../time/time-axis-formatter.js';
import type { ITradingCalendar, TradingSessionKind } from '../time/trading-calendar.js';
import { type PaneOptions } from './model/pane-model.js';
import { type BarsInfo, type MismatchDirectionValue } from './model/series-store.js';
import { type ICommandStack } from './interaction/command-stack.js';
import { type InteractionStateSnapshot } from './interaction/interaction-controller.js';
import type { IChartPrimitive, PrimitiveAttachOptions, PrimitiveInteractionOptions, PrimitiveHitTestRole as PrimitiveHitTestRoleValue, PrimitiveZOrder as PrimitiveZOrderValue } from './primitives/primitive-api.js';
import type { TimeRange } from './scale/time-scale.js';
import { type SeriesDefinition, type TimedSeriesData } from '../series/registry.js';
export type { TimeRange } from './scale/time-scale.js';
export type { PaneOptions, PaneState } from './model/pane-model.js';
export { MismatchDirection } from './model/series-store.js';
export type { BarsInfo, MismatchDirectionValue } from './model/series-store.js';
export type { DataChangeKind, DataChangeSet } from './model/data-change-set.js';
export type { AutoscaleInfo, BitmapCoordinatesRenderingScope, CanvasRenderTarget, HitTestContext, IChartPrimitive, IPrimitiveRenderer, MediaCoordinatesRenderingScope, PrimitiveAxisView, PrimitiveAttachedContext, PrimitiveAttachOptions, PrimitiveDisposable, PrimitivePaneGeometry, PrimitivePaneView, PrimitiveHit, PrimitiveInteractionEvent, PrimitiveInteractionOptions, PrimitiveRect, PrimitiveSize, PrimitiveTheme, } from './primitives/primitive-api.js';
export { PrimitiveHitTestLocation, PrimitiveHitTestRole, PrimitivePaneViewClip, PrimitiveZOrder, } from './primitives/primitive-api.js';
export { InteractionState } from './interaction/interaction-controller.js';
export type { InteractionObjectRef, InteractionStateSnapshot, } from './interaction/interaction-controller.js';
export { CommandStack } from './interaction/command-stack.js';
export type { CommandStackListener, CommandStackSnapshot, ICommand, ICommandStack, } from './interaction/command-stack.js';
export { getSeriesDefinition, getSeriesTypes, registerSeries, seriesRendererRegistry, unregisterSeries, } from '../series/registry.js';
export type { CustomSeriesDefinition, IIncrementalSeriesDataProcessor, IncrementalSeriesDataProcessorFactory, ISeriesRenderer, PreparedSeriesData, SeriesDefinition, SeriesDataProcessor, SeriesDataProcessorPatch, SeriesDataUpdateKind, SeriesPriceRange, SeriesRendererContext, SeriesRendererPane, SeriesRendererTheme, TimedSeriesData, } from '../series/registry.js';
export type Time = number;
export interface WhitespaceData {
    time: Time;
}
export interface CandlestickData {
    time: Time;
    open: number;
    high: number;
    low: number;
    close: number;
}
export interface LineData {
    time: Time;
    value: number;
}
export interface HistogramData {
    time: Time;
    value: number;
    color?: string;
}
export interface AreaData {
    time: Time;
    value: number;
}
export interface BandData {
    time: Time;
    value: number;
    upper: number;
    lower: number;
}
/** @deprecated Approximate candle-volume profile input. Use exact orderflow FootprintBar levels. */
export interface VolumeProfileData extends CandlestickData {
    vol?: number;
}
/** @deprecated Unclassified total volume. It is not exact bid/ask footprint data. */
export interface PriceLevelData {
    price: number;
    vol: number;
}
/** @deprecated Legacy approximate cluster input. Use FootprintBar and FootprintSeries. */
export interface ClusterData {
    time: Time;
    high: number;
    low: number;
    open?: number;
    close?: number;
    levels: readonly PriceLevelData[];
}
export type SeriesKind = 'Candlestick' | 'Bar' | 'Line' | 'Histogram' | 'Area' | 'Band' | 'PointFigure' | 'Renko' | 'VolumeProfile' | 'Cluster' | 'Box';
export declare const CandlestickSeries: SeriesDefinition<CandlestickData, SeriesOptions>;
export declare const BarSeries: SeriesDefinition<CandlestickData, SeriesOptions>;
export declare const LineSeries: SeriesDefinition<LineData, SeriesOptions>;
export declare const HistogramSeries: SeriesDefinition<HistogramData, SeriesOptions>;
export declare const AreaSeries: SeriesDefinition<AreaData, SeriesOptions>;
export declare const BandSeries: SeriesDefinition<BandData, SeriesOptions>;
export declare const PointFigureSeries: SeriesDefinition<CandlestickData, SeriesOptions>;
export declare const RenkoSeries: SeriesDefinition<CandlestickData, SeriesOptions>;
/** @deprecated Candle-only input is unsupported. Use ExactVolumeProfileSeries with FootprintBar. */
export declare const VolumeProfileSeries: SeriesDefinition<VolumeProfileData, SeriesOptions>;
export declare const ClusterSeries: SeriesDefinition<ClusterData, SeriesOptions>;
export declare const BoxSeries2: SeriesDefinition<ClusterData, SeriesOptions>;
export declare const ColorType: {
    readonly Solid: 'solid';
    readonly VerticalGradient: 'gradient';
};
export declare const LineStyle: {
    readonly Solid: 0;
    readonly Dotted: 1;
    readonly Dashed: 2;
    readonly LargeDashed: 3;
    readonly SparseDotted: 4;
};
export type LineStyleValue = typeof LineStyle[keyof typeof LineStyle];
export declare const CrosshairMode: {
    readonly Magnet: 0;
    readonly Normal: 1;
};
export type CrosshairModeValue = typeof CrosshairMode[keyof typeof CrosshairMode];
export declare const PriceScaleMode: {
    readonly Normal: 0;
    readonly Logarithmic: 1;
    readonly Percentage: 2;
    readonly IndexedTo100: 3;
};
export type PriceScaleModeValue = typeof PriceScaleMode[keyof typeof PriceScaleMode];
export declare const TimeScaleMode: {
    readonly Continuous: 'continuous';
    readonly Ordinal: 'ordinal';
    readonly SessionAware: 'session-aware';
};
export type TimeScaleModeValue = typeof TimeScaleMode[keyof typeof TimeScaleMode];
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
    onClose?: () => void;
    anchored?: boolean;
    draggable?: boolean;
    onDrag?: (price: number) => void;
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
export interface PriceFormat {
    type?: 'price' | 'volume' | 'percent';
    precision?: number;
    minMove?: number;
}
export interface SeriesOptions {
    upColor?: string;
    downColor?: string;
    borderVisible?: boolean;
    borderUpColor?: string;
    borderDownColor?: string;
    wickUpColor?: string;
    wickDownColor?: string;
    color?: string;
    lineColor?: string;
    lineWidth?: number;
    lineStyle?: LineStyleValue;
    lineVisible?: boolean;
    pointMarkersVisible?: boolean;
    pointMarkersRadius?: number;
    topColor?: string;
    bottomColor?: string;
    upperColor?: string;
    lowerColor?: string;
    fillColor?: string;
    positiveFillColor?: string;
    negativeFillColor?: string;
    upperLineWidth?: number;
    lowerLineWidth?: number;
    upperLineStyle?: LineStyleValue;
    lowerLineStyle?: LineStyleValue;
    upperLineVisible?: boolean;
    lowerLineVisible?: boolean;
    fillVisible?: boolean;
    base?: number;
    /** Stable persistence key. Generated once when omitted and immutable afterwards. */
    id?: string;
    /** False for runtime-owned output series (for example indicator painter internals). */
    persist?: boolean;
    /** False hides rendering, autoscale, crosshair values and series-owned primitives. */
    visible?: boolean;
    priceScaleId?: string;
    priceLineVisible?: boolean;
    lastValueVisible?: boolean;
    priceLineSource?: 'lastBar' | 'lastVisible';
    priceFormat?: PriceFormat;
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
    width?: number;
    height?: number;
    autoSize?: boolean;
    commandHistoryLimit?: number;
    layout?: {
        background?: {
            type?: string;
            color?: string;
        };
        textColor?: string;
        fontFamily?: string;
        attributionLogo?: boolean;
        fontSize?: number;
    };
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
    grid?: {
        vertLines?: {
            color?: string;
            visible?: boolean;
        };
        horzLines?: {
            color?: string;
            visible?: boolean;
        };
    };
    rightPriceScale?: {
        borderColor?: string;
        scaleMargins?: {
            top?: number;
            bottom?: number;
        };
    };
    leftPriceScale?: {
        borderColor?: string;
        scaleMargins?: {
            top?: number;
            bottom?: number;
        };
    };
    timeScale?: TimeScaleOptions;
    crosshair?: {
        vertLine?: {
            color?: string;
            visible?: boolean;
        };
        horzLine?: {
            color?: string;
            visible?: boolean;
        };
        mode?: CrosshairModeValue;
    };
    handleScroll?: boolean | {
        mouseWheel?: boolean;
        pressedMouseMove?: boolean;
    };
    handleScale?: boolean | {
        axisPressedMouseMove?: boolean;
        mouseWheel?: boolean;
    };
}
export declare function renkoBars(candles: ReadonlyArray<CandlestickData>, boxSize?: number): CandlestickData[];
export declare function pnfBars(candles: ReadonlyArray<CandlestickData>, boxSize?: number, reversal?: number): CandlestickData[];
export interface PriceScaleOptions {
    scaleMargins?: {
        top?: number;
        bottom?: number;
    };
    mode?: PriceScaleModeValue;
    autoScale?: boolean;
}
export interface ResolvedPriceScaleOptions {
    readonly scaleMargins: Readonly<{
        top: number;
        bottom: number;
    }>;
    readonly mode: PriceScaleModeValue;
    readonly autoScale: boolean;
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
    readonly point: {
        x: number;
        y: number;
    } | null;
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
export interface ChartClick {
    price: number | null;
    time: Time | null;
    point: {
        x: number;
        y: number;
    };
    paneId: string;
    seriesData: ReadonlyMap<ISeriesApi<any, any>, TimedSeriesData>;
    button: number;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    metaKey: boolean;
    hoveredObject: HoveredObject | null;
}
export type ClickListener = (c: ChartClick) => void;
export type InteractionStateListener = (state: InteractionStateSnapshot) => void;
export interface OrderPlace {
    price: number;
    button: number;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    metaKey: boolean;
}
export type OrderPlaceListener = (e: OrderPlace) => void;
export interface LogicalRange {
    from: number;
    to: number;
}
export type LogicalRangeListener = (range: LogicalRange | null) => void;
export interface IPriceScaleApi {
    applyOptions(patch: PriceScaleOptions): void;
    options(): ResolvedPriceScaleOptions;
}
export interface ISeriesMarkersPlugin {
    setMarkers(markers: SeriesMarker[]): void;
}
export interface ISeriesApi<TData extends TimedSeriesData = TimedSeriesData, TOptions extends SeriesOptions = SeriesOptions> {
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
    addSeries<TData extends TimedSeriesData, TOptions extends SeriesOptions = SeriesOptions>(definition: SeriesDefinition<TData, TOptions>, options?: Partial<TOptions>): ISeriesApi<TData, TOptions>;
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
    addSeries<TData extends TimedSeriesData, TOptions extends SeriesOptions = SeriesOptions>(definition: SeriesDefinition<TData, TOptions>, options?: Partial<TOptions>, pane?: IPaneApi): ISeriesApi<TData, TOptions>;
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
export declare function createChart(container: HTMLElement, options?: ChartOptions): IChartApi;
export declare function createSeriesMarkers(series: ISeriesApi, markers?: SeriesMarker[]): ISeriesMarkersPlugin;
export declare const version = "sschart-experimental-0.1";

// Public API module: core/disposable.d.ts
export interface IDisposable {
    dispose(): void;
}
export type DisposeCallback = () => void;
export declare function toDisposable(callback: DisposeCallback): IDisposable;
/** Owns a group of resources and releases them once, in reverse order. */
export declare class DisposableStore implements IDisposable {
    private readonly items;
    private disposed;
    get isDisposed(): boolean;
    add<T extends IDisposable>(item: T): T;
    defer(callback: DisposeCallback): IDisposable;
    listen<TEvent extends Event>(target: EventTarget, type: string, listener: (event: TEvent) => void, options?: boolean | AddEventListenerOptions): IDisposable;
    clear(): void;
    dispose(): void;
}
/** A replaceable resource slot used for pending RAFs, requests and workers. */
export declare class MutableDisposable implements IDisposable {
    private current;
    private disposed;
    set value(next: IDisposable | null);
    get value(): IDisposable | null;
    clear(): void;
    dispose(): void;
}

// Public API module: core/interaction/command-stack.d.ts
export interface ICommand {
    readonly label?: string;
    execute(): void;
    undo(): void;
    redo?(): void;
}
export interface CommandStackSnapshot {
    readonly canUndo: boolean;
    readonly canRedo: boolean;
    readonly undoLabel: string | null;
    readonly redoLabel: string | null;
    readonly undoCount: number;
    readonly redoCount: number;
    readonly transactionActive: boolean;
}
export type CommandStackListener = (snapshot: CommandStackSnapshot) => void;
export interface ICommandStack {
    execute(command: ICommand): void;
    undo(): boolean;
    redo(): boolean;
    beginTransaction(label?: string): void;
    commitTransaction(): boolean;
    rollbackTransaction(): boolean;
    transaction<T>(label: string, action: () => T): T;
    clear(): void;
    snapshot(): CommandStackSnapshot;
    subscribe(listener: CommandStackListener): void;
    unsubscribe(listener: CommandStackListener): void;
}
/** Bounded, failure-safe command history shared by drawings and trading overlays. */
export declare class CommandStack implements ICommandStack {
    private readonly historyLimit;
    private readonly undoStack;
    private readonly redoStack;
    private readonly listeners;
    private activeTransaction;
    private running;
    private disposed;
    constructor(historyLimit?: number);
    execute(command: ICommand): void;
    undo(): boolean;
    redo(): boolean;
    beginTransaction(label?: string): void;
    commitTransaction(): boolean;
    rollbackTransaction(): boolean;
    transaction<T>(label: string, action: () => T): T;
    clear(): void;
    snapshot(): CommandStackSnapshot;
    subscribe(listener: CommandStackListener): void;
    unsubscribe(listener: CommandStackListener): void;
    dispose(): void;
    private record;
    private trimHistory;
    private run;
    private assertCommand;
    private assertAlive;
    private assertNoTransaction;
    private requireTransaction;
    private emit;
}

// Public API module: core/interaction/interaction-controller.d.ts
import type { IChartPrimitive, PrimitiveHitTestRole } from '../primitives/primitive-api.js';
export declare const InteractionState: Readonly<{
    readonly Idle: 'idle';
    readonly Hover: 'hover';
    readonly Drawing: 'drawing';
    readonly Selected: 'selected';
    readonly DraggingBody: 'dragging-body';
    readonly DraggingHandle: 'dragging-handle';
    readonly Panning: 'panning';
    readonly Scaling: 'scaling';
}>;
export type InteractionState = typeof InteractionState[keyof typeof InteractionState];
export interface InteractionObjectRef {
    readonly primitive: IChartPrimitive;
    readonly id: string;
    readonly role: PrimitiveHitTestRole;
}
export interface InteractionStateSnapshot {
    readonly state: InteractionState;
    readonly hovered: InteractionObjectRef | null;
    readonly selected: InteractionObjectRef | null;
}
export interface InteractionPoint {
    readonly x: number;
    readonly y: number;
}
export type InteractionPressTarget = {
    readonly kind: 'primitive';
    readonly object: InteractionObjectRef;
    readonly selectable: boolean;
    readonly draggable: boolean;
} | {
    readonly kind: 'pane';
} | {
    readonly kind: 'scale';
} | {
    readonly kind: 'legacy-line';
    readonly objectId: string;
};
export interface InteractionMovement {
    readonly point: InteractionPoint;
    readonly startPoint: InteractionPoint;
    readonly delta: InteractionPoint;
    readonly totalDelta: InteractionPoint;
    readonly state: InteractionState;
    readonly started: boolean;
}
export declare class InteractionController {
    private readonly changed;
    private readonly dragThreshold;
    private state;
    private hovered;
    private selected;
    private press;
    constructor(changed?: (snapshot: InteractionStateSnapshot) => void, dragThreshold?: number);
    snapshot(): InteractionStateSnapshot;
    get hasActivePress(): boolean;
    hover(object: InteractionObjectRef | null): void;
    pointerDown(point: InteractionPoint, target: InteractionPressTarget): void;
    pointerMove(point: InteractionPoint): InteractionMovement | null;
    pointerUp(point: InteractionPoint): InteractionMovement | null;
    cancel(): void;
    beginDrawing(): void;
    finishDrawing(selected?: InteractionObjectRef | null): void;
    clearSelection(): void;
    forgetPrimitive(primitive: IChartPrimitive): void;
    private setState;
    private emit;
}

// Public API module: core/model/data-change-set.d.ts
export type DataChangeKind = 'replace' | 'update' | 'append' | 'prepend' | 'pop' | 'clear';
export interface DataChangeSet {
    readonly kind: DataChangeKind;
    readonly version: number;
    readonly fromIndex: number;
    readonly toIndex: number;
    readonly added: number;
    readonly removed: number;
}

// Public API module: core/model/pane-model.d.ts
import { PriceScaleModel } from '../scale/price-scale.js';
export type PaneState = 'normal' | 'minimized' | 'maximized';
export interface PaneOptions {
    id?: string;
    height?: number;
    minHeight?: number;
    order?: number;
    state?: PaneState;
}
export declare class PaneModel<TSeries> {
    readonly id: string;
    height: number;
    minHeight: number;
    order: number;
    state: PaneState;
    priceZoom: number;
    readonly series: TSeries[];
    private readonly scales;
    constructor(options: Required<PaneOptions>);
    applyOptions(options: Omit<PaneOptions, 'id'>): void;
    addSeries(series: TSeries): void;
    removeSeries(series: TSeries): boolean;
    priceScale(id?: string): PriceScaleModel;
    priceScaleIds(): readonly string[];
}

// Public API module: core/model/series-store.d.ts
import type { DataChangeSet } from './data-change-set.js';
export interface TimedValue {
    time: number;
}
export interface LogicalIndexRange {
    from: number;
    to: number;
}
export declare const MismatchDirection: {
    readonly NearestLeft: -1;
    readonly None: 0;
    readonly NearestRight: 1;
};
export type MismatchDirectionValue = typeof MismatchDirection[keyof typeof MismatchDirection];
export interface BarsInfo {
    barsBefore: number;
    barsAfter: number;
    from: number;
    to: number;
}
export interface IndexedData<TValue> {
    readonly from: number;
    readonly to: number;
    readonly points: readonly TValue[];
}
/** Sorted, versioned storage plus logarithmic time/index lookups. */
export declare class SeriesStore<TValue extends TimedValue> {
    private readonly items;
    private currentVersion;
    get version(): number;
    get length(): number;
    get values(): readonly TValue[];
    get first(): TValue | undefined;
    get last(): TValue | undefined;
    replace(points: ReadonlyArray<TValue>): DataChangeSet;
    update(point: TValue): DataChangeSet | null;
    prepend(points: ReadonlyArray<TValue>): DataChangeSet | null;
    pop(count?: number): {
        points: TValue[];
        change: DataChangeSet | null;
    };
    /** Applies a validated tail splice without copying or sorting the prefix. */
    replaceTail(fromIndex: number, removed: number, points: ReadonlyArray<TValue>): DataChangeSet | null;
    snapshot(): readonly TValue[];
    dataByIndex(index: number, mismatchDirection?: MismatchDirectionValue): TValue | null;
    pointAtTime(time: number): TValue | null;
    nearest(time: number): TValue | null;
    visibleRange(fromTime: number, toTime: number, neighbourPadding?: number): IndexedData<TValue>;
    barsInLogicalRange(range: LogicalIndexRange): BarsInfo | null;
    lowerBound(time: number): number;
    upperBound(time: number): number;
    private change;
}

// Public API module: core/primitives/primitive-api.d.ts
import type { IDisposable } from '../disposable.js';
import type { ICommandStack } from '../interaction/command-stack.js';
import type { IChartApi, IPaneApi, ISeriesApi, SeriesOptions, Time, TimedSeriesData, LogicalRange } from '../chart-api.js';
/** Closed primitive layer set. Arbitrary numeric z-indexes are intentionally unsupported. */
export declare const PrimitiveZOrder: Readonly<{
    readonly Background: 'background';
    readonly Bottom: 'bottom';
    readonly Normal: 'normal';
    readonly Top: 'top';
}>;
export type PrimitiveZOrder = typeof PrimitiveZOrder[keyof typeof PrimitiveZOrder];
export declare const PrimitivePaneViewClip: Readonly<{
    readonly Plot: 'plot';
    readonly Pane: 'pane';
}>;
export type PrimitivePaneViewClip = typeof PrimitivePaneViewClip[keyof typeof PrimitivePaneViewClip];
export declare const PrimitiveHitTestRole: Readonly<{
    readonly Body: 'body';
    readonly Handle: 'handle';
    readonly Label: 'label';
    readonly CloseButton: 'close-button';
}>;
export type PrimitiveHitTestRole = typeof PrimitiveHitTestRole[keyof typeof PrimitiveHitTestRole];
export declare const PrimitiveHitTestLocation: Readonly<{
    readonly Pane: 'pane';
    readonly PriceAxis: 'price-axis';
    readonly TimeAxis: 'time-axis';
}>;
export type PrimitiveHitTestLocation = typeof PrimitiveHitTestLocation[keyof typeof PrimitiveHitTestLocation];
/** A resource owned by a primitive attachment. */
export type PrimitiveDisposable = IDisposable | (() => void);
export interface PrimitiveTheme {
    readonly backgroundColor: string;
    readonly textColor: string;
    readonly fontFamily: string;
    readonly fontSize: number;
    readonly verticalGridColor: string;
    readonly horizontalGridColor: string;
}
export interface PrimitiveAttachOptions {
    /** Pane to which the primitive belongs. Defaults to the main pane. */
    readonly pane?: IPaneApi;
    /** Optional series used as the default price scale and coordinate source. */
    readonly series?: ISeriesApi<TimedSeriesData, SeriesOptions>;
    /** Price scale used when no explicit scale is passed to a conversion. */
    readonly priceScaleId?: string;
}
export interface PrimitiveSize {
    readonly width: number;
    readonly height: number;
}
export interface PrimitiveRect extends PrimitiveSize {
    readonly x: number;
    readonly y: number;
}
export interface PrimitivePaneGeometry extends PrimitiveRect {
    readonly plot: PrimitiveRect;
    readonly isLast: boolean;
}
export interface MediaCoordinatesRenderingScope {
    readonly context: CanvasRenderingContext2D;
    readonly mediaSize: PrimitiveSize;
}
export interface BitmapCoordinatesRenderingScope extends MediaCoordinatesRenderingScope {
    readonly bitmapSize: PrimitiveSize;
    readonly horizontalPixelRatio: number;
    readonly verticalPixelRatio: number;
}
/** A renderer receives scoped access to canvas state for the duration of draw(). */
export interface CanvasRenderTarget {
    readonly pane: PrimitivePaneGeometry;
    useMediaCoordinateSpace<T>(consumer: (scope: MediaCoordinatesRenderingScope) => T): T;
    useBitmapCoordinateSpace<T>(consumer: (scope: BitmapCoordinatesRenderingScope) => T): T;
}
export interface IPrimitiveRenderer {
    draw(target: CanvasRenderTarget): void;
}
export interface PrimitivePaneView {
    zOrder(): PrimitiveZOrder;
    clip?(): PrimitivePaneViewClip;
    renderer(): IPrimitiveRenderer | null;
}
export interface PrimitiveAxisView {
    coordinate(): number | null;
    text(): string;
    backgroundColor(): string;
    textColor?(): string;
    visible?(): boolean;
    tickVisible?(): boolean;
    /** Price-axis side/scale. Defaults to the attached series scale, then right. */
    priceScaleId?(): string;
}
/**
 * Stable services exposed to an attached primitive. The implementation never
 * leaks ChartImpl or a long-lived raw CanvasRenderingContext.
 */
export interface PrimitiveAttachedContext {
    readonly chart: IChartApi;
    readonly pane: IPaneApi;
    readonly series: ISeriesApi<TimedSeriesData, SeriesOptions> | null;
    readonly priceScaleId: string;
    readonly commandStack: ICommandStack;
    requestUpdate(): void;
    timeToCoordinate(time: Time): number | null;
    coordinateToTime(x: number): Time | null;
    priceToCoordinate(price: number, scaleId?: string): number | null;
    coordinateToPrice(y: number, scaleId?: string): number | null;
    pixelRatio(): number;
    theme(): Readonly<PrimitiveTheme>;
    /** The resource is released automatically on detach or chart removal. */
    addDisposable(resource: PrimitiveDisposable): void;
}
export interface AutoscaleInfo {
    readonly priceRange: {
        readonly min: number;
        readonly max: number;
    };
    /** Extra media-coordinate pixels reserved around the primitive. */
    readonly margins?: {
        readonly above?: number;
        readonly below?: number;
    };
}
export interface PrimitiveHit {
    /** Stable within the primitive lifetime and persisted model. */
    readonly id: string;
    readonly role: PrimitiveHitTestRole;
    readonly cursor?: string;
    readonly zOrder?: PrimitiveZOrder;
    readonly data?: unknown;
    readonly interaction?: PrimitiveInteractionOptions;
}
export interface PrimitiveInteractionOptions {
    readonly selectable?: boolean;
    readonly draggable?: boolean;
    /** Consume the pointer gesture without selecting or dragging (for buttons). */
    readonly consumePointer?: boolean;
}
export interface PrimitiveInteractionEvent {
    readonly point: Readonly<{
        x: number;
        y: number;
    }>;
    readonly startPoint: Readonly<{
        x: number;
        y: number;
    }>;
    readonly delta: Readonly<{
        x: number;
        y: number;
    }>;
    readonly totalDelta: Readonly<{
        x: number;
        y: number;
    }>;
    readonly hit: Readonly<{
        id: string;
        role: PrimitiveHitTestRole;
        data: unknown;
    }>;
    readonly sourceEvent: PointerEvent;
}
export interface HitTestContext {
    readonly pane: IPaneApi;
    readonly series: ISeriesApi<TimedSeriesData, SeriesOptions> | null;
    readonly priceScaleId: string;
    readonly location: PrimitiveHitTestLocation;
    readonly sourceEvent: PointerEvent | MouseEvent | null;
}
/** Public lifecycle contract shared by overlays, drawings and trading tools. */
export interface IChartPrimitive {
    attached(context: PrimitiveAttachedContext): void;
    detached(): void;
    updateAllViews(): void;
    paneViews?(): readonly PrimitivePaneView[];
    priceAxisViews?(): readonly PrimitiveAxisView[];
    timeAxisViews?(): readonly PrimitiveAxisView[];
    autoscaleInfo?(range: LogicalRange): AutoscaleInfo | null;
    hitTest?(point: Readonly<{
        x: number;
        y: number;
    }>, context: HitTestContext): PrimitiveHit | null;
    onPointerDown?(event: PrimitiveInteractionEvent): void;
    onPointerMove?(event: PrimitiveInteractionEvent): void;
    onPointerUp?(event: PrimitiveInteractionEvent): void;
    onPointerCancel?(event: PrimitiveInteractionEvent): void;
}

// Public API module: core/scale/price-scale.d.ts
export interface PriceScaleMargins {
    top: number;
    bottom: number;
}
export interface PriceRange {
    min: number;
    max: number;
    mode: number;
    baseValue: number;
    baseValues: ReadonlyMap<object, number>;
}
/** Mutable state of one named price scale inside one pane. */
export declare class PriceScaleModel {
    readonly id: string;
    margins: PriceScaleMargins;
    mode: number;
    frozenRange: PriceRange | null;
    constructor(id: string);
    setMargins(margins: Partial<PriceScaleMargins>): void;
    setMode(mode: number): void;
}

// Public API module: core/scale/time-scale.d.ts
export interface TimeRange {
    from: number;
    to: number;
}
/** Canonical time-domain state shared by every pane in a chart. */
export declare class TimeScaleModel {
    dataFrom: number;
    dataTo: number;
    visibleFrom: number;
    visibleTo: number;
    get dataRange(): TimeRange;
    get visibleRange(): TimeRange | null;
    updateDataRange(from: number, to: number): boolean;
    fitContent(): boolean;
    scrollToRealTime(gapRatio?: number): boolean;
    setVisibleRange(range: TimeRange, clampToData?: boolean): boolean;
    clampVisibleRange(nextFrom: number, nextTo: number): void;
}

// Public API module: data/aggregation.d.ts
import type { OhlcvBar } from './data-source.js';
import type { ChartDataViewBuilder, ChartDataViewUpdater } from './chart-data-store.js';
export interface OhlcvAggregationOptions {
    readonly intervalSeconds: number;
    readonly originTime?: number;
}
export declare const FixedResolutionUnit: Readonly<{
    readonly Second: 'second';
    readonly Minute: 'minute';
    readonly Hour: 'hour';
    readonly Day: 'day';
    readonly Week: 'week';
}>;
export type FixedResolutionUnit = typeof FixedResolutionUnit[keyof typeof FixedResolutionUnit];
export interface FixedResolution {
    readonly amount: number;
    readonly unit: FixedResolutionUnit;
    readonly seconds: number;
}
/** Parses common fixed resolutions while intentionally excluding calendar months. */
export declare function parseFixedResolution(resolution: string): FixedResolution;
/** Converts common trading resolutions to a fixed duration. Calendar months are intentionally excluded. */
export declare function resolutionToSeconds(resolution: string): number;
/** Stable time-bucket OHLCV reduction. Empty market gaps do not create synthetic bars. */
export declare function aggregateOhlcvBars(bars: readonly OhlcvBar[], options: OhlcvAggregationOptions): readonly OhlcvBar[];
/** Ready-to-use ChartDataController view builder for fixed-duration OHLCV feeds. */
export declare const ohlcvDataViewBuilder: ChartDataViewBuilder<OhlcvBar>;
/** Rebuilds only the final time bucket after a replace-last or append update. */
export declare const ohlcvDataViewUpdater: ChartDataViewUpdater<OhlcvBar>;

// Public API module: data/bar-normalization.d.ts
import type { TimedSeriesData } from '../core/chart-api.js';
import type { BarsPage } from './data-source.js';
/** Validates ascending source order and keeps the last value for duplicate timestamps. */
export declare function normalizeBars<TBar extends TimedSeriesData>(bars: readonly TBar[]): readonly TBar[];
export declare function normalizeBarsPage<TBar extends TimedSeriesData>(value: BarsPage<TBar>): BarsPage<TBar>;

// Public API module: data/chart-data-controller.d.ts
import type { IChartApi, ISeriesApi, SeriesOptions, TimedSeriesData } from '../core/chart-api.js';
import type { IChartDataSource, SymbolInfo } from './data-source.js';
import { type ChartDataViewBuilder, type ChartDataViewUpdater } from './chart-data-store.js';
import type { LodCacheSnapshot } from './lod-cache.js';
import { type RealtimeReconnectPolicy, type RealtimeScheduler } from './reconnect-policy.js';
export declare const ChartDataStatus: Readonly<{
    readonly Idle: 'idle';
    readonly Resolving: 'resolving';
    readonly Loading: 'loading';
    readonly Ready: 'ready';
    readonly Error: 'error';
    readonly Disposed: 'disposed';
}>;
export type ChartDataStatus = typeof ChartDataStatus[keyof typeof ChartDataStatus];
export declare const RealtimeStatus: Readonly<{
    readonly Disconnected: 'disconnected';
    readonly Connecting: 'connecting';
    readonly Connected: 'connected';
    readonly Reconnecting: 'reconnecting';
    readonly Error: 'error';
}>;
export type RealtimeStatus = typeof RealtimeStatus[keyof typeof RealtimeStatus];
export interface ChartDataSelection {
    readonly symbol: string;
    readonly resolution: string;
}
export interface ChartDataControllerSnapshot {
    readonly status: ChartDataStatus;
    readonly generation: number;
    readonly selection: ChartDataSelection | null;
    readonly symbolInfo: SymbolInfo | null;
    readonly loadedBars: number;
    readonly renderedBars: number;
    readonly groupingLevel: number;
    readonly realtimeStatus: RealtimeStatus;
    readonly realtimeUpdates: number;
    readonly realtimeError: unknown | null;
    readonly reconnectAttempt: number;
    readonly nextReconnectDelayMs: number | null;
    readonly hasMoreBefore: boolean;
    readonly hasMoreAfter: boolean;
    readonly loadingHistory: boolean;
    readonly historyError: unknown | null;
    readonly error: unknown | null;
}
export type ChartDataControllerListener = (snapshot: ChartDataControllerSnapshot) => void;
export interface ChartDataControllerOptions<TBar extends TimedSeriesData, TSeriesOptions extends SeriesOptions = SeriesOptions> {
    readonly chart: IChartApi;
    readonly series: ISeriesApi<TBar, TSeriesOptions>;
    readonly dataSource: IChartDataSource<TBar>;
    readonly initialCount?: number;
    readonly historyCount?: number;
    readonly historyPrefetchThreshold?: number;
    readonly autoPrefetch?: boolean;
    readonly viewBuilder?: ChartDataViewBuilder<TBar>;
    readonly viewUpdater?: ChartDataViewUpdater<TBar>;
    readonly initialGroupingLevel?: number;
    readonly lodCacheSize?: number;
    readonly autoScrollRealtime?: boolean;
    /** Applies SymbolInfo.tradingSchedule to the chart without changing the time-scale mode. */
    readonly applySymbolTradingSchedule?: boolean;
    readonly reconnectPolicy?: RealtimeReconnectPolicy;
    readonly realtimeScheduler?: RealtimeScheduler;
}
/**
 * Optional adapter between an imperative series and an asynchronous datafeed.
 * Manual series.setData/update use remains independent of this controller.
 */
export declare class ChartDataController<TBar extends TimedSeriesData, TSeriesOptions extends SeriesOptions = SeriesOptions> {
    private readonly options;
    private readonly coordinator;
    private readonly listeners;
    private readonly initialCount;
    private readonly historyCount;
    private readonly historyPrefetchThreshold;
    private readonly autoPrefetch;
    private readonly dataStore;
    private readonly renderedStore;
    private groupingLevelValue;
    private readonly autoScrollRealtime;
    private readonly applySymbolTradingSchedule;
    private symbolTradingCalendarApplied;
    private readonly reconnectBackoff;
    private readonly realtimeScheduler;
    private realtimeUnsubscribe;
    private realtimeTicket;
    private reconnectTimer;
    private activeLoad;
    private historyLoad;
    private currentTicket;
    private currentSelection;
    private currentSymbolInfo;
    private state;
    private disposed;
    private readonly visibleRangeListener;
    constructor(options: ChartDataControllerOptions<TBar, TSeriesOptions>);
    snapshot(): ChartDataControllerSnapshot;
    rawData(): readonly TBar[];
    /** Immutable half-open raw-data window without copying the complete history. */
    rawDataSlice(fromIndex?: number, toIndex?: number): readonly TBar[];
    renderedData(): readonly TBar[];
    groupingLevel(): number;
    lodCacheSnapshot(): LodCacheSnapshot;
    setGroupingLevel(level: number): void;
    subscribe(listener: ChartDataControllerListener): void;
    unsubscribe(listener: ChartDataControllerListener): void;
    setSelection(selection: ChartDataSelection): Promise<SymbolInfo | null>;
    reload(): Promise<SymbolInfo | null>;
    loadMoreBefore(): Promise<number>;
    cancel(): void;
    dispose(): void;
    private startLoad;
    private load;
    private applyTradingCalendar;
    private prefetchForRange;
    private loadHistory;
    private viewContext;
    private applyRenderView;
    private startRealtime;
    private handleRealtimeUpdate;
    private handleRealtimeError;
    private scheduleRealtimeReconnect;
    private stopRealtime;
    private clearReconnectTimer;
    private setState;
    private emit;
    private assertAlive;
}

// Public API module: data/chart-data-store.d.ts
import type { DataChangeSet } from '../core/model/data-change-set.js';
import type { TimedSeriesData } from '../core/chart-api.js';
import { type LodCacheSnapshot } from './lod-cache.js';
export interface ChartDataViewContext {
    readonly symbol: string;
    readonly resolution: string;
    readonly groupingLevel: number;
}
export type ChartDataViewBuilder<TBar extends TimedSeriesData> = (rawBars: readonly TBar[], context: ChartDataViewContext) => readonly TBar[];
export type ChartDataViewUpdater<TBar extends TimedSeriesData> = (rawBars: readonly TBar[], context: ChartDataViewContext, change: DataChangeSet) => TBar | null;
export interface ChartDataViewUpdate<TBar extends TimedSeriesData> {
    readonly change: DataChangeSet;
    /** Null asks the controller to rebuild the complete derived view. */
    readonly viewBar: TBar | null;
}
export interface ChartDataStoreOptions<TBar extends TimedSeriesData> {
    readonly viewBuilder?: ChartDataViewBuilder<TBar>;
    readonly viewUpdater?: ChartDataViewUpdater<TBar>;
    readonly lodCacheSize?: number;
}
/** Raw history owner with a separately cached render view. */
export declare class ChartDataStore<TBar extends TimedSeriesData> {
    private readonly rawStore;
    private readonly lodCache;
    private readonly viewBuilder?;
    private readonly viewUpdater?;
    constructor(options?: ChartDataStoreOptions<TBar>);
    get version(): number;
    get length(): number;
    get first(): TBar | undefined;
    get last(): TBar | undefined;
    get hasViewBuilder(): boolean;
    replace(bars: readonly TBar[]): DataChangeSet;
    prepend(bars: readonly TBar[]): DataChangeSet | null;
    update(bar: TBar): DataChangeSet | null;
    updateView(bar: TBar, context: ChartDataViewContext): ChartDataViewUpdate<TBar> | null;
    clear(): void;
    raw(): readonly TBar[];
    rawSlice(fromIndex?: number, toIndex?: number): readonly TBar[];
    view(context: ChartDataViewContext): readonly TBar[];
    lodCacheSnapshot(): LodCacheSnapshot;
}

// Public API module: data/data-request-coordinator.d.ts
export interface DataRequestTicket {
    readonly generation: number;
    readonly signal: AbortSignal;
}
/** Owns one request generation and makes stale-result checks explicit. */
export declare class DataRequestCoordinator {
    private generation;
    private active;
    private disposed;
    begin(): DataRequestTicket;
    isCurrent(ticket: DataRequestTicket): boolean;
    cancel(): void;
    dispose(): void;
}

// Public API module: data/data-source.d.ts
import type { CandlestickData, PriceFormat, Time, TimedSeriesData } from '../core/chart-api.js';
import type { TradingSchedule } from '../time/trading-calendar.js';
export interface OhlcvBar extends CandlestickData {
    readonly volume?: number;
}
export interface ResolveSymbolRequest {
    readonly symbol: string;
}
/** Datafeed-owned identity, display metadata and optional exchange calendar. */
export interface SymbolInfo {
    readonly id: string;
    readonly ticker?: string;
    readonly name?: string;
    readonly exchange?: string;
    readonly priceFormat?: PriceFormat;
    readonly tradingSchedule?: TradingSchedule;
    readonly metadata?: Readonly<Record<string, unknown>>;
}
export interface BarsRequest {
    readonly symbol: string;
    readonly resolution: string;
    readonly from?: Time;
    readonly to?: Time;
    readonly countBack?: number;
}
export interface BarsPage<TBar extends TimedSeriesData = OhlcvBar> {
    readonly bars: readonly TBar[];
    readonly hasMoreBefore: boolean;
    readonly hasMoreAfter?: boolean;
}
export interface BarsSubscription {
    readonly symbol: string;
    readonly resolution: string;
}
export interface BarUpdate<TBar extends TimedSeriesData = OhlcvBar> {
    readonly bar: TBar;
    readonly isFinal?: boolean;
}
export type Unsubscribe = () => void;
/** Broker/vendor-neutral history and realtime boundary. */
export interface IChartDataSource<TBar extends TimedSeriesData = OhlcvBar> {
    resolveSymbol(request: ResolveSymbolRequest, signal: AbortSignal): Promise<SymbolInfo>;
    getBars(request: BarsRequest, signal: AbortSignal): Promise<BarsPage<TBar>>;
    subscribeBars(request: BarsSubscription, listener: (update: BarUpdate<TBar>) => void, errorListener?: (error: unknown) => void): Unsubscribe;
}

// Public API module: data/index.d.ts
export * from './data-source.js';
export * from './data-request-coordinator.js';
export * from './chart-data-controller.js';
export * from './bar-normalization.js';
export * from './chart-data-store.js';
export * from './aggregation.js';
export * from './lod-cache.js';
export * from './reconnect-policy.js';

// Public API module: data/lod-cache.d.ts
export interface LodCacheKey {
    readonly symbol: string;
    readonly resolution: string;
    readonly groupingLevel: number;
}
export interface LodCacheSnapshot {
    readonly size: number;
    readonly capacity: number;
    readonly hits: number;
    readonly misses: number;
    readonly keys: readonly LodCacheKey[];
}
/** Bounded LRU for derived views. Raw-data version is part of entry validity. */
export declare class LodCache<TValue extends {}> {
    private readonly maxEntries;
    private readonly entries;
    private hitCount;
    private missCount;
    constructor(maxEntries?: number);
    get(key: LodCacheKey, sourceVersion: number): TValue | undefined;
    set(key: LodCacheKey, sourceVersion: number, value: TValue): void;
    getOrCreate(key: LodCacheKey, sourceVersion: number, factory: () => TValue): TValue;
    invalidateExceptVersion(sourceVersion: number): void;
    clear(): void;
    snapshot(): LodCacheSnapshot;
}

// Public API module: data/reconnect-policy.d.ts
export interface RealtimeReconnectPolicy {
    readonly enabled?: boolean;
    readonly initialDelayMs?: number;
    readonly maxDelayMs?: number;
    readonly multiplier?: number;
    readonly maxAttempts?: number;
    readonly jitterRatio?: number;
}
export interface ReconnectAttempt {
    readonly attempt: number;
    readonly delayMs: number;
}
export interface RealtimeScheduler {
    setTimeout(callback: () => void, delayMs: number): unknown;
    clearTimeout(handle: unknown): void;
    random(): number;
}
/** Deterministic stateful backoff; scheduling remains owned by the controller. */
export declare class RealtimeReconnectBackoff {
    private readonly random;
    private readonly policy;
    private attempts;
    constructor(policy?: RealtimeReconnectPolicy, random?: () => number);
    get attemptCount(): number;
    next(): ReconnectAttempt | null;
    reset(): void;
}
export declare function defaultRealtimeScheduler(): RealtimeScheduler;

// Public API module: drawings/built-in-analysis-drawings.d.ts
import type { LineStyleValue } from '../core/chart-api.js';
import type { DrawingOptions } from './drawing-model.js';
import { DrawingDefinitionRegistry, type DrawingDefinition } from './drawing-registry.js';
export interface FibonacciDrawingOptions extends DrawingOptions {
    readonly color: string;
    readonly lineWidth: number;
    readonly lineStyle: LineStyleValue;
    readonly fillColor: string;
    readonly levels: readonly number[];
    readonly labelsVisible: boolean;
    readonly fontSize: number;
    readonly extendRight: boolean;
}
export interface MeasureDrawingOptions extends DrawingOptions {
    readonly color: string;
    readonly lineWidth: number;
    readonly fillColor: string;
    readonly labelColor: string;
    readonly labelBackgroundColor: string;
    readonly fontSize: number;
}
export declare const builtInAnalysisDrawingDefinitions: readonly [DrawingDefinition<FibonacciDrawingOptions>, DrawingDefinition<MeasureDrawingOptions>];
export declare function registerBuiltInAnalysisDrawings(registry: DrawingDefinitionRegistry): void;

// Public API module: drawings/built-in-line-drawings.d.ts
import type { LineStyleValue } from '../core/chart-api.js';
import type { DrawingOptions } from './drawing-model.js';
import { DrawingDefinitionRegistry, type DrawingDefinition } from './drawing-registry.js';
export declare const BuiltInDrawingType: Readonly<{
    readonly HorizontalLine: 'horizontal-line';
    readonly VerticalLine: 'vertical-line';
    readonly TrendLine: 'trend-line';
    readonly Ray: 'ray';
    readonly Rectangle: 'rectangle';
    readonly Text: 'text';
    readonly Note: 'note';
    readonly FibonacciRetracement: 'fibonacci-retracement';
    readonly Measure: 'measure';
    readonly LongPosition: 'long-position';
    readonly ShortPosition: 'short-position';
}>;
export type BuiltInDrawingType = typeof BuiltInDrawingType[keyof typeof BuiltInDrawingType];
export interface LineDrawingOptions extends DrawingOptions {
    readonly color: string;
    readonly lineWidth: number;
    readonly lineStyle: LineStyleValue;
}
export declare const builtInLineDrawingDefinitions: readonly DrawingDefinition<LineDrawingOptions>[];
export declare function registerBuiltInLineDrawings(registry: DrawingDefinitionRegistry): void;

// Public API module: drawings/built-in-position-drawings.d.ts
import type { DrawingOptions } from './drawing-model.js';
import { DrawingDefinitionRegistry, type DrawingDefinition } from './drawing-registry.js';
export interface PositionDrawingOptions extends DrawingOptions {
    readonly entryColor: string;
    readonly targetColor: string;
    readonly stopColor: string;
    readonly targetFillColor: string;
    readonly stopFillColor: string;
    readonly textColor: string;
    readonly lineWidth: number;
    readonly fontSize: number;
    readonly quantity: number;
}
export declare const builtInPositionDrawingDefinitions: readonly [DrawingDefinition<PositionDrawingOptions>, DrawingDefinition<PositionDrawingOptions>];
export declare function registerBuiltInPositionDrawings(registry: DrawingDefinitionRegistry): void;

// Public API module: drawings/built-in-shape-drawings.d.ts
import type { LineStyleValue } from '../core/chart-api.js';
import type { DrawingOptions } from './drawing-model.js';
import { DrawingDefinitionRegistry, type DrawingDefinition } from './drawing-registry.js';
export interface RectangleDrawingOptions extends DrawingOptions {
    readonly color: string;
    readonly lineWidth: number;
    readonly lineStyle: LineStyleValue;
    readonly fillColor: string;
}
export interface TextDrawingOptions extends DrawingOptions {
    readonly text: string;
    readonly color: string;
    readonly backgroundColor: string;
    readonly borderColor: string;
    readonly borderWidth: number;
    readonly fontSize: number;
    readonly fontFamily: string;
    readonly padding: number;
}
export declare const builtInShapeDrawingDefinitions: readonly [DrawingDefinition<RectangleDrawingOptions>, DrawingDefinition<TextDrawingOptions>, DrawingDefinition<TextDrawingOptions>];
export declare function registerBuiltInShapeDrawings(registry: DrawingDefinitionRegistry): void;

// Public API module: drawings/drawing-controller.d.ts
import type { IChartApi, ICommandStack } from '../core/chart-api.js';
import { type DrawingInstance, type DrawingOptions, type DrawingPoint } from './drawing-model.js';
import { type DrawingDefinitionRegistry } from './drawing-registry.js';
import { type DrawingMagnetOptions, type DrawingMagnetSettings } from './drawing-magnet.js';
export interface DrawingInstancePatch {
    readonly paneId?: string;
    readonly points?: readonly DrawingPoint[];
    readonly options?: DrawingOptions;
    readonly visible?: boolean;
    readonly locked?: boolean;
    readonly zOrder?: number;
}
export interface CreateDrawingOptions {
    readonly id?: string;
    readonly paneId?: string;
    readonly options?: DrawingOptions;
    readonly visible?: boolean;
    readonly locked?: boolean;
    readonly zOrder?: number;
}
export interface DrawingControllerOptions {
    readonly chart: IChartApi;
    readonly registry?: DrawingDefinitionRegistry;
    readonly commandStack?: ICommandStack;
    readonly idFactory?: (type: string) => string;
    readonly magnet?: DrawingMagnetOptions;
}
export type DrawingControllerListener = (drawings: readonly DrawingInstance[]) => void;
export interface DrawingCreationSnapshot {
    readonly type: string;
    readonly name: string;
    readonly paneId: string | null;
    readonly points: readonly DrawingPoint[];
    readonly previewPoint: DrawingPoint | null;
    readonly minimumPoints: number;
    readonly maximumPoints: number;
}
export type DrawingCreationListener = (creation: DrawingCreationSnapshot | null) => void;
export interface DrawingRestoreOptions {
    readonly unknownType?: 'skip' | 'error';
}
export interface SkippedDrawing {
    readonly id: string;
    readonly type: string;
    readonly reason: 'unknown-type';
}
export interface DrawingRestoreResult {
    readonly restored: readonly DrawingInstance[];
    readonly skipped: readonly SkippedDrawing[];
}
/** Owns serializable drawings, primitive bindings and one undoable mutation path. */
export declare class DrawingController {
    private readonly chart;
    private readonly registry;
    private readonly commands;
    private readonly idFactory?;
    private readonly magnet;
    private readonly records;
    private readonly listeners;
    private readonly creationListeners;
    private activeCreation;
    private nextId;
    private nextDraftId;
    private disposed;
    private readonly handleChartClick;
    private readonly handleCrosshairMove;
    constructor(options: DrawingControllerOptions);
    drawings(): readonly DrawingInstance[];
    get(id: string): DrawingInstance | undefined;
    has(id: string): boolean;
    magnetOptions(): DrawingMagnetSettings;
    applyMagnetOptions(patch: DrawingMagnetOptions): void;
    creation(): DrawingCreationSnapshot | null;
    beginCreation(type: string, options?: CreateDrawingOptions): void;
    finishCreation(): DrawingInstance | null;
    cancelCreation(): boolean;
    subscribeCreation(listener: DrawingCreationListener): void;
    unsubscribeCreation(listener: DrawingCreationListener): void;
    replaceAll(instances: readonly DrawingInstance[], options?: DrawingRestoreOptions): DrawingRestoreResult;
    create(type: string, points: readonly DrawingPoint[], options?: CreateDrawingOptions): DrawingInstance;
    add(instance: DrawingInstance): DrawingInstance;
    update(id: string, patch: DrawingInstancePatch): DrawingInstance;
    updateOptions(id: string, patch: DrawingOptions): DrawingInstance;
    setVisible(id: string, visible: boolean): DrawingInstance;
    setLocked(id: string, locked: boolean): DrawingInstance;
    moveToPane(id: string, paneId: string): DrawingInstance;
    remove(id: string): boolean;
    duplicate(id: string, duplicateId?: string): DrawingInstance;
    clear(): boolean;
    subscribe(listener: DrawingControllerListener): void;
    unsubscribe(listener: DrawingControllerListener): void;
    dispose(): void;
    private acceptCreationPoint;
    private previewCreationPoint;
    private magnetInput;
    private refreshDraft;
    private clearDraft;
    private endCreation;
    private unsubscribeCreationInput;
    private normalizeCreateOptions;
    private executeInsert;
    private executeReplace;
    private insertInternal;
    private replaceInternal;
    private removeInternal;
    private clearInternal;
    private previewFromPrimitive;
    private commitFromPrimitive;
    private cancelFromPrimitive;
    private primitiveCandidate;
    private attach;
    private detach;
    private resolvePane;
    private prepare;
    private requireDefinition;
    private requireRecord;
    private generateId;
    private nextZOrder;
    private emit;
    private emitCreation;
    private assertAlive;
}

// Public API module: drawings/drawing-magnet.d.ts
import type { IPaneApi, ISeriesApi } from '../core/chart-api.js';
import type { TimedSeriesData } from '../series/registry.js';
import type { DrawingPoint } from './drawing-model.js';
export declare const DrawingMagnetMode: Readonly<{
    readonly None: 'none';
    readonly Weak: 'weak';
    readonly Strong: 'strong';
}>;
export type DrawingMagnetMode = typeof DrawingMagnetMode[keyof typeof DrawingMagnetMode];
export interface DrawingMagnetOptions {
    readonly mode?: DrawingMagnetMode;
    /** Maximum vertical distance in CSS pixels for weak snapping. */
    readonly maxDistance?: number;
}
export interface DrawingMagnetSettings {
    readonly mode: DrawingMagnetMode;
    readonly maxDistance: number;
}
export interface DrawingMagnetInput {
    readonly time: number;
    readonly price: number;
    readonly coordinate: Readonly<{
        x: number;
        y: number;
    }>;
    readonly pane: IPaneApi;
    readonly seriesData: ReadonlyMap<ISeriesApi<any, any>, TimedSeriesData>;
}
export interface DrawingMagnetResult {
    readonly point: DrawingPoint;
    readonly snapped: boolean;
    readonly series: ISeriesApi<any, any> | null;
    readonly distance: number | null;
}
/** Resolves drawing anchors against renderer-defined values in screen space. */
export declare class DrawingMagnet {
    private settings;
    constructor(options?: DrawingMagnetOptions);
    options(): DrawingMagnetSettings;
    applyOptions(patch: DrawingMagnetOptions): void;
    resolve(input: DrawingMagnetInput): DrawingMagnetResult;
}

// Public API module: drawings/drawing-model.d.ts
import type { Time } from '../core/chart-api.js';
export type DrawingJsonValue = string | number | boolean | null | readonly DrawingJsonValue[] | {
    readonly [key: string]: DrawingJsonValue;
};
export type DrawingOptions = Readonly<Record<string, DrawingJsonValue>>;
export interface DrawingPoint {
    readonly time: Time;
    readonly price: number;
}
/** Pure persisted drawing state. It deliberately contains no runtime objects. */
export interface DrawingInstance<TOptions extends DrawingOptions = DrawingOptions> {
    readonly id: string;
    readonly type: string;
    readonly paneId: string;
    readonly points: readonly DrawingPoint[];
    readonly options: TOptions;
    readonly visible: boolean;
    readonly locked: boolean;
    readonly zOrder: number;
}
export declare function normalizeDrawingInstance<TOptions extends DrawingOptions = DrawingOptions>(value: DrawingInstance<TOptions>): DrawingInstance<TOptions>;
export declare function normalizeDrawingOptions(value: DrawingOptions): DrawingOptions;

// Public API module: drawings/drawing-registry.d.ts
import type { IChartPrimitive } from '../core/chart-api.js';
import { type DrawingInstance, type DrawingOptions } from './drawing-model.js';
export interface DrawingPointSchema {
    readonly min: number;
    readonly max: number;
}
export interface DrawingPrimitiveEvents<TOptions extends DrawingOptions = DrawingOptions> {
    /** Live gesture state; the controller does not add it to command history. */
    preview(instance: DrawingInstance<TOptions>): void;
    /** Final gesture state; the controller records one undoable command. */
    commit(instance: DrawingInstance<TOptions>): void;
    /** Cancels the current gesture and restores its pre-gesture model. */
    cancel(instance: DrawingInstance<TOptions>): void;
}
export interface DrawingPrimitiveBinding<TOptions extends DrawingOptions = DrawingOptions> {
    readonly primitive: IChartPrimitive;
    update(instance: DrawingInstance<TOptions>): void;
    dispose?(): void;
}
export interface DrawingDefinition<TOptions extends DrawingOptions = DrawingOptions> {
    readonly type: string;
    readonly name: string;
    readonly points: DrawingPointSchema;
    readonly defaultOptions: TOptions;
    /** Validates and canonicalizes JSON-safe options before they enter the model. */
    readonly normalizeOptions?: (options: TOptions) => TOptions;
    create(instance: DrawingInstance<TOptions>, events: DrawingPrimitiveEvents<TOptions>): DrawingPrimitiveBinding<TOptions>;
}
/** Extensible drawing type catalog. Unknown persisted types are resolved as undefined. */
export declare class DrawingDefinitionRegistry {
    private readonly definitions;
    register<TOptions extends DrawingOptions>(definition: DrawingDefinition<TOptions>): DrawingDefinition<TOptions>;
    unregister(type: string): boolean;
    has(type: string): boolean;
    get(type: string): DrawingDefinition | undefined;
    types(): readonly string[];
}
export declare const drawingDefinitionRegistry: DrawingDefinitionRegistry;
export declare function registerDrawing<TOptions extends DrawingOptions>(definition: DrawingDefinition<TOptions>): DrawingDefinition<TOptions>;
export declare function unregisterDrawing(type: string): boolean;
export declare function getDrawingDefinition(type: string): DrawingDefinition | undefined;
export declare function getDrawingTypes(): readonly string[];

// Public API module: drawings/index.d.ts
export * from './drawing-model.js';
export * from './drawing-registry.js';
export * from './drawing-controller.js';
export * from './drawing-magnet.js';
export * from './interactive-drawing-primitive.js';
export * from './built-in-line-drawings.js';
export * from './built-in-shape-drawings.js';
export * from './built-in-analysis-drawings.js';
export * from './built-in-position-drawings.js';

// Public API module: drawings/interactive-drawing-primitive.d.ts
import type { AutoscaleInfo, HitTestContext, IChartPrimitive, LogicalRange, PrimitiveAttachedContext, PrimitiveHit, PrimitiveInteractionEvent, PrimitivePaneView, PrimitiveRect, PrimitiveTheme } from '../core/chart-api.js';
import { type DrawingInstance } from './drawing-model.js';
import type { DrawingPrimitiveBinding, DrawingPrimitiveEvents } from './drawing-registry.js';
export interface DrawingScreenPoint {
    readonly x: number;
    readonly y: number;
}
export interface DrawingPrimitiveGeometryContext {
    readonly instance: DrawingInstance;
    readonly points: readonly DrawingScreenPoint[];
    readonly plot: PrimitiveRect;
    timeToCoordinate(time: number): number | null;
    priceToCoordinate(price: number): number | null;
}
export interface DrawingPrimitiveDrawContext extends DrawingPrimitiveGeometryContext {
    readonly context: CanvasRenderingContext2D;
    readonly theme: Readonly<PrimitiveTheme>;
    readonly pixelRatio: number;
    readonly selected: boolean;
}
export interface DrawingPrimitiveBodyHit {
    readonly cursor?: string;
}
export interface DrawingPrimitiveVisual {
    draw(context: DrawingPrimitiveDrawContext): void;
    hitTest(point: Readonly<DrawingScreenPoint>, context: DrawingPrimitiveGeometryContext): DrawingPrimitiveBodyHit | null;
    autoscaleInfo?(instance: DrawingInstance, range: LogicalRange): AutoscaleInfo | null;
    handleColor?(instance: DrawingInstance): string;
}
export interface DrawingPrimitiveHitData {
    readonly kind: 'drawing';
    readonly primitive: InteractiveDrawingPrimitive;
    readonly part: 'body' | 'point';
    readonly pointIndex: number | null;
}
/** Shared interaction shell for serializable drawing visuals. */
export declare class InteractiveDrawingPrimitive implements IChartPrimitive {
    private model;
    private readonly events;
    private readonly visual;
    private context;
    private plot;
    private screen;
    private drag;
    private selected;
    private readonly renderer;
    private readonly paneView;
    private readonly interactionListener;
    constructor(instance: DrawingInstance, events: DrawingPrimitiveEvents, visual: DrawingPrimitiveVisual);
    instance(): DrawingInstance;
    update(instance: DrawingInstance): void;
    attached(context: PrimitiveAttachedContext): void;
    detached(): void;
    updateAllViews(): void;
    paneViews(): readonly PrimitivePaneView[];
    autoscaleInfo(range: LogicalRange): AutoscaleInfo | null;
    hitTest(point: Readonly<DrawingScreenPoint>, context: HitTestContext): PrimitiveHit | null;
    onPointerDown(event: PrimitiveInteractionEvent): void;
    onPointerMove(event: PrimitiveInteractionEvent): void;
    onPointerUp(): void;
    onPointerCancel(): void;
    private cancelDrag;
    private hit;
    private pointFromCoordinate;
    private refreshScreen;
    private draw;
    private drawHandles;
}
export declare function createInteractiveDrawingBinding(instance: DrawingInstance, events: DrawingPrimitiveEvents, visual: DrawingPrimitiveVisual): DrawingPrimitiveBinding;

// Public API module: indicators/built-ins/adaptive-definitions.d.ts
import { type IndicatorCandle, type IndicatorDefinition, type IndicatorParameters, type IndicatorProcessInput } from '../indicator-definition.js';
import { SequentialIndicatorProcessor, type IndicatorCalculationResult } from '../sequential-processor.js';
import { type RingBufferCheckpoint, type ExpandingAverageTrueRangeCheckpoint, type RollingEfficiencyRatioCheckpoint, type RollingWindowCheckpoint, type SeededMovingAverageCheckpoint } from '../math/index.js';
export interface ParabolicSarParameters extends IndicatorParameters {
    readonly acceleration: number;
    readonly accelerationStep: number;
    readonly accelerationMax: number;
}
export interface KaufmanAdaptiveParameters extends IndicatorParameters {
    readonly length: number;
    readonly fastSc: number;
    readonly slowSc: number;
}
export interface AdaptiveLengthParameters extends IndicatorParameters {
    readonly length: number;
}
export interface VariableMovingAverageParameters extends IndicatorParameters {
    readonly length: number;
    readonly volatilityIndex: number;
}
export interface AdaptiveLaguerreFilterParameters extends IndicatorParameters {
    readonly gamma: number;
}
export interface LaguerreRsiParameters extends IndicatorParameters {
    readonly gamma: number;
}
export interface NickRypockTrailingReverseParameters extends IndicatorParameters {
    readonly length: number;
    readonly multiple: number;
}
export interface AdaptivePriceZoneParameters extends IndicatorParameters {
    readonly period: number;
    readonly bandPercentage: number;
}
export interface ParabolicSarCandleState {
    readonly high: number;
    readonly low: number;
}
export interface ParabolicSarCheckpoint {
    readonly validCandles: number;
    readonly tail: readonly ParabolicSarCandleState[];
    readonly longPosition: boolean;
    readonly extremePoint: number;
    readonly accelerationFactor: number;
    readonly previousBar: number;
    readonly accelerationIncreased: boolean;
    readonly reverseBar: number;
    readonly reverseValue: number;
    readonly previousSar: number;
    readonly todaySar: number;
    readonly lastReturned: number;
}
export interface KaufmanAdaptiveCheckpoint {
    readonly disabled: boolean;
    readonly seeded: boolean;
    readonly previous: number;
    readonly ratio: RollingEfficiencyRatioCheckpoint;
}
export interface FractalAdaptiveCheckpoint {
    readonly previous: number;
    readonly closes: RingBufferCheckpoint<number>;
}
export interface AdaptiveLaguerreFilterCheckpoint {
    readonly l0: number;
    readonly l1: number;
    readonly l2: number;
    readonly l3: number;
    readonly formed: boolean;
}
export interface LaguerreRsiCheckpoint {
    readonly l0: number;
    readonly l1: number;
    readonly l2: number;
    readonly l3: number;
    readonly previousUp: number;
    readonly previousDown: number;
    readonly formed: boolean;
}
export interface AdaptivePriceZoneCheckpoint {
    readonly average: SeededMovingAverageCheckpoint;
    readonly deviation: RollingWindowCheckpoint;
}
export interface VidyaCheckpoint {
    readonly initialized: boolean;
    readonly previousClose: number | null;
    readonly up: RollingWindowCheckpoint;
    readonly down: RollingWindowCheckpoint;
    readonly seed: RingBufferCheckpoint<number>;
    readonly previous: number;
}
export interface VariableMovingAverageCheckpoint {
    readonly initialized: boolean;
    readonly deviation: RollingWindowCheckpoint;
    readonly prices: RingBufferCheckpoint<number>;
    readonly previous: number;
}
export interface McGinleyDynamicCheckpoint {
    readonly count: number;
    readonly seedSum: number;
    readonly seedValid: boolean;
    readonly previous: number | null;
}
export interface NickRypockTrailingReverseCheckpoint {
    readonly initialized: boolean;
    readonly k: number;
    readonly reverse: number;
    readonly highPrice: number;
    readonly lowPrice: number;
    readonly trend: -1 | 0 | 1;
    readonly validCount: number;
}
export interface OptimalTrackingCheckpoint {
    readonly validCount: number;
    readonly previousAverage: number;
    readonly previousDifference: number;
    readonly previousHalfRange: number;
    readonly previousResult: number;
    readonly lambda: number;
}
export interface SuperTrendParameters extends IndicatorParameters {
    readonly length: number;
    readonly multiplier: number;
}
export interface SuperTrendCheckpoint {
    readonly averageTrueRange: ExpandingAverageTrueRangeCheckpoint;
    readonly previousSupertrend: number | null;
    readonly previousClose: number | null;
    readonly previousUpperBand: number | null;
    readonly previousLowerBand: number | null;
    readonly trend: -1 | 1;
}
export declare class ParabolicSarProcessor extends SequentialIndicatorProcessor<IndicatorCandle, ParabolicSarCheckpoint> {
    readonly acceleration: number;
    readonly accelerationStep: number;
    readonly accelerationMax: number;
    private state;
    constructor(acceleration: number, accelerationStep: number, accelerationMax: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): ParabolicSarCheckpoint;
    protected restoreState(state: ParabolicSarCheckpoint): void;
    private evaluate;
}
export declare class McGinleyDynamicProcessor extends SequentialIndicatorProcessor<IndicatorCandle, McGinleyDynamicCheckpoint> {
    readonly length: number;
    private count;
    private seedSum;
    private seedValid;
    private previous;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): McGinleyDynamicCheckpoint;
    protected restoreState(state: McGinleyDynamicCheckpoint): void;
}
export declare class NickRypockTrailingReverseProcessor extends SequentialIndicatorProcessor<IndicatorCandle, NickRypockTrailingReverseCheckpoint> {
    readonly length: number;
    readonly multiple: number;
    private initialized;
    private k;
    private reverse;
    private highPrice;
    private lowPrice;
    private trend;
    private validCount;
    private readonly multiplier;
    constructor(length: number, multiple: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): NickRypockTrailingReverseCheckpoint;
    protected restoreState(state: NickRypockTrailingReverseCheckpoint): void;
}
export declare class OptimalTrackingProcessor extends SequentialIndicatorProcessor<IndicatorCandle, OptimalTrackingCheckpoint> {
    private validCount;
    private previousAverage;
    private previousDifference;
    private previousHalfRange;
    private previousResult;
    private lambda;
    constructor();
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): OptimalTrackingCheckpoint;
    protected restoreState(state: OptimalTrackingCheckpoint): void;
}
/** StockSharp SuperTrend with direction carried as painter metadata. */
export declare class SuperTrendProcessor extends SequentialIndicatorProcessor<IndicatorCandle, SuperTrendCheckpoint> {
    readonly length: number;
    readonly multiplier: number;
    private readonly averageTrueRange;
    private previousSupertrend;
    private previousClose;
    private previousUpperBand;
    private previousLowerBand;
    private trend;
    constructor(length: number, multiplier: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): SuperTrendCheckpoint;
    protected restoreState(state: SuperTrendCheckpoint): void;
}
export declare class KaufmanEfficiencyRatioProcessor extends SequentialIndicatorProcessor<IndicatorCandle, RollingEfficiencyRatioCheckpoint> {
    readonly length: number;
    private readonly ratio;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): RollingEfficiencyRatioCheckpoint;
    protected restoreState(state: RollingEfficiencyRatioCheckpoint): void;
}
export declare class AdaptiveLaguerreFilterProcessor extends SequentialIndicatorProcessor<IndicatorCandle, AdaptiveLaguerreFilterCheckpoint> {
    readonly gamma: number;
    private l0;
    private l1;
    private l2;
    private l3;
    private formed;
    constructor(gamma: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): AdaptiveLaguerreFilterCheckpoint;
    protected restoreState(state: AdaptiveLaguerreFilterCheckpoint): void;
}
export declare class LaguerreRsiProcessor extends SequentialIndicatorProcessor<IndicatorCandle, LaguerreRsiCheckpoint> {
    readonly gamma: number;
    private l0;
    private l1;
    private l2;
    private l3;
    private previousUp;
    private previousDown;
    private formed;
    constructor(gamma: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): LaguerreRsiCheckpoint;
    protected restoreState(state: LaguerreRsiCheckpoint): void;
}
export declare class AdaptivePriceZoneProcessor extends SequentialIndicatorProcessor<IndicatorCandle, AdaptivePriceZoneCheckpoint> {
    readonly period: number;
    readonly bandPercentage: number;
    private readonly average;
    private readonly deviation;
    constructor(period: number, bandPercentage: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): AdaptivePriceZoneCheckpoint;
    protected restoreState(state: AdaptivePriceZoneCheckpoint): void;
}
export declare class VidyaProcessor extends SequentialIndicatorProcessor<IndicatorCandle, VidyaCheckpoint> {
    readonly length: number;
    private initialized;
    private previousClose;
    private readonly up;
    private readonly down;
    private readonly seed;
    private seedSum;
    private previous;
    private readonly multiplier;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): VidyaCheckpoint;
    protected restoreState(state: VidyaCheckpoint): void;
}
export declare class VariableMovingAverageProcessor extends SequentialIndicatorProcessor<IndicatorCandle, VariableMovingAverageCheckpoint> {
    readonly length: number;
    readonly volatilityIndex: number;
    private initialized;
    private readonly deviation;
    private readonly prices;
    private priceSum;
    private previous;
    constructor(length: number, volatilityIndex: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): VariableMovingAverageCheckpoint;
    protected restoreState(state: VariableMovingAverageCheckpoint): void;
}
export declare class KaufmanAdaptiveMovingAverageProcessor extends SequentialIndicatorProcessor<IndicatorCandle, KaufmanAdaptiveCheckpoint> {
    readonly length: number;
    readonly fastSc: number;
    readonly slowSc: number;
    private readonly ratio;
    private readonly fastConstant;
    private readonly slowConstant;
    private disabled;
    private seeded;
    private previous;
    constructor(length: number, fastSc: number, slowSc: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): KaufmanAdaptiveCheckpoint;
    protected restoreState(state: KaufmanAdaptiveCheckpoint): void;
}
export declare class FractalAdaptiveMovingAverageProcessor extends SequentialIndicatorProcessor<IndicatorCandle, FractalAdaptiveCheckpoint> {
    readonly length: number;
    private readonly period;
    private readonly remaining;
    private readonly closes;
    private readonly periodMinimum;
    private readonly periodMaximum;
    private readonly remainingMinimum;
    private readonly remainingMaximum;
    private readonly periodRanges;
    private previous;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): FractalAdaptiveCheckpoint;
    protected restoreState(state: FractalAdaptiveCheckpoint): void;
    private delayedRange;
    private restoreClose;
}
export declare const ParabolicSarIndicator: IndicatorDefinition<IndicatorCandle, ParabolicSarParameters>;
export declare const McGinleyDynamicIndicator: IndicatorDefinition<IndicatorCandle, AdaptiveLengthParameters>;
export declare const NickRypockTrailingReverseIndicator: IndicatorDefinition<IndicatorCandle, NickRypockTrailingReverseParameters>;
export declare const OptimalTrackingIndicator: IndicatorDefinition<IndicatorCandle, IndicatorParameters>;
export declare const SuperTrendIndicator: IndicatorDefinition<IndicatorCandle, SuperTrendParameters>;
export declare const VidyaIndicator: IndicatorDefinition<IndicatorCandle, AdaptiveLengthParameters>;
export declare const VariableMovingAverageIndicator: IndicatorDefinition<IndicatorCandle, VariableMovingAverageParameters>;
export declare const KaufmanAdaptiveMovingAverageIndicator: IndicatorDefinition<IndicatorCandle, KaufmanAdaptiveParameters>;
export declare const KaufmanEfficiencyRatioIndicator: IndicatorDefinition<IndicatorCandle, AdaptiveLengthParameters>;
export declare const FractalAdaptiveMovingAverageIndicator: IndicatorDefinition<IndicatorCandle, AdaptiveLengthParameters>;
export declare const AdaptiveLaguerreFilterIndicator: IndicatorDefinition<IndicatorCandle, AdaptiveLaguerreFilterParameters>;
export declare const LaguerreRsiIndicator: IndicatorDefinition<IndicatorCandle, LaguerreRsiParameters>;
export declare const AdaptivePriceZoneIndicator: IndicatorDefinition<IndicatorCandle, AdaptivePriceZoneParameters>;
export declare const AdaptiveIndicators: readonly [IndicatorDefinition<IndicatorCandle, ParabolicSarParameters>, IndicatorDefinition<IndicatorCandle, AdaptiveLengthParameters>, IndicatorDefinition<IndicatorCandle, NickRypockTrailingReverseParameters>, IndicatorDefinition<IndicatorCandle, Readonly<Record<string, import("../indicator-definition.js").IndicatorParameterValue>>>, IndicatorDefinition<IndicatorCandle, SuperTrendParameters>, IndicatorDefinition<IndicatorCandle, AdaptiveLengthParameters>, IndicatorDefinition<IndicatorCandle, VariableMovingAverageParameters>, IndicatorDefinition<IndicatorCandle, KaufmanAdaptiveParameters>, IndicatorDefinition<IndicatorCandle, AdaptiveLengthParameters>, IndicatorDefinition<IndicatorCandle, AdaptiveLengthParameters>, IndicatorDefinition<IndicatorCandle, AdaptiveLaguerreFilterParameters>, IndicatorDefinition<IndicatorCandle, LaguerreRsiParameters>, IndicatorDefinition<IndicatorCandle, AdaptivePriceZoneParameters>];

// Public API module: indicators/built-ins/compound-definitions.d.ts
import { type IndicatorCandle, type IndicatorDefinition, type IndicatorParameters, type IndicatorProcessInput } from '../indicator-definition.js';
import { SequentialIndicatorProcessor, type IndicatorCalculationResult } from '../sequential-processor.js';
import { type RollingWindowCheckpoint, type ExpandingAverageTrueRangeCheckpoint, type PartialRelativeStrengthIndexCheckpoint, type PartialSeedExponentialMovingAverageCheckpoint, type RingBufferCheckpoint, type SeededMovingAverageCheckpoint } from '../math/index.js';
export interface BollingerBandsParameters extends IndicatorParameters {
    readonly length: number;
    readonly stdDev: number;
}
export interface BollingerPercentBParameters extends IndicatorParameters {
    readonly length: number;
    readonly stdDevMultiplier: number;
}
export interface KeltnerChannelsParameters extends IndicatorParameters {
    readonly length: number;
    readonly multiplier: number;
}
export interface KeltnerChannelsCheckpoint {
    readonly middle: PartialSeedExponentialMovingAverageCheckpoint;
    readonly averageTrueRange: ExpandingAverageTrueRangeCheckpoint;
}
export interface KasePeakOscillatorParameters extends IndicatorParameters {
    readonly atrLength: number;
    readonly shortPeriod: number;
    readonly longPeriod: number;
}
export interface KasePeakOscillatorCheckpoint {
    readonly averageTrueRange: ExpandingAverageTrueRangeCheckpoint;
    readonly peaks: RingBufferCheckpoint<number>;
    readonly valleys: RingBufferCheckpoint<number>;
    readonly previousClose: number;
}
export interface KnowSureThingParameters extends IndicatorParameters {
    readonly roc1Length: number;
    readonly roc2Length: number;
    readonly roc3Length: number;
    readonly roc4Length: number;
    readonly sma1Length: number;
    readonly sma2Length: number;
    readonly sma3Length: number;
    readonly sma4Length: number;
    readonly signalLength: number;
}
export interface KnowSureThingCheckpoint {
    readonly closes: RingBufferCheckpoint<number | null>;
    readonly averages: readonly RollingWindowCheckpoint[];
    readonly signal: RollingWindowCheckpoint;
}
export interface KlingerVolumeOscillatorParameters extends IndicatorParameters {
    readonly shortPeriod: number;
    readonly longPeriod: number;
}
export interface KlingerVolumeOscillatorCheckpoint {
    readonly previousHlc: number;
    readonly short: FiniteExponentialCheckpoint;
    readonly long: FiniteExponentialCheckpoint;
}
export interface MovingAverageCrossoverParameters extends IndicatorParameters {
    readonly shortPeriod: number;
    readonly longPeriod: number;
}
export interface MovingAverageCrossoverCheckpoint {
    readonly fast: RollingWindowCheckpoint;
    readonly slow: RollingWindowCheckpoint;
}
export interface MovingAverageRibbonParameters extends IndicatorParameters {
    readonly shortPeriod: number;
    readonly longPeriod: number;
    readonly ribbonCount: number;
}
export interface MovingAverageRibbonCheckpoint {
    readonly averages: readonly RollingWindowCheckpoint[];
}
export interface RainbowChartsParameters extends IndicatorParameters {
    readonly lines: number;
}
export interface RainbowChartsCheckpoint {
    readonly averages: readonly RollingWindowCheckpoint[];
}
export interface McClellanOscillatorParameters extends IndicatorParameters {
    readonly shortLength: number;
    readonly longLength: number;
}
export interface McClellanOscillatorCheckpoint {
    readonly short: SeededMovingAverageCheckpoint;
    readonly long: SeededMovingAverageCheckpoint;
}
export interface RelativeVigorIndexParameters extends IndicatorParameters {
    readonly length: number;
    readonly signalLength: number;
}
export interface RelativeVigorSample {
    readonly numerator: number;
    readonly denominator: number;
}
export interface RelativeVigorIndexCheckpoint {
    readonly samples: RingBufferCheckpoint<RelativeVigorSample | null>;
    readonly values: RingBufferCheckpoint<number | null>;
}
export interface ConstanceBrownCompositeIndexParameters extends IndicatorParameters {
    readonly rsiLength: number;
    readonly rocLength: number;
    readonly shortRsiLength: number;
    readonly momentumLength: number;
    readonly fastSmaLength: number;
    readonly slowSmaLength: number;
}
export interface ConstanceBrownCompositeIndexCheckpoint {
    readonly rsi: PartialRelativeStrengthIndexCheckpoint;
    readonly shortRsi: PartialRelativeStrengthIndexCheckpoint;
    readonly rsiHistory: RingBufferCheckpoint<number | null>;
    readonly momentum: RingBufferCheckpoint<number>;
    readonly fastSma: RollingWindowCheckpoint;
    readonly slowSma: RollingWindowCheckpoint;
}
export interface CompositeMomentumParameters extends IndicatorParameters {
    readonly shortRocLength: number;
    readonly longRocLength: number;
    readonly rsiLength: number;
    readonly fastLength: number;
    readonly slowLength: number;
    readonly smaLength: number;
}
export interface CompositeMomentumCheckpoint {
    readonly shortRoc: RingBufferCheckpoint<number | null>;
    readonly longRoc: RingBufferCheckpoint<number | null>;
    readonly rsi: PartialRelativeStrengthIndexCheckpoint;
    readonly fast: FiniteExponentialCheckpoint;
    readonly slow: FiniteExponentialCheckpoint;
    readonly average: RollingWindowCheckpoint;
}
export interface ElderImpulseParameters extends IndicatorParameters {
    readonly emaLength: number;
    readonly fastLength: number;
    readonly slowLength: number;
}
export interface ElderImpulseCheckpoint {
    readonly ema: PartialSeedExponentialMovingAverageCheckpoint;
    readonly fast: PartialSeedExponentialMovingAverageCheckpoint;
    readonly slow: PartialSeedExponentialMovingAverageCheckpoint;
    readonly previousEma: number | null;
    readonly previousMacd: number | null;
}
export interface BollingerBandsCheckpoint {
    readonly average: RollingWindowCheckpoint;
    readonly deviation: RollingWindowCheckpoint;
}
export interface PriceChannelsCheckpoint {
    readonly high: RollingWindowCheckpoint;
    readonly low: RollingWindowCheckpoint;
}
export interface DonchianChannelsCheckpoint {
    readonly high: RollingWindowCheckpoint;
    readonly low: RollingWindowCheckpoint;
}
export interface TrueStrengthIndexParameters extends IndicatorParameters {
    readonly firstLength: number;
    readonly secondLength: number;
    readonly signalLength: number;
}
export interface TrueStrengthIndexCheckpoint {
    readonly initialized: boolean;
    readonly previousClose: number | null;
    readonly firstMomentum: PartialSeedExponentialMovingAverageCheckpoint;
    readonly firstAbsoluteMomentum: PartialSeedExponentialMovingAverageCheckpoint;
    readonly doubleMomentum: PartialSeedExponentialMovingAverageCheckpoint;
    readonly doubleAbsoluteMomentum: PartialSeedExponentialMovingAverageCheckpoint;
    readonly signal: PartialSeedExponentialMovingAverageCheckpoint;
}
export interface WaveTrendOscillatorParameters extends IndicatorParameters {
    readonly esaPeriod: number;
    readonly dPeriod: number;
    readonly averagePeriod: number;
}
export interface WaveTrendOscillatorCheckpoint {
    readonly esa: SeededMovingAverageCheckpoint;
    readonly deviation: SeededMovingAverageCheckpoint;
    readonly average: RingBufferCheckpoint<number>;
}
export interface WoodiesCciParameters extends IndicatorParameters {
    readonly length: number;
    readonly smaLength: number;
}
export interface WoodiesCciCheckpoint {
    readonly cci: RingBufferCheckpoint<number | null>;
    readonly signal: RollingWindowCheckpoint;
}
export declare class PivotPointsProcessor extends SequentialIndicatorProcessor<IndicatorCandle, null> {
    constructor();
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, _commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): null;
    protected restoreState(state: null): void;
}
export declare class RelativeVigorIndexProcessor extends SequentialIndicatorProcessor<IndicatorCandle, RelativeVigorIndexCheckpoint> {
    readonly length: number;
    readonly signalLength: number;
    private readonly samples;
    private readonly values;
    constructor(length: number, signalLength: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): RelativeVigorIndexCheckpoint;
    protected restoreState(state: RelativeVigorIndexCheckpoint): void;
    private weightedSample;
    private weightedValue;
}
export declare class BollingerBandsProcessor extends SequentialIndicatorProcessor<IndicatorCandle, BollingerBandsCheckpoint> {
    readonly length: number;
    readonly multiplier: number;
    private readonly average;
    private readonly deviation;
    constructor(length: number, multiplier: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): BollingerBandsCheckpoint;
    protected restoreState(state: BollingerBandsCheckpoint): void;
}
export declare class PriceChannelsProcessor extends SequentialIndicatorProcessor<IndicatorCandle, PriceChannelsCheckpoint> {
    readonly length: number;
    private readonly high;
    private readonly low;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): PriceChannelsCheckpoint;
    protected restoreState(state: PriceChannelsCheckpoint): void;
}
export declare class DonchianChannelsProcessor extends SequentialIndicatorProcessor<IndicatorCandle, DonchianChannelsCheckpoint> {
    readonly length: number;
    private readonly high;
    private readonly low;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): DonchianChannelsCheckpoint;
    protected restoreState(state: DonchianChannelsCheckpoint): void;
}
export declare class DetrendedSyntheticPriceProcessor extends SequentialIndicatorProcessor<IndicatorCandle, DonchianChannelsCheckpoint> {
    readonly length: number;
    private readonly high;
    private readonly low;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): DonchianChannelsCheckpoint;
    protected restoreState(state: DonchianChannelsCheckpoint): void;
}
export declare class TrueStrengthIndexProcessor extends SequentialIndicatorProcessor<IndicatorCandle, TrueStrengthIndexCheckpoint> {
    readonly firstLength: number;
    readonly secondLength: number;
    readonly signalLength: number;
    private initialized;
    private previousClose;
    private readonly firstMomentum;
    private readonly firstAbsoluteMomentum;
    private readonly doubleMomentum;
    private readonly doubleAbsoluteMomentum;
    private readonly signal;
    constructor(firstLength: number, secondLength: number, signalLength: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): TrueStrengthIndexCheckpoint;
    protected restoreState(state: TrueStrengthIndexCheckpoint): void;
}
export declare class WaveTrendOscillatorProcessor extends SequentialIndicatorProcessor<IndicatorCandle, WaveTrendOscillatorCheckpoint> {
    readonly esaPeriod: number;
    readonly dPeriod: number;
    readonly averagePeriod: number;
    private readonly esa;
    private readonly deviation;
    private readonly average;
    constructor(esaPeriod: number, dPeriod: number, averagePeriod: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): WaveTrendOscillatorCheckpoint;
    protected restoreState(state: WaveTrendOscillatorCheckpoint): void;
    private empty;
}
export declare class WoodiesCciProcessor extends SequentialIndicatorProcessor<IndicatorCandle, WoodiesCciCheckpoint> {
    readonly length: number;
    readonly smaLength: number;
    private readonly cci;
    private readonly signal;
    constructor(length: number, smaLength: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): WoodiesCciCheckpoint;
    protected restoreState(state: WoodiesCciCheckpoint): void;
}
export declare class KeltnerChannelsProcessor extends SequentialIndicatorProcessor<IndicatorCandle, KeltnerChannelsCheckpoint> {
    readonly length: number;
    readonly multiplier: number;
    private readonly middle;
    private readonly averageTrueRange;
    constructor(length: number, multiplier: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): KeltnerChannelsCheckpoint;
    protected restoreState(state: KeltnerChannelsCheckpoint): void;
}
export declare class KasePeakOscillatorProcessor extends SequentialIndicatorProcessor<IndicatorCandle, KasePeakOscillatorCheckpoint> {
    readonly atrLength: number;
    readonly shortPeriod: number;
    readonly longPeriod: number;
    private readonly averageTrueRange;
    private readonly peaks;
    private readonly valleys;
    private previousClose;
    constructor(atrLength: number, shortPeriod: number, longPeriod: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): KasePeakOscillatorCheckpoint;
    protected restoreState(state: KasePeakOscillatorCheckpoint): void;
    private nextBuffer;
}
export declare class KnowSureThingProcessor extends SequentialIndicatorProcessor<IndicatorCandle, KnowSureThingCheckpoint> {
    readonly roc1Length: number;
    readonly roc2Length: number;
    readonly roc3Length: number;
    readonly roc4Length: number;
    readonly sma1Length: number;
    readonly sma2Length: number;
    readonly sma3Length: number;
    readonly sma4Length: number;
    readonly signalLength: number;
    private readonly rocLengths;
    private readonly closes;
    private readonly averages;
    private readonly signal;
    constructor(roc1Length: number, roc2Length: number, roc3Length: number, roc4Length: number, sma1Length: number, sma2Length: number, sma3Length: number, sma4Length: number, signalLength: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): KnowSureThingCheckpoint;
    protected restoreState(state: KnowSureThingCheckpoint): void;
}
export declare class BollingerPercentBProcessor extends SequentialIndicatorProcessor<IndicatorCandle, BollingerBandsCheckpoint> {
    readonly length: number;
    readonly stdDevMultiplier: number;
    private readonly average;
    private readonly deviation;
    constructor(length: number, stdDevMultiplier: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): BollingerBandsCheckpoint;
    protected restoreState(state: BollingerBandsCheckpoint): void;
}
export declare class ConstanceBrownCompositeIndexProcessor extends SequentialIndicatorProcessor<IndicatorCandle, ConstanceBrownCompositeIndexCheckpoint> {
    readonly rsiLength: number;
    readonly rocLength: number;
    readonly shortRsiLength: number;
    readonly momentumLength: number;
    readonly fastSmaLength: number;
    readonly slowSmaLength: number;
    private readonly rsi;
    private readonly shortRsi;
    private readonly rsiHistory;
    private readonly momentum;
    private readonly fastSma;
    private readonly slowSma;
    private readonly combinedBar;
    constructor(rsiLength: number, rocLength: number, shortRsiLength: number, momentumLength: number, fastSmaLength: number, slowSmaLength: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): ConstanceBrownCompositeIndexCheckpoint;
    protected restoreState(state: ConstanceBrownCompositeIndexCheckpoint): void;
    private roc;
}
export interface EnvelopeParameters extends IndicatorParameters {
    readonly length: number;
    readonly percent: number;
}
export declare class EnvelopeProcessor extends SequentialIndicatorProcessor<IndicatorCandle, RollingWindowCheckpoint> {
    readonly length: number;
    readonly percent: number;
    private readonly average;
    constructor(length: number, percent: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): RollingWindowCheckpoint;
    protected restoreState(state: RollingWindowCheckpoint): void;
}
export interface AwesomeOscillatorParameters extends IndicatorParameters {
    readonly shortLength: number;
    readonly longLength: number;
}
export interface ElliotWaveOscillatorParameters extends IndicatorParameters {
    readonly shortPeriod: number;
    readonly longPeriod: number;
}
export interface ElliotWaveOscillatorCheckpoint {
    readonly short: RollingWindowCheckpoint;
    readonly long: RollingWindowCheckpoint;
}
export interface GuppyMultipleMovingAverageCheckpoint {
    readonly short: readonly SeededMovingAverageCheckpoint[];
    readonly long: readonly SeededMovingAverageCheckpoint[];
}
export interface AwesomeOscillatorCheckpoint {
    readonly short: RollingWindowCheckpoint;
    readonly long: RollingWindowCheckpoint;
    readonly previous: number | null;
}
export interface AccelerationParameters extends IndicatorParameters {
    readonly shortLength: number;
    readonly longLength: number;
    readonly smaLength: number;
}
export interface AccelerationCheckpoint {
    readonly short: RollingWindowCheckpoint;
    readonly long: RollingWindowCheckpoint;
    readonly average: RollingWindowCheckpoint;
}
export declare class AccelerationProcessor extends SequentialIndicatorProcessor<IndicatorCandle, AccelerationCheckpoint> {
    readonly shortLength: number;
    readonly longLength: number;
    readonly smaLength: number;
    private readonly short;
    private readonly long;
    private readonly average;
    constructor(shortLength: number, longLength: number, smaLength: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): AccelerationCheckpoint;
    protected restoreState(state: AccelerationCheckpoint): void;
}
export declare class AwesomeOscillatorProcessor extends SequentialIndicatorProcessor<IndicatorCandle, AwesomeOscillatorCheckpoint> {
    readonly shortLength: number;
    readonly longLength: number;
    private readonly short;
    private readonly long;
    private previous;
    constructor(shortLength: number, longLength: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): AwesomeOscillatorCheckpoint;
    protected restoreState(state: AwesomeOscillatorCheckpoint): void;
}
export declare class ElliotWaveOscillatorProcessor extends SequentialIndicatorProcessor<IndicatorCandle, ElliotWaveOscillatorCheckpoint> {
    readonly shortPeriod: number;
    readonly longPeriod: number;
    private readonly short;
    private readonly long;
    constructor(shortPeriod: number, longPeriod: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): ElliotWaveOscillatorCheckpoint;
    protected restoreState(state: ElliotWaveOscillatorCheckpoint): void;
}
export declare class GuppyMultipleMovingAverageProcessor extends SequentialIndicatorProcessor<IndicatorCandle, GuppyMultipleMovingAverageCheckpoint> {
    private readonly short;
    private readonly long;
    constructor();
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): GuppyMultipleMovingAverageCheckpoint;
    protected restoreState(state: GuppyMultipleMovingAverageCheckpoint): void;
}
export interface FiniteExponentialCheckpoint {
    readonly count: number;
    readonly seedSum: number;
    readonly formed: boolean;
    readonly previous: number;
}
export declare class KlingerVolumeOscillatorProcessor extends SequentialIndicatorProcessor<IndicatorCandle, KlingerVolumeOscillatorCheckpoint> {
    readonly shortPeriod: number;
    readonly longPeriod: number;
    private previousHlc;
    private readonly short;
    private readonly long;
    constructor(shortPeriod: number, longPeriod: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): KlingerVolumeOscillatorCheckpoint;
    protected restoreState(state: KlingerVolumeOscillatorCheckpoint): void;
}
export declare class MovingAverageCrossoverProcessor extends SequentialIndicatorProcessor<IndicatorCandle, MovingAverageCrossoverCheckpoint> {
    readonly shortPeriod: number;
    readonly longPeriod: number;
    private readonly fast;
    private readonly slow;
    constructor(shortPeriod: number, longPeriod: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): MovingAverageCrossoverCheckpoint;
    protected restoreState(state: MovingAverageCrossoverCheckpoint): void;
}
export declare class MovingAverageRibbonProcessor extends SequentialIndicatorProcessor<IndicatorCandle, MovingAverageRibbonCheckpoint> {
    readonly lengths: readonly number[];
    private readonly averages;
    constructor(shortPeriod: number, longPeriod: number, ribbonCount: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): MovingAverageRibbonCheckpoint;
    protected restoreState(state: MovingAverageRibbonCheckpoint): void;
}
export declare class RainbowChartsProcessor extends SequentialIndicatorProcessor<IndicatorCandle, RainbowChartsCheckpoint> {
    readonly lines: number;
    private readonly averages;
    constructor(lines: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): RainbowChartsCheckpoint;
    protected restoreState(state: RainbowChartsCheckpoint): void;
}
export declare class McClellanOscillatorProcessor extends SequentialIndicatorProcessor<IndicatorCandle, McClellanOscillatorCheckpoint> {
    readonly shortLength: number;
    readonly longLength: number;
    private readonly short;
    private readonly long;
    constructor(shortLength: number, longLength: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): McClellanOscillatorCheckpoint;
    protected restoreState(state: McClellanOscillatorCheckpoint): void;
}
export declare class CompositeMomentumProcessor extends SequentialIndicatorProcessor<IndicatorCandle, CompositeMomentumCheckpoint> {
    readonly shortRocLength: number;
    readonly longRocLength: number;
    readonly rsiLength: number;
    readonly fastLength: number;
    readonly slowLength: number;
    readonly smaLength: number;
    private readonly shortRoc;
    private readonly longRoc;
    private readonly rsi;
    private readonly fast;
    private readonly slow;
    private readonly average;
    constructor(shortRocLength: number, longRocLength: number, rsiLength: number, fastLength: number, slowLength: number, smaLength: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): CompositeMomentumCheckpoint;
    protected restoreState(state: CompositeMomentumCheckpoint): void;
    private rateOfChange;
}
export declare class ElderImpulseProcessor extends SequentialIndicatorProcessor<IndicatorCandle, ElderImpulseCheckpoint> {
    readonly emaLength: number;
    readonly fastLength: number;
    readonly slowLength: number;
    private readonly ema;
    private readonly fast;
    private readonly slow;
    private readonly formBar;
    private previousEma;
    private previousMacd;
    constructor(emaLength: number, fastLength: number, slowLength: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): ElderImpulseCheckpoint;
    protected restoreState(state: ElderImpulseCheckpoint): void;
}
export interface MacdParameters extends IndicatorParameters {
    readonly fastLength: number;
    readonly slowLength: number;
    readonly signalLength: number;
}
export interface MacdSignalParameters extends IndicatorParameters {
    readonly longLength: number;
    readonly shortLength: number;
    readonly signalLength: number;
}
export interface PercentagePriceOscillatorParameters extends IndicatorParameters {
    readonly shortLength: number;
    readonly longLength: number;
    readonly signalLength: number;
}
export interface PercentagePriceOscillatorCheckpoint {
    readonly short: FiniteExponentialCheckpoint;
    readonly long: FiniteExponentialCheckpoint;
    readonly signal: FiniteExponentialCheckpoint;
}
export interface SchaffTrendCycleParameters extends IndicatorParameters {
    readonly length: number;
    readonly shortLength: number;
    readonly longLength: number;
    readonly cycleLength: number;
    readonly signalLength: number;
}
export interface SchaffTrendCycleCheckpoint {
    readonly macd: MacdCheckpoint;
    readonly closeHigh: RollingWindowCheckpoint;
    readonly closeLow: RollingWindowCheckpoint;
    readonly stochasticHigh: RollingWindowCheckpoint;
    readonly stochasticLow: RollingWindowCheckpoint;
    readonly average: FiniteExponentialCheckpoint;
    readonly previousStochastic: number;
}
export interface CompoundLengthParameters extends IndicatorParameters {
    readonly length: number;
}
export interface DoubleExponentialMovingAverageCheckpoint {
    readonly first: SeededMovingAverageCheckpoint;
    readonly second: FiniteExponentialCheckpoint;
}
export interface TripleExponentialMovingAverageCheckpoint {
    readonly first: SeededMovingAverageCheckpoint;
    readonly second: FiniteExponentialCheckpoint;
    readonly third: FiniteExponentialCheckpoint;
}
export interface T3MovingAverageParameters extends IndicatorParameters {
    readonly length: number;
    readonly volumeFactor: number;
}
export interface T3MovingAverageCheckpoint {
    readonly averages: readonly PartialSeedExponentialMovingAverageCheckpoint[];
    readonly warmUpPeriod: number;
}
export interface TrixCheckpoint {
    readonly first: FiniteExponentialCheckpoint;
    readonly second: FiniteExponentialCheckpoint;
    readonly third: FiniteExponentialCheckpoint;
    readonly previous: number | null;
}
export declare class TrixProcessor extends SequentialIndicatorProcessor<IndicatorCandle, TrixCheckpoint> {
    readonly length: number;
    private readonly first;
    private readonly second;
    private readonly third;
    private previous;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): TrixCheckpoint;
    protected restoreState(state: TrixCheckpoint): void;
}
export interface HullMovingAverageParameters extends IndicatorParameters {
    readonly length: number;
    readonly sqrtPeriod: number;
}
export interface HullMovingAverageCheckpoint {
    readonly slow: RollingWindowCheckpoint;
    readonly fast: RollingWindowCheckpoint;
    readonly result: RollingWindowCheckpoint;
}
export declare class DoubleExponentialMovingAverageProcessor extends SequentialIndicatorProcessor<IndicatorCandle, DoubleExponentialMovingAverageCheckpoint> {
    readonly length: number;
    private readonly first;
    private readonly second;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): DoubleExponentialMovingAverageCheckpoint;
    protected restoreState(state: DoubleExponentialMovingAverageCheckpoint): void;
}
export declare class TripleExponentialMovingAverageProcessor extends SequentialIndicatorProcessor<IndicatorCandle, TripleExponentialMovingAverageCheckpoint> {
    readonly length: number;
    private readonly first;
    private readonly second;
    private readonly third;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): TripleExponentialMovingAverageCheckpoint;
    protected restoreState(state: TripleExponentialMovingAverageCheckpoint): void;
}
export declare class T3MovingAverageProcessor extends SequentialIndicatorProcessor<IndicatorCandle, T3MovingAverageCheckpoint> {
    readonly length: number;
    readonly volumeFactor: number;
    private readonly averages;
    private readonly coefficients;
    private warmUpPeriod;
    constructor(length: number, volumeFactor: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): T3MovingAverageCheckpoint;
    protected restoreState(state: T3MovingAverageCheckpoint): void;
}
export declare class HullMovingAverageProcessor extends SequentialIndicatorProcessor<IndicatorCandle, HullMovingAverageCheckpoint> {
    readonly length: number;
    readonly sqrtPeriod: number;
    readonly halfLength: number;
    readonly resultLength: number;
    private readonly slow;
    private readonly fast;
    private readonly result;
    constructor(length: number, sqrtPeriod: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): HullMovingAverageCheckpoint;
    protected restoreState(state: HullMovingAverageCheckpoint): void;
}
export interface MacdCheckpoint {
    readonly fast: FiniteExponentialCheckpoint;
    readonly slow: FiniteExponentialCheckpoint;
    readonly signal: FiniteExponentialCheckpoint;
}
export declare class MacdProcessor extends SequentialIndicatorProcessor<IndicatorCandle, MacdCheckpoint> {
    readonly fastLength: number;
    readonly slowLength: number;
    readonly signalLength: number;
    private readonly kernel;
    constructor(fastLength: number, slowLength: number, signalLength: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): MacdCheckpoint;
    protected restoreState(state: MacdCheckpoint): void;
}
export declare class MacdSignalProcessor extends SequentialIndicatorProcessor<IndicatorCandle, MacdCheckpoint> {
    readonly longLength: number;
    readonly shortLength: number;
    readonly signalLength: number;
    private readonly kernel;
    constructor(longLength: number, shortLength: number, signalLength: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): MacdCheckpoint;
    protected restoreState(state: MacdCheckpoint): void;
}
export declare class PercentagePriceOscillatorProcessor extends SequentialIndicatorProcessor<IndicatorCandle, PercentagePriceOscillatorCheckpoint> {
    readonly shortLength: number;
    readonly longLength: number;
    readonly signalLength: number;
    private readonly short;
    private readonly long;
    private readonly signal;
    constructor(shortLength: number, longLength: number, signalLength: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): PercentagePriceOscillatorCheckpoint;
    protected restoreState(state: PercentagePriceOscillatorCheckpoint): void;
}
export declare class SchaffTrendCycleProcessor extends SequentialIndicatorProcessor<IndicatorCandle, SchaffTrendCycleCheckpoint> {
    readonly length: number;
    readonly shortLength: number;
    readonly longLength: number;
    readonly cycleLength: number;
    readonly signalLength: number;
    private readonly macd;
    private readonly closeHigh;
    private readonly closeLow;
    private readonly stochasticHigh;
    private readonly stochasticLow;
    private readonly average;
    private previousStochastic;
    constructor(length: number, shortLength: number, longLength: number, cycleLength: number, signalLength: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): SchaffTrendCycleCheckpoint;
    protected restoreState(state: SchaffTrendCycleCheckpoint): void;
}
export interface StochasticParameters extends IndicatorParameters {
    readonly kPeriod: number;
    readonly dPeriod: number;
    readonly smooth: number;
}
export interface FastStochasticParameters extends IndicatorParameters {
    readonly kPeriod: number;
    readonly dPeriod: number;
}
export interface StochasticCheckpoint {
    readonly high: RollingWindowCheckpoint;
    readonly low: RollingWindowCheckpoint;
    readonly k: RollingWindowCheckpoint;
    readonly d: RollingWindowCheckpoint;
}
export declare class StochasticProcessor extends SequentialIndicatorProcessor<IndicatorCandle, StochasticCheckpoint> {
    readonly kPeriod: number;
    readonly dPeriod: number;
    readonly smooth: number;
    private readonly high;
    private readonly low;
    private readonly k;
    private readonly d;
    constructor(kPeriod: number, dPeriod: number, smooth: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): StochasticCheckpoint;
    protected restoreState(state: StochasticCheckpoint): void;
}
export declare class FastStochasticProcessor extends StochasticProcessor {
    constructor(kPeriod: number, dPeriod: number);
}
export declare const PivotPointsIndicator: IndicatorDefinition<IndicatorCandle, IndicatorParameters>;
export declare const RelativeVigorIndexIndicator: IndicatorDefinition<IndicatorCandle, RelativeVigorIndexParameters>;
export declare const BollingerBandsIndicator: IndicatorDefinition<IndicatorCandle, BollingerBandsParameters>;
export declare const PriceChannelsIndicator: IndicatorDefinition<IndicatorCandle, CompoundLengthParameters>;
export declare const DonchianChannelsIndicator: IndicatorDefinition<IndicatorCandle, CompoundLengthParameters>;
export declare const DetrendedSyntheticPriceIndicator: IndicatorDefinition<IndicatorCandle, CompoundLengthParameters>;
export declare const TrueStrengthIndexIndicator: IndicatorDefinition<IndicatorCandle, TrueStrengthIndexParameters>;
export declare const WaveTrendOscillatorIndicator: IndicatorDefinition<IndicatorCandle, WaveTrendOscillatorParameters>;
export declare const WoodiesCciIndicator: IndicatorDefinition<IndicatorCandle, WoodiesCciParameters>;
export declare const KeltnerChannelsIndicator: IndicatorDefinition<IndicatorCandle, KeltnerChannelsParameters>;
export declare const KasePeakOscillatorIndicator: IndicatorDefinition<IndicatorCandle, KasePeakOscillatorParameters>;
export declare const KnowSureThingIndicator: IndicatorDefinition<IndicatorCandle, KnowSureThingParameters>;
export declare const KlingerVolumeOscillatorIndicator: IndicatorDefinition<IndicatorCandle, KlingerVolumeOscillatorParameters>;
export declare const MovingAverageCrossoverIndicator: IndicatorDefinition<IndicatorCandle, MovingAverageCrossoverParameters>;
export declare const MovingAverageRibbonIndicator: IndicatorDefinition<IndicatorCandle, MovingAverageRibbonParameters>;
export declare const RainbowChartsIndicator: IndicatorDefinition<IndicatorCandle, RainbowChartsParameters>;
export declare const McClellanOscillatorIndicator: IndicatorDefinition<IndicatorCandle, McClellanOscillatorParameters>;
export declare const EnvelopeIndicator: IndicatorDefinition<IndicatorCandle, EnvelopeParameters>;
export declare const AwesomeOscillatorIndicator: IndicatorDefinition<IndicatorCandle, AwesomeOscillatorParameters>;
export declare const ElliotWaveOscillatorIndicator: IndicatorDefinition<IndicatorCandle, ElliotWaveOscillatorParameters>;
export declare const GuppyMultipleMovingAverageIndicator: IndicatorDefinition<IndicatorCandle, IndicatorParameters>;
export declare const AccelerationIndicator: IndicatorDefinition<IndicatorCandle, AccelerationParameters>;
export declare const TrixIndicator: IndicatorDefinition<IndicatorCandle, CompoundLengthParameters>;
export declare const DoubleExponentialMovingAverageIndicator: IndicatorDefinition<IndicatorCandle, CompoundLengthParameters>;
export declare const TripleExponentialMovingAverageIndicator: IndicatorDefinition<IndicatorCandle, CompoundLengthParameters>;
export declare const T3MovingAverageIndicator: IndicatorDefinition<IndicatorCandle, T3MovingAverageParameters>;
export declare const HullMovingAverageIndicator: IndicatorDefinition<IndicatorCandle, HullMovingAverageParameters>;
export declare const MacdIndicator: IndicatorDefinition<IndicatorCandle, MacdParameters>;
export declare const MacdSignalIndicator: IndicatorDefinition<IndicatorCandle, MacdSignalParameters>;
export declare const PercentagePriceOscillatorIndicator: IndicatorDefinition<IndicatorCandle, PercentagePriceOscillatorParameters>;
export declare const SchaffTrendCycleIndicator: IndicatorDefinition<IndicatorCandle, SchaffTrendCycleParameters>;
export declare const StochasticIndicator: IndicatorDefinition<IndicatorCandle, StochasticParameters>;
export declare const FastStochasticIndicator: IndicatorDefinition<IndicatorCandle, FastStochasticParameters>;
export declare const BollingerPercentBIndicator: IndicatorDefinition<IndicatorCandle, BollingerPercentBParameters>;
export declare const ConstanceBrownCompositeIndexIndicator: IndicatorDefinition<IndicatorCandle, ConstanceBrownCompositeIndexParameters>;
export declare const CompositeMomentumIndicator: IndicatorDefinition<IndicatorCandle, CompositeMomentumParameters>;
export declare const ElderImpulseIndicator: IndicatorDefinition<IndicatorCandle, ElderImpulseParameters>;
export declare const CompoundIndicators: readonly [IndicatorDefinition<IndicatorCandle, Readonly<Record<string, import("../indicator-definition.js").IndicatorParameterValue>>>, IndicatorDefinition<IndicatorCandle, RelativeVigorIndexParameters>, IndicatorDefinition<IndicatorCandle, BollingerBandsParameters>, IndicatorDefinition<IndicatorCandle, CompoundLengthParameters>, IndicatorDefinition<IndicatorCandle, TrueStrengthIndexParameters>, IndicatorDefinition<IndicatorCandle, KeltnerChannelsParameters>, IndicatorDefinition<IndicatorCandle, KasePeakOscillatorParameters>, IndicatorDefinition<IndicatorCandle, KnowSureThingParameters>, IndicatorDefinition<IndicatorCandle, KlingerVolumeOscillatorParameters>, IndicatorDefinition<IndicatorCandle, MovingAverageCrossoverParameters>, IndicatorDefinition<IndicatorCandle, MovingAverageRibbonParameters>, IndicatorDefinition<IndicatorCandle, RainbowChartsParameters>, IndicatorDefinition<IndicatorCandle, McClellanOscillatorParameters>, IndicatorDefinition<IndicatorCandle, EnvelopeParameters>, IndicatorDefinition<IndicatorCandle, AwesomeOscillatorParameters>, IndicatorDefinition<IndicatorCandle, ElliotWaveOscillatorParameters>, IndicatorDefinition<IndicatorCandle, Readonly<Record<string, import("../indicator-definition.js").IndicatorParameterValue>>>, IndicatorDefinition<IndicatorCandle, AccelerationParameters>, IndicatorDefinition<IndicatorCandle, CompoundLengthParameters>, IndicatorDefinition<IndicatorCandle, CompoundLengthParameters>, IndicatorDefinition<IndicatorCandle, CompoundLengthParameters>, IndicatorDefinition<IndicatorCandle, T3MovingAverageParameters>, IndicatorDefinition<IndicatorCandle, HullMovingAverageParameters>, IndicatorDefinition<IndicatorCandle, MacdParameters>, IndicatorDefinition<IndicatorCandle, MacdSignalParameters>, IndicatorDefinition<IndicatorCandle, PercentagePriceOscillatorParameters>, IndicatorDefinition<IndicatorCandle, SchaffTrendCycleParameters>, IndicatorDefinition<IndicatorCandle, StochasticParameters>, IndicatorDefinition<IndicatorCandle, FastStochasticParameters>, IndicatorDefinition<IndicatorCandle, BollingerPercentBParameters>, IndicatorDefinition<IndicatorCandle, ConstanceBrownCompositeIndexParameters>, IndicatorDefinition<IndicatorCandle, CompositeMomentumParameters>, IndicatorDefinition<IndicatorCandle, ElderImpulseParameters>, IndicatorDefinition<IndicatorCandle, WaveTrendOscillatorParameters>, IndicatorDefinition<IndicatorCandle, WoodiesCciParameters>, IndicatorDefinition<IndicatorCandle, CompoundLengthParameters>, IndicatorDefinition<IndicatorCandle, CompoundLengthParameters>];

// Public API module: indicators/built-ins/core-definitions.d.ts
import { type IndicatorCandle, type IndicatorDefinition, type IndicatorParameters, type IndicatorProcessInput } from '../indicator-definition.js';
import { SequentialIndicatorProcessor, type IndicatorCalculationResult } from '../sequential-processor.js';
import { type AverageTrueRangeCheckpoint, type RingBufferCheckpoint, type RollingWindowCheckpoint, type RollingLinearRegressionCheckpoint, type SeededMovingAverageCheckpoint } from '../math/index.js';
export interface LengthIndicatorParameters extends IndicatorParameters {
    readonly length: number;
}
export interface TrueRangeIndicatorCheckpoint {
    readonly previousClose: number | null;
}
export interface ZeroLagExponentialMovingAverageCheckpoint {
    readonly prices: RingBufferCheckpoint<number | null>;
    readonly previous: number;
}
export interface ArnaudLegouxMovingAverageParameters extends IndicatorParameters {
    readonly length: number;
    readonly offset: number;
    readonly sigma: number;
}
export interface JurikMovingAverageParameters extends IndicatorParameters {
    readonly length: number;
    readonly phase: number;
}
export interface JurikMovingAverageCheckpoint {
    readonly formed: boolean;
    readonly previousMa1: number;
    readonly previousMa2: number;
}
export interface KalmanFilterParameters extends IndicatorParameters {
    readonly length: number;
    readonly processNoise: number;
    readonly measurementNoise: number;
}
export interface KalmanFilterCheckpoint {
    readonly lastEstimate: number | null;
    readonly errorCovariance: number;
    readonly count: number;
}
export declare class SimpleMovingAverageProcessor extends SequentialIndicatorProcessor<IndicatorCandle, RollingWindowCheckpoint> {
    readonly length: number;
    private readonly average;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): RollingWindowCheckpoint;
    protected restoreState(state: RollingWindowCheckpoint): void;
}
export declare class ArnaudLegouxMovingAverageProcessor extends SequentialIndicatorProcessor<IndicatorCandle, RollingWindowCheckpoint> {
    readonly length: number;
    readonly offset: number;
    readonly sigma: number;
    private readonly average;
    constructor(length: number, offset: number, sigma: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): RollingWindowCheckpoint;
    protected restoreState(state: RollingWindowCheckpoint): void;
}
export declare class EndpointMovingAverageProcessor extends SequentialIndicatorProcessor<IndicatorCandle, RingBufferCheckpoint<number | null>> {
    readonly length: number;
    private readonly values;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): RingBufferCheckpoint<number | null>;
    protected restoreState(state: RingBufferCheckpoint<number | null>): void;
}
export declare class JurikMovingAverageProcessor extends SequentialIndicatorProcessor<IndicatorCandle, JurikMovingAverageCheckpoint> {
    readonly length: number;
    readonly phase: number;
    private formed;
    private previousMa1;
    private previousMa2;
    private readonly beta;
    private readonly phaseRatio;
    constructor(length: number, phase: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): JurikMovingAverageCheckpoint;
    protected restoreState(state: JurikMovingAverageCheckpoint): void;
}
export declare class KalmanFilterProcessor extends SequentialIndicatorProcessor<IndicatorCandle, KalmanFilterCheckpoint> {
    readonly length: number;
    readonly processNoise: number;
    readonly measurementNoise: number;
    private lastEstimate;
    private errorCovariance;
    private count;
    constructor(length: number, processNoise: number, measurementNoise: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): KalmanFilterCheckpoint;
    protected restoreState(state: KalmanFilterCheckpoint): void;
}
export declare class LinearRegressionForecastProcessor extends SequentialIndicatorProcessor<IndicatorCandle, RollingLinearRegressionCheckpoint> {
    readonly length: number;
    private readonly regression;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): RollingLinearRegressionCheckpoint;
    protected restoreState(state: RollingLinearRegressionCheckpoint): void;
}
export declare class LinearRegressionProcessor extends SequentialIndicatorProcessor<IndicatorCandle, RollingLinearRegressionCheckpoint> {
    readonly length: number;
    private readonly regression;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): RollingLinearRegressionCheckpoint;
    protected restoreState(state: RollingLinearRegressionCheckpoint): void;
}
export declare class LinearRegressionSlopeProcessor extends SequentialIndicatorProcessor<IndicatorCandle, RollingLinearRegressionCheckpoint> {
    readonly length: number;
    private readonly regression;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): RollingLinearRegressionCheckpoint;
    protected restoreState(state: RollingLinearRegressionCheckpoint): void;
}
export declare class LinearRegressionRSquaredProcessor extends SequentialIndicatorProcessor<IndicatorCandle, RollingLinearRegressionCheckpoint> {
    readonly length: number;
    private readonly regression;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): RollingLinearRegressionCheckpoint;
    protected restoreState(state: RollingLinearRegressionCheckpoint): void;
}
export declare class StandardErrorProcessor extends SequentialIndicatorProcessor<IndicatorCandle, RollingLinearRegressionCheckpoint> {
    readonly length: number;
    private readonly regression;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): RollingLinearRegressionCheckpoint;
    protected restoreState(state: RollingLinearRegressionCheckpoint): void;
}
export declare class ExponentialMovingAverageProcessor extends SequentialIndicatorProcessor<IndicatorCandle, SeededMovingAverageCheckpoint> {
    readonly length: number;
    private readonly average;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): SeededMovingAverageCheckpoint;
    protected restoreState(state: SeededMovingAverageCheckpoint): void;
}
export declare class WeightedMovingAverageProcessor extends SequentialIndicatorProcessor<IndicatorCandle, RollingWindowCheckpoint> {
    readonly length: number;
    private readonly average;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): RollingWindowCheckpoint;
    protected restoreState(state: RollingWindowCheckpoint): void;
}
export declare class StandardDeviationProcessor extends SequentialIndicatorProcessor<IndicatorCandle, RollingWindowCheckpoint> {
    readonly length: number;
    private readonly deviation;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): RollingWindowCheckpoint;
    protected restoreState(state: RollingWindowCheckpoint): void;
}
export declare class MeanDeviationProcessor extends SequentialIndicatorProcessor<IndicatorCandle, RollingWindowCheckpoint> {
    readonly length: number;
    private readonly deviation;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): RollingWindowCheckpoint;
    protected restoreState(state: RollingWindowCheckpoint): void;
}
export declare class MedianProcessor extends SequentialIndicatorProcessor<IndicatorCandle, RollingWindowCheckpoint> {
    readonly length: number;
    private readonly median;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): RollingWindowCheckpoint;
    protected restoreState(state: RollingWindowCheckpoint): void;
}
export declare class SumProcessor extends SequentialIndicatorProcessor<IndicatorCandle, RollingWindowCheckpoint> {
    readonly length: number;
    private readonly sum;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): RollingWindowCheckpoint;
    protected restoreState(state: RollingWindowCheckpoint): void;
}
export declare class HighestProcessor extends SequentialIndicatorProcessor<IndicatorCandle, RollingWindowCheckpoint> {
    readonly length: number;
    private readonly maximum;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): RollingWindowCheckpoint;
    protected restoreState(state: RollingWindowCheckpoint): void;
}
export declare class LowestProcessor extends SequentialIndicatorProcessor<IndicatorCandle, RollingWindowCheckpoint> {
    readonly length: number;
    private readonly minimum;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): RollingWindowCheckpoint;
    protected restoreState(state: RollingWindowCheckpoint): void;
}
export declare class SmoothedMovingAverageProcessor extends SequentialIndicatorProcessor<IndicatorCandle, SeededMovingAverageCheckpoint> {
    readonly length: number;
    private readonly average;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): SeededMovingAverageCheckpoint;
    protected restoreState(state: SeededMovingAverageCheckpoint): void;
}
/** Public Wilder indicator shares the same seeded recursion as batch SMMA. */
export declare class WilderMovingAverageProcessor extends SmoothedMovingAverageProcessor {
}
export declare class ZeroLagExponentialMovingAverageProcessor extends SequentialIndicatorProcessor<IndicatorCandle, ZeroLagExponentialMovingAverageCheckpoint> {
    readonly length: number;
    private readonly prices;
    private readonly lag;
    private readonly multiplier;
    private previous;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): ZeroLagExponentialMovingAverageCheckpoint;
    protected restoreState(state: ZeroLagExponentialMovingAverageCheckpoint): void;
}
export declare class AverageTrueRangeProcessor extends SequentialIndicatorProcessor<IndicatorCandle, AverageTrueRangeCheckpoint> {
    readonly length: number;
    private readonly average;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): AverageTrueRangeCheckpoint;
    protected restoreState(state: AverageTrueRangeCheckpoint): void;
}
export declare class TrueRangeProcessor extends SequentialIndicatorProcessor<IndicatorCandle, TrueRangeIndicatorCheckpoint> {
    private previousClose;
    constructor();
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): TrueRangeIndicatorCheckpoint;
    protected restoreState(state: TrueRangeIndicatorCheckpoint): void;
}
export declare const SimpleMovingAverageIndicator: IndicatorDefinition<IndicatorCandle, LengthIndicatorParameters>;
export declare const ExponentialMovingAverageIndicator: IndicatorDefinition<IndicatorCandle, LengthIndicatorParameters>;
export declare const WeightedMovingAverageIndicator: IndicatorDefinition<IndicatorCandle, LengthIndicatorParameters>;
export declare const ArnaudLegouxMovingAverageIndicator: IndicatorDefinition<IndicatorCandle, ArnaudLegouxMovingAverageParameters>;
export declare const EndpointMovingAverageIndicator: IndicatorDefinition<IndicatorCandle, LengthIndicatorParameters>;
export declare const JurikMovingAverageIndicator: IndicatorDefinition<IndicatorCandle, JurikMovingAverageParameters>;
export declare const KalmanFilterIndicator: IndicatorDefinition<IndicatorCandle, KalmanFilterParameters>;
export declare const LinearRegressionForecastIndicator: IndicatorDefinition<IndicatorCandle, LengthIndicatorParameters>;
export declare const LinearRegressionIndicator: IndicatorDefinition<IndicatorCandle, LengthIndicatorParameters>;
export declare const LinearRegressionSlopeIndicator: IndicatorDefinition<IndicatorCandle, LengthIndicatorParameters>;
export declare const LinearRegressionRSquaredIndicator: IndicatorDefinition<IndicatorCandle, LengthIndicatorParameters>;
export declare const StandardErrorIndicator: IndicatorDefinition<IndicatorCandle, LengthIndicatorParameters>;
export declare const StandardDeviationIndicator: IndicatorDefinition<IndicatorCandle, LengthIndicatorParameters>;
export declare const MeanDeviationIndicator: IndicatorDefinition<IndicatorCandle, LengthIndicatorParameters>;
export declare const MedianIndicator: IndicatorDefinition<IndicatorCandle, LengthIndicatorParameters>;
export declare const SumIndicator: IndicatorDefinition<IndicatorCandle, LengthIndicatorParameters>;
export declare const HighestIndicator: IndicatorDefinition<IndicatorCandle, LengthIndicatorParameters>;
export declare const LowestIndicator: IndicatorDefinition<IndicatorCandle, LengthIndicatorParameters>;
export declare const SmoothedMovingAverageIndicator: IndicatorDefinition<IndicatorCandle, LengthIndicatorParameters>;
export declare const WilderMovingAverageIndicator: IndicatorDefinition<IndicatorCandle, LengthIndicatorParameters>;
export declare const ZeroLagExponentialMovingAverageIndicator: IndicatorDefinition<IndicatorCandle, LengthIndicatorParameters>;
export declare const AverageTrueRangeIndicator: IndicatorDefinition<IndicatorCandle, LengthIndicatorParameters>;
export declare const TrueRangeIndicator: IndicatorDefinition<IndicatorCandle, IndicatorParameters>;
export declare const CoreIncrementalIndicators: readonly [IndicatorDefinition<IndicatorCandle, LengthIndicatorParameters>, IndicatorDefinition<IndicatorCandle, LengthIndicatorParameters>, IndicatorDefinition<IndicatorCandle, LengthIndicatorParameters>, IndicatorDefinition<IndicatorCandle, ArnaudLegouxMovingAverageParameters>, IndicatorDefinition<IndicatorCandle, LengthIndicatorParameters>, IndicatorDefinition<IndicatorCandle, JurikMovingAverageParameters>, IndicatorDefinition<IndicatorCandle, KalmanFilterParameters>, IndicatorDefinition<IndicatorCandle, LengthIndicatorParameters>, IndicatorDefinition<IndicatorCandle, LengthIndicatorParameters>, IndicatorDefinition<IndicatorCandle, LengthIndicatorParameters>, IndicatorDefinition<IndicatorCandle, LengthIndicatorParameters>, IndicatorDefinition<IndicatorCandle, LengthIndicatorParameters>, IndicatorDefinition<IndicatorCandle, LengthIndicatorParameters>, IndicatorDefinition<IndicatorCandle, LengthIndicatorParameters>, IndicatorDefinition<IndicatorCandle, LengthIndicatorParameters>, IndicatorDefinition<IndicatorCandle, LengthIndicatorParameters>, IndicatorDefinition<IndicatorCandle, LengthIndicatorParameters>, IndicatorDefinition<IndicatorCandle, LengthIndicatorParameters>, IndicatorDefinition<IndicatorCandle, LengthIndicatorParameters>, IndicatorDefinition<IndicatorCandle, LengthIndicatorParameters>, IndicatorDefinition<IndicatorCandle, LengthIndicatorParameters>, IndicatorDefinition<IndicatorCandle, LengthIndicatorParameters>, IndicatorDefinition<IndicatorCandle, Readonly<Record<string, import("../indicator-definition.js").IndicatorParameterValue>>>];

// Public API module: indicators/built-ins/cumulative-price-definitions.d.ts
import { type IndicatorCandle, type IndicatorDefinition, type IndicatorParameters, type IndicatorProcessInput } from '../indicator-definition.js';
import { SequentialIndicatorProcessor, type IndicatorCalculationResult } from '../sequential-processor.js';
export interface TimeWeightedAveragePriceCheckpoint {
    readonly sum: number;
    readonly count: number;
}
export interface ShiftParameters extends IndicatorParameters {
    readonly length: number;
}
export declare class PassThroughIndicatorProcessor extends SequentialIndicatorProcessor<IndicatorCandle, null> {
    constructor();
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, _commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): null;
    protected restoreState(state: null): void;
}
/** StockSharp Shift is a warm-up gate; it does not relocate output points. */
export declare class ShiftProcessor extends SequentialIndicatorProcessor<IndicatorCandle, null> {
    readonly length: number;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, _commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): null;
    protected restoreState(state: null): void;
}
export declare class MedianPriceProcessor extends SequentialIndicatorProcessor<IndicatorCandle, null> {
    constructor();
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, _commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): null;
    protected restoreState(state: null): void;
}
export declare class TypicalPriceProcessor extends SequentialIndicatorProcessor<IndicatorCandle, null> {
    constructor();
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, _commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): null;
    protected restoreState(state: null): void;
}
export declare class WeightedClosePriceProcessor extends SequentialIndicatorProcessor<IndicatorCandle, null> {
    constructor();
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, _commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): null;
    protected restoreState(state: null): void;
}
export declare class TimeWeightedAveragePriceProcessor extends SequentialIndicatorProcessor<IndicatorCandle, TimeWeightedAveragePriceCheckpoint> {
    private sum;
    private count;
    constructor();
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): TimeWeightedAveragePriceCheckpoint;
    protected restoreState(state: TimeWeightedAveragePriceCheckpoint): void;
}
export interface VolumeWeightedAveragePriceCheckpoint {
    readonly priceVolume: number;
    readonly volume: number;
}
export declare class VolumeWeightedAveragePriceProcessor extends SequentialIndicatorProcessor<IndicatorCandle, VolumeWeightedAveragePriceCheckpoint> {
    private priceVolume;
    private volume;
    constructor();
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): VolumeWeightedAveragePriceCheckpoint;
    protected restoreState(state: VolumeWeightedAveragePriceCheckpoint): void;
}
export interface AccumulationDistributionLineCheckpoint {
    readonly value: number;
}
export interface WilliamsAccumulationDistributionCheckpoint {
    readonly previousClose: number;
    readonly value: number;
}
export interface WilliamsVariableAccumulationDistributionCheckpoint {
    readonly value: number;
}
export declare class AccumulationDistributionLineProcessor extends SequentialIndicatorProcessor<IndicatorCandle, AccumulationDistributionLineCheckpoint> {
    private current;
    constructor();
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): AccumulationDistributionLineCheckpoint;
    protected restoreState(state: AccumulationDistributionLineCheckpoint): void;
}
export declare class WilliamsAccumulationDistributionProcessor extends SequentialIndicatorProcessor<IndicatorCandle, WilliamsAccumulationDistributionCheckpoint> {
    private previousClose;
    private current;
    constructor();
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): WilliamsAccumulationDistributionCheckpoint;
    protected restoreState(state: WilliamsAccumulationDistributionCheckpoint): void;
    private empty;
}
export declare class WilliamsVariableAccumulationDistributionProcessor extends SequentialIndicatorProcessor<IndicatorCandle, WilliamsVariableAccumulationDistributionCheckpoint> {
    private current;
    constructor();
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): WilliamsVariableAccumulationDistributionCheckpoint;
    protected restoreState(state: WilliamsVariableAccumulationDistributionCheckpoint): void;
}
export declare const MedianPriceIndicator: IndicatorDefinition<IndicatorCandle, IndicatorParameters>;
export declare const TypicalPriceIndicator: IndicatorDefinition<IndicatorCandle, IndicatorParameters>;
export declare const WeightedClosePriceIndicator: IndicatorDefinition<IndicatorCandle, IndicatorParameters>;
export declare const PassThroughIndicator: IndicatorDefinition<IndicatorCandle, IndicatorParameters>;
export declare const ShiftIndicator: IndicatorDefinition<IndicatorCandle, ShiftParameters>;
export declare const TimeWeightedAveragePriceIndicator: IndicatorDefinition<IndicatorCandle, IndicatorParameters>;
export declare const VolumeWeightedAveragePriceIndicator: IndicatorDefinition<IndicatorCandle, IndicatorParameters>;
export declare const AccumulationDistributionLineIndicator: IndicatorDefinition<IndicatorCandle, IndicatorParameters>;
export declare const WilliamsAccumulationDistributionIndicator: IndicatorDefinition<IndicatorCandle, IndicatorParameters>;
export declare const WilliamsVariableAccumulationDistributionIndicator: IndicatorDefinition<IndicatorCandle, IndicatorParameters>;
export declare const CumulativePriceIndicators: readonly [IndicatorDefinition<IndicatorCandle, Readonly<Record<string, import("../indicator-definition.js").IndicatorParameterValue>>>, IndicatorDefinition<IndicatorCandle, ShiftParameters>, IndicatorDefinition<IndicatorCandle, Readonly<Record<string, import("../indicator-definition.js").IndicatorParameterValue>>>, IndicatorDefinition<IndicatorCandle, Readonly<Record<string, import("../indicator-definition.js").IndicatorParameterValue>>>, IndicatorDefinition<IndicatorCandle, Readonly<Record<string, import("../indicator-definition.js").IndicatorParameterValue>>>, IndicatorDefinition<IndicatorCandle, Readonly<Record<string, import("../indicator-definition.js").IndicatorParameterValue>>>, IndicatorDefinition<IndicatorCandle, Readonly<Record<string, import("../indicator-definition.js").IndicatorParameterValue>>>, IndicatorDefinition<IndicatorCandle, Readonly<Record<string, import("../indicator-definition.js").IndicatorParameterValue>>>, IndicatorDefinition<IndicatorCandle, Readonly<Record<string, import("../indicator-definition.js").IndicatorParameterValue>>>, IndicatorDefinition<IndicatorCandle, Readonly<Record<string, import("../indicator-definition.js").IndicatorParameterValue>>>];

// Public API module: indicators/built-ins/cycle-definitions.d.ts
import { type IndicatorCandle, type IndicatorDefinition, type IndicatorParameters, type IndicatorProcessInput } from '../indicator-definition.js';
import { SequentialIndicatorProcessor, type IndicatorCalculationResult } from '../sequential-processor.js';
import { type RingBufferCheckpoint, type RollingWindowCheckpoint } from '../math/index.js';
export interface CycleLengthParameters extends IndicatorParameters {
    readonly length: number;
}
export interface CenterOfGravityCheckpoint {
    readonly sum: RollingWindowCheckpoint;
    readonly weighted: RollingWindowCheckpoint;
}
export interface DetrendedPriceOscillatorCheckpoint {
    readonly average: RollingWindowCheckpoint;
    readonly history: RingBufferCheckpoint<number | null>;
}
export interface EhlersFisherTransformCheckpoint {
    readonly high: RollingWindowCheckpoint;
    readonly low: RollingWindowCheckpoint;
    readonly previousValue: number;
    readonly previousFisher: number;
}
export interface HarmonicOscillatorCheckpoint {
    readonly values: RingBufferCheckpoint<number | null>;
}
export declare class CenterOfGravityOscillatorProcessor extends SequentialIndicatorProcessor<IndicatorCandle, CenterOfGravityCheckpoint> {
    readonly length: number;
    private readonly sum;
    private readonly weighted;
    private readonly divisor;
    private readonly center;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): CenterOfGravityCheckpoint;
    protected restoreState(state: CenterOfGravityCheckpoint): void;
}
export declare class DetrendedPriceOscillatorProcessor extends SequentialIndicatorProcessor<IndicatorCandle, DetrendedPriceOscillatorCheckpoint> {
    readonly length: number;
    private readonly average;
    private readonly history;
    private readonly lookBack;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): DetrendedPriceOscillatorCheckpoint;
    protected restoreState(state: DetrendedPriceOscillatorCheckpoint): void;
}
export declare class EhlersFisherTransformProcessor extends SequentialIndicatorProcessor<IndicatorCandle, EhlersFisherTransformCheckpoint> {
    readonly length: number;
    private readonly high;
    private readonly low;
    private previousValue;
    private previousFisher;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): EhlersFisherTransformCheckpoint;
    protected restoreState(state: EhlersFisherTransformCheckpoint): void;
}
export declare class HarmonicOscillatorProcessor extends SequentialIndicatorProcessor<IndicatorCandle, HarmonicOscillatorCheckpoint> {
    readonly length: number;
    private readonly values;
    private readonly sineStep;
    private readonly cosineStep;
    private sine;
    private cosine;
    private invalid;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): HarmonicOscillatorCheckpoint;
    protected restoreState(state: HarmonicOscillatorCheckpoint): void;
    private evaluate;
    private append;
}
export declare class LunarPhaseProcessor extends SequentialIndicatorProcessor<IndicatorCandle, null> {
    constructor();
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, _commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): null;
    protected restoreState(state: null): void;
}
export declare class SineWaveProcessor extends SequentialIndicatorProcessor<IndicatorCandle, null> {
    readonly length: number;
    private readonly step;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, _commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): null;
    protected restoreState(state: null): void;
}
export declare const CenterOfGravityOscillatorIndicator: IndicatorDefinition<IndicatorCandle, CycleLengthParameters>;
export declare const DetrendedPriceOscillatorIndicator: IndicatorDefinition<IndicatorCandle, CycleLengthParameters>;
export declare const EhlersFisherTransformIndicator: IndicatorDefinition<IndicatorCandle, CycleLengthParameters>;
export declare const HarmonicOscillatorIndicator: IndicatorDefinition<IndicatorCandle, CycleLengthParameters>;
export declare const LunarPhaseIndicator: IndicatorDefinition<IndicatorCandle>;
export declare const SineWaveIndicator: IndicatorDefinition<IndicatorCandle, CycleLengthParameters>;
export declare const CycleIndicators: readonly [IndicatorDefinition<IndicatorCandle, CycleLengthParameters>, IndicatorDefinition<IndicatorCandle, CycleLengthParameters>, IndicatorDefinition<IndicatorCandle, CycleLengthParameters>, IndicatorDefinition<IndicatorCandle, CycleLengthParameters>, IndicatorDefinition<IndicatorCandle, Readonly<Record<string, import("../indicator-definition.js").IndicatorParameterValue>>>, IndicatorDefinition<IndicatorCandle, CycleLengthParameters>];

// Public API module: indicators/built-ins/index.d.ts
export * from './core-definitions.js';
export * from './momentum-volume-definitions.js';
export * from './compound-definitions.js';
export * from './recursive-statistical-definitions.js';
export * from './shifted-sparse-definitions.js';
export * from './cumulative-price-definitions.js';
export * from './adaptive-definitions.js';
export * from './range-definitions.js';
export * from './volatility-definitions.js';
export * from './cycle-definitions.js';

// Public API module: indicators/built-ins/momentum-volume-definitions.d.ts
import { type IndicatorCandle, type IndicatorDefinition, type IndicatorParameters, type IndicatorProcessInput } from '../indicator-definition.js';
import { SequentialIndicatorProcessor, type IndicatorCalculationResult, type SequentialIndicatorCheckpoint } from '../sequential-processor.js';
import { RingBuffer, type RingBufferCheckpoint, type RollingWindowCheckpoint, type RollingLinearRegressionCheckpoint, type SeededMovingAverageCheckpoint, type SmoothedMovingAverageCheckpoint } from '../math/index.js';
export interface MomentumLengthParameters extends IndicatorParameters {
    readonly length: number;
}
export interface MomentumOfMovingAverageParameters extends IndicatorParameters {
    readonly length: number;
    readonly momentumPeriod: number;
}
export interface OscillatorOfMovingAverageParameters extends IndicatorParameters {
    readonly shortPeriod: number;
    readonly longPeriod: number;
}
export interface RelativeMomentumIndexParameters extends IndicatorParameters {
    readonly length: number;
    readonly momentumPeriod: number;
}
export interface RangeActionVerificationIndexParameters extends IndicatorParameters {
    readonly shortLength: number;
    readonly longLength: number;
}
export interface PercentageVolumeOscillatorParameters extends IndicatorParameters {
    readonly shortPeriod: number;
    readonly longPeriod: number;
}
export interface PercentageVolumeOscillatorCheckpoint {
    readonly short: SeededMovingAverageCheckpoint;
    readonly long: SeededMovingAverageCheckpoint;
}
export interface TwiggsMoneyFlowCheckpoint {
    readonly advanceDecline: SeededMovingAverageCheckpoint;
    readonly volume: SeededMovingAverageCheckpoint;
    readonly previousAdvanceDecline: number;
}
export interface UltimateOscillatorCheckpoint {
    readonly previousClose: number | null;
    readonly buyingPressure: readonly RollingWindowCheckpoint[];
    readonly trueRange: readonly RollingWindowCheckpoint[];
}
export interface MomentumOfMovingAverageCheckpoint {
    readonly values: RingBufferCheckpoint<number>;
    readonly sum: number;
}
export interface OscillatorOfMovingAverageCheckpoint {
    readonly shortAverage: RollingWindowCheckpoint;
    readonly longAverage: RollingWindowCheckpoint;
}
export interface PrettyGoodOscillatorCheckpoint {
    readonly average: RollingWindowCheckpoint;
    readonly highest: RollingWindowCheckpoint;
    readonly lowest: RollingWindowCheckpoint;
}
export interface RelativeMomentumIndexCheckpoint {
    readonly prices: RingBufferCheckpoint<number | null>;
    readonly up: RollingWindowCheckpoint;
    readonly down: RollingWindowCheckpoint;
}
export interface RangeActionVerificationIndexCheckpoint {
    readonly shortAverage: RollingWindowCheckpoint;
    readonly longAverage: RollingWindowCheckpoint;
}
export interface NegativeVolumeIndexCheckpoint {
    readonly previousClose: number;
    readonly previousVolume: number;
    readonly value: number;
}
export interface PositiveVolumeIndexCheckpoint {
    readonly previousClose: number;
    readonly previousVolume: number;
    readonly value: number;
}
export interface PriceVolumeTrendCheckpoint {
    readonly previousClose: number;
    readonly value: number;
}
export interface PsychologicalLineCheckpoint {
    readonly closes: RingBufferCheckpoint<number>;
    readonly upCount: number;
}
export interface ChaikinOscillatorParameters extends IndicatorParameters {
    readonly fast: number;
    readonly slow: number;
}
export interface ConnorsRsiParameters extends IndicatorParameters {
    readonly rsiLength: number;
    readonly streakLength: number;
    readonly rocLength: number;
}
export interface RelativeStrengthIndexCheckpoint {
    readonly previousClose: number | null;
    readonly validDeltas: number;
    readonly gain: SmoothedMovingAverageCheckpoint;
    readonly loss: SmoothedMovingAverageCheckpoint;
}
export interface DynamicZonesRsiParameters extends IndicatorParameters {
    readonly length: number;
    readonly oversoldLevel: number;
    readonly overboughtLevel: number;
}
export interface DynamicZonesRsiCheckpoint {
    readonly rsi: SequentialIndicatorCheckpoint<RelativeStrengthIndexCheckpoint>;
    readonly minimum: RollingWindowCheckpoint;
    readonly maximum: RollingWindowCheckpoint;
}
export interface DeMarkerCheckpoint {
    readonly previousHigh: number | null;
    readonly previousLow: number | null;
    readonly deMax: RollingWindowCheckpoint;
    readonly deMin: RollingWindowCheckpoint;
}
export interface DemandIndexCheckpoint {
    readonly previousClose: number;
    readonly previousVolume: number;
    readonly previousValue: number | null;
    readonly average: RollingWindowCheckpoint;
}
export declare class DemandIndexProcessor extends SequentialIndicatorProcessor<IndicatorCandle, DemandIndexCheckpoint> {
    readonly length: number;
    private previousClose;
    private previousVolume;
    private previousValue;
    private readonly average;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): DemandIndexCheckpoint;
    protected restoreState(state: DemandIndexCheckpoint): void;
    private empty;
}
export declare class DisparityIndexProcessor extends SequentialIndicatorProcessor<IndicatorCandle, RollingWindowCheckpoint> {
    readonly length: number;
    private readonly average;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): RollingWindowCheckpoint;
    protected restoreState(state: RollingWindowCheckpoint): void;
}
export declare class DeMarkerProcessor extends SequentialIndicatorProcessor<IndicatorCandle, DeMarkerCheckpoint> {
    readonly length: number;
    private previousHigh;
    private previousLow;
    private readonly deMax;
    private readonly deMin;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): DeMarkerCheckpoint;
    protected restoreState(state: DeMarkerCheckpoint): void;
}
export declare class RelativeStrengthIndexProcessor extends SequentialIndicatorProcessor<IndicatorCandle, RelativeStrengthIndexCheckpoint> {
    readonly length: number;
    private previousClose;
    private validDeltas;
    private readonly gain;
    private readonly loss;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): RelativeStrengthIndexCheckpoint;
    protected restoreState(state: RelativeStrengthIndexCheckpoint): void;
}
export declare class DynamicZonesRsiProcessor extends SequentialIndicatorProcessor<IndicatorCandle, DynamicZonesRsiCheckpoint> {
    readonly length: number;
    readonly oversoldLevel: number;
    readonly overboughtLevel: number;
    private readonly rsi;
    private readonly minimum;
    private readonly maximum;
    constructor(length: number, oversoldLevel: number, overboughtLevel: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): DynamicZonesRsiCheckpoint;
    protected restoreState(state: DynamicZonesRsiCheckpoint): void;
}
export interface PriceBufferCheckpoint {
    readonly prices: RingBufferCheckpoint<number | null>;
}
declare abstract class BufferedPriceProcessor extends SequentialIndicatorProcessor<IndicatorCandle, PriceBufferCheckpoint> {
    readonly length: number;
    protected readonly prices: RingBuffer<number | null>;
    protected constructor(length: number, outputId: string);
    protected past(): number | null | undefined;
    protected resetState(): void;
    protected captureState(): PriceBufferCheckpoint;
    protected restoreState(state: PriceBufferCheckpoint): void;
}
export declare class MomentumProcessor extends BufferedPriceProcessor {
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
}
export declare class QStickProcessor extends SequentialIndicatorProcessor<IndicatorCandle, RollingWindowCheckpoint> {
    readonly length: number;
    private readonly average;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): RollingWindowCheckpoint;
    protected restoreState(state: RollingWindowCheckpoint): void;
}
export declare class MomentumOfMovingAverageProcessor extends SequentialIndicatorProcessor<IndicatorCandle, MomentumOfMovingAverageCheckpoint> {
    readonly length: number;
    readonly momentumPeriod: number;
    private readonly values;
    private sum;
    constructor(length: number, momentumPeriod: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): MomentumOfMovingAverageCheckpoint;
    protected restoreState(state: MomentumOfMovingAverageCheckpoint): void;
    private push;
}
export declare class OscillatorOfMovingAverageProcessor extends SequentialIndicatorProcessor<IndicatorCandle, OscillatorOfMovingAverageCheckpoint> {
    readonly shortPeriod: number;
    readonly longPeriod: number;
    private readonly shortAverage;
    private readonly longAverage;
    constructor(shortPeriod: number, longPeriod: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): OscillatorOfMovingAverageCheckpoint;
    protected restoreState(state: OscillatorOfMovingAverageCheckpoint): void;
}
export declare class PrettyGoodOscillatorProcessor extends SequentialIndicatorProcessor<IndicatorCandle, PrettyGoodOscillatorCheckpoint> {
    readonly length: number;
    private readonly average;
    private readonly highest;
    private readonly lowest;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): PrettyGoodOscillatorCheckpoint;
    protected restoreState(state: PrettyGoodOscillatorCheckpoint): void;
}
export declare class RelativeMomentumIndexProcessor extends SequentialIndicatorProcessor<IndicatorCandle, RelativeMomentumIndexCheckpoint> {
    readonly length: number;
    readonly momentumPeriod: number;
    private readonly prices;
    private readonly up;
    private readonly down;
    constructor(length: number, momentumPeriod: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): RelativeMomentumIndexCheckpoint;
    protected restoreState(state: RelativeMomentumIndexCheckpoint): void;
}
export declare class RangeActionVerificationIndexProcessor extends SequentialIndicatorProcessor<IndicatorCandle, RangeActionVerificationIndexCheckpoint> {
    readonly shortLength: number;
    readonly longLength: number;
    private readonly shortAverage;
    private readonly longAverage;
    constructor(shortLength: number, longLength: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): RangeActionVerificationIndexCheckpoint;
    protected restoreState(state: RangeActionVerificationIndexCheckpoint): void;
}
export declare class RankCorrelationIndexProcessor extends SequentialIndicatorProcessor<IndicatorCandle, RingBufferCheckpoint<number | null>> {
    readonly length: number;
    private readonly prices;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): RingBufferCheckpoint<number | null>;
    protected restoreState(state: RingBufferCheckpoint<number | null>): void;
}
export declare class MomentumPinballProcessor extends SequentialIndicatorProcessor<IndicatorCandle, RingBufferCheckpoint<number>> {
    readonly length: number;
    private readonly values;
    private readonly minimum;
    private readonly maximum;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): RingBufferCheckpoint<number>;
    protected restoreState(state: RingBufferCheckpoint<number>): void;
}
export declare class RateOfChangeProcessor extends BufferedPriceProcessor {
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
}
export interface MoneyFlowIndexCheckpoint {
    readonly previousTypical: number;
    readonly positive: RollingWindowCheckpoint;
    readonly negative: RollingWindowCheckpoint;
}
export interface WilliamsRCheckpoint {
    readonly high: RollingWindowCheckpoint;
    readonly low: RollingWindowCheckpoint;
}
export interface StochasticKCheckpoint {
    readonly high: RollingWindowCheckpoint;
    readonly low: RollingWindowCheckpoint;
}
export declare class WilliamsRProcessor extends SequentialIndicatorProcessor<IndicatorCandle, WilliamsRCheckpoint> {
    readonly length: number;
    private readonly high;
    private readonly low;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): WilliamsRCheckpoint;
    protected restoreState(state: WilliamsRCheckpoint): void;
}
export declare class StochasticKProcessor extends SequentialIndicatorProcessor<IndicatorCandle, StochasticKCheckpoint> {
    readonly length: number;
    private readonly high;
    private readonly low;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): StochasticKCheckpoint;
    protected restoreState(state: StochasticKCheckpoint): void;
}
export declare class PercentageVolumeOscillatorProcessor extends SequentialIndicatorProcessor<IndicatorCandle, PercentageVolumeOscillatorCheckpoint> {
    readonly shortPeriod: number;
    readonly longPeriod: number;
    private readonly short;
    private readonly long;
    constructor(shortPeriod: number, longPeriod: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): PercentageVolumeOscillatorCheckpoint;
    protected restoreState(state: PercentageVolumeOscillatorCheckpoint): void;
}
export declare class TwiggsMoneyFlowProcessor extends SequentialIndicatorProcessor<IndicatorCandle, TwiggsMoneyFlowCheckpoint> {
    readonly length: number;
    private readonly advanceDecline;
    private readonly volume;
    private previousAdvanceDecline;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): TwiggsMoneyFlowCheckpoint;
    protected restoreState(state: TwiggsMoneyFlowCheckpoint): void;
}
export declare class UltimateOscillatorProcessor extends SequentialIndicatorProcessor<IndicatorCandle, UltimateOscillatorCheckpoint> {
    private previousClose;
    private readonly buyingPressure;
    private readonly trueRange;
    constructor();
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): UltimateOscillatorCheckpoint;
    protected restoreState(state: UltimateOscillatorCheckpoint): void;
}
export interface VolumeWeightedMovingAverageCheckpoint {
    readonly numerator: RollingWindowCheckpoint;
    readonly denominator: RollingWindowCheckpoint;
}
export interface ChaikinMoneyFlowCheckpoint {
    readonly moneyFlowVolumes: RingBufferCheckpoint<number | null>;
    readonly moneyFlowVolumeSum: number;
    readonly volumeSum: number;
    readonly invalid: number;
}
export interface ChaikinOscillatorCheckpoint {
    readonly accumulationDistribution: number;
    readonly fast: SeededMovingAverageCheckpoint;
    readonly slow: SeededMovingAverageCheckpoint;
}
export interface ChandeMomentumOscillatorCheckpoint {
    readonly initialized: boolean;
    readonly previousClose: number | null;
    readonly up: RollingWindowCheckpoint;
    readonly down: RollingWindowCheckpoint;
}
export interface ArrayRsiCheckpoint {
    readonly initialized: boolean;
    readonly previous: number | null;
    readonly gain: SmoothedMovingAverageCheckpoint;
    readonly loss: SmoothedMovingAverageCheckpoint;
}
export interface ConnorsRsiCheckpoint {
    readonly closeRsi: ArrayRsiCheckpoint;
    readonly streakRsi: ArrayRsiCheckpoint;
    readonly rocRsi: ArrayRsiCheckpoint;
    readonly rocHistory: RingBufferCheckpoint<number | null>;
    readonly streakPreviousPrice: number | null;
    readonly streakPrevious: number;
}
export interface EaseOfMovementCheckpoint {
    readonly previousHigh: number;
    readonly previousLow: number;
    readonly values: RollingWindowCheckpoint;
}
export interface ApprovalFlowIndexCheckpoint {
    readonly previousClose: number;
    readonly totalUp: number;
    readonly totalDown: number;
    readonly count: number;
    readonly formed: boolean;
}
export interface ForceIndexCheckpoint {
    readonly initialized: boolean;
    readonly previousClose: number | null;
    readonly average: SeededMovingAverageCheckpoint;
}
export interface HighLowIndexCheckpoint {
    readonly high: RollingWindowCheckpoint;
    readonly low: RollingWindowCheckpoint;
}
export interface IntradayMomentumIndexCheckpoint {
    readonly up: RollingWindowCheckpoint;
    readonly down: RollingWindowCheckpoint;
}
export declare class MoneyFlowIndexProcessor extends SequentialIndicatorProcessor<IndicatorCandle, MoneyFlowIndexCheckpoint> {
    readonly length: number;
    private previousTypical;
    private readonly positive;
    private readonly negative;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): MoneyFlowIndexCheckpoint;
    protected restoreState(state: MoneyFlowIndexCheckpoint): void;
}
export declare class VolumeWeightedMovingAverageProcessor extends SequentialIndicatorProcessor<IndicatorCandle, VolumeWeightedMovingAverageCheckpoint> {
    readonly length: number;
    private readonly numerator;
    private readonly denominator;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): VolumeWeightedMovingAverageCheckpoint;
    protected restoreState(state: VolumeWeightedMovingAverageCheckpoint): void;
}
/**
 * StockSharp-compatible CMF, including its historical denominator-eviction
 * behavior: an expired money-flow volume is subtracted from both sums.
 */
export declare class ChaikinMoneyFlowProcessor extends SequentialIndicatorProcessor<IndicatorCandle, ChaikinMoneyFlowCheckpoint> {
    readonly length: number;
    private readonly moneyFlowVolumes;
    private moneyFlowVolumeSum;
    private volumeSum;
    private invalid;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): ChaikinMoneyFlowCheckpoint;
    protected restoreState(state: ChaikinMoneyFlowCheckpoint): void;
}
export declare class ChaikinOscillatorProcessor extends SequentialIndicatorProcessor<IndicatorCandle, ChaikinOscillatorCheckpoint> {
    readonly fastLength: number;
    readonly slowLength: number;
    private accumulationDistribution;
    private readonly fast;
    private readonly slow;
    constructor(fastLength: number, slowLength: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): ChaikinOscillatorCheckpoint;
    protected restoreState(state: ChaikinOscillatorCheckpoint): void;
}
export declare class ChandeMomentumOscillatorProcessor extends SequentialIndicatorProcessor<IndicatorCandle, ChandeMomentumOscillatorCheckpoint> {
    readonly length: number;
    private initialized;
    private previousClose;
    private readonly up;
    private readonly down;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): ChandeMomentumOscillatorCheckpoint;
    protected restoreState(state: ChandeMomentumOscillatorCheckpoint): void;
}
export declare class ConnorsRsiProcessor extends SequentialIndicatorProcessor<IndicatorCandle, ConnorsRsiCheckpoint> {
    readonly rsiLength: number;
    readonly streakLength: number;
    readonly rocLength: number;
    private readonly closeRsi;
    private readonly streakRsi;
    private readonly rocRsi;
    private readonly rocHistory;
    private streakPreviousPrice;
    private streakPrevious;
    constructor(rsiLength: number, streakLength: number, rocLength: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): ConnorsRsiCheckpoint;
    protected restoreState(state: ConnorsRsiCheckpoint): void;
}
export declare class EaseOfMovementProcessor extends SequentialIndicatorProcessor<IndicatorCandle, EaseOfMovementCheckpoint> {
    readonly length: number;
    private previousHigh;
    private previousLow;
    private readonly values;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): EaseOfMovementCheckpoint;
    protected restoreState(state: EaseOfMovementCheckpoint): void;
}
export declare class ApprovalFlowIndexProcessor extends SequentialIndicatorProcessor<IndicatorCandle, ApprovalFlowIndexCheckpoint> {
    readonly length: number;
    private previousClose;
    private totalUp;
    private totalDown;
    private count;
    private formed;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): ApprovalFlowIndexCheckpoint;
    protected restoreState(state: ApprovalFlowIndexCheckpoint): void;
}
export declare class ForceIndexProcessor extends SequentialIndicatorProcessor<IndicatorCandle, ForceIndexCheckpoint> {
    readonly length: number;
    private initialized;
    private previousClose;
    private readonly average;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): ForceIndexCheckpoint;
    protected restoreState(state: ForceIndexCheckpoint): void;
}
export declare class ForecastOscillatorProcessor extends SequentialIndicatorProcessor<IndicatorCandle, RollingLinearRegressionCheckpoint> {
    readonly length: number;
    private readonly regression;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): RollingLinearRegressionCheckpoint;
    protected restoreState(state: RollingLinearRegressionCheckpoint): void;
}
export declare class FiniteVolumeElementProcessor extends SequentialIndicatorProcessor<IndicatorCandle, RollingWindowCheckpoint> {
    readonly length: number;
    private readonly average;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): RollingWindowCheckpoint;
    protected restoreState(state: RollingWindowCheckpoint): void;
}
export declare class HighLowIndexProcessor extends SequentialIndicatorProcessor<IndicatorCandle, HighLowIndexCheckpoint> {
    readonly length: number;
    private readonly high;
    private readonly low;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): HighLowIndexCheckpoint;
    protected restoreState(state: HighLowIndexCheckpoint): void;
}
export declare class IntradayIntensityIndexProcessor extends SequentialIndicatorProcessor<IndicatorCandle, RollingWindowCheckpoint> {
    readonly length: number;
    private readonly average;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): RollingWindowCheckpoint;
    protected restoreState(state: RollingWindowCheckpoint): void;
}
export declare class IntradayMomentumIndexProcessor extends SequentialIndicatorProcessor<IndicatorCandle, IntradayMomentumIndexCheckpoint> {
    readonly length: number;
    private readonly up;
    private readonly down;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): IntradayMomentumIndexCheckpoint;
    protected restoreState(state: IntradayMomentumIndexCheckpoint): void;
}
/** Stateless candle-volume pass-through with a painter direction hint. */
export declare class VolumeIndicatorProcessor extends SequentialIndicatorProcessor<IndicatorCandle, null> {
    constructor();
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, _commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): null;
    protected restoreState(state: null): void;
}
export declare class MarketFacilitationIndexProcessor extends SequentialIndicatorProcessor<IndicatorCandle, null> {
    constructor();
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, _commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): null;
    protected restoreState(state: null): void;
}
export declare class NegativeVolumeIndexProcessor extends SequentialIndicatorProcessor<IndicatorCandle, NegativeVolumeIndexCheckpoint> {
    private previousClose;
    private previousVolume;
    private current;
    constructor();
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): NegativeVolumeIndexCheckpoint;
    protected restoreState(state: NegativeVolumeIndexCheckpoint): void;
}
export declare class PositiveVolumeIndexProcessor extends SequentialIndicatorProcessor<IndicatorCandle, PositiveVolumeIndexCheckpoint> {
    private previousClose;
    private previousVolume;
    private current;
    constructor();
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): PositiveVolumeIndexCheckpoint;
    protected restoreState(state: PositiveVolumeIndexCheckpoint): void;
}
export declare class PsychologicalLineProcessor extends SequentialIndicatorProcessor<IndicatorCandle, PsychologicalLineCheckpoint> {
    readonly length: number;
    private readonly closes;
    private upCount;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): PsychologicalLineCheckpoint;
    protected restoreState(state: PsychologicalLineCheckpoint): void;
}
export declare class PriceVolumeTrendProcessor extends SequentialIndicatorProcessor<IndicatorCandle, PriceVolumeTrendCheckpoint> {
    private previousClose;
    private current;
    constructor();
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): PriceVolumeTrendCheckpoint;
    protected restoreState(state: PriceVolumeTrendCheckpoint): void;
}
export interface OnBalanceVolumeCheckpoint {
    readonly previousClose: number;
    readonly cumulative: number;
}
export declare class OnBalanceVolumeProcessor extends SequentialIndicatorProcessor<IndicatorCandle, OnBalanceVolumeCheckpoint> {
    private readonly kernel;
    constructor();
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): OnBalanceVolumeCheckpoint;
    protected restoreState(state: OnBalanceVolumeCheckpoint): void;
}
export interface OnBalanceVolumeMeanCheckpoint {
    readonly obv: OnBalanceVolumeCheckpoint;
    readonly average: RollingWindowCheckpoint;
}
export declare class OnBalanceVolumeMeanProcessor extends SequentialIndicatorProcessor<IndicatorCandle, OnBalanceVolumeMeanCheckpoint> {
    readonly length: number;
    private readonly obv;
    private readonly average;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): OnBalanceVolumeMeanCheckpoint;
    protected restoreState(state: OnBalanceVolumeMeanCheckpoint): void;
}
export interface BalanceVolumeCheckpoint {
    readonly seeded: boolean;
    readonly previousClose: number;
    readonly cumulative: number;
}
export declare class BalanceVolumeProcessor extends SequentialIndicatorProcessor<IndicatorCandle, BalanceVolumeCheckpoint> {
    private seeded;
    private previousClose;
    private cumulative;
    constructor();
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): BalanceVolumeCheckpoint;
    protected restoreState(state: BalanceVolumeCheckpoint): void;
}
export declare const RelativeStrengthIndexIndicator: IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>;
export declare const DynamicZonesRsiIndicator: IndicatorDefinition<IndicatorCandle, DynamicZonesRsiParameters>;
export declare const DeMarkerIndicator: IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>;
export declare const DemandIndexIndicator: IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>;
export declare const DisparityIndexIndicator: IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>;
export declare const MomentumIndicator: IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>;
export declare const QStickIndicator: IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>;
export declare const RateOfChangeIndicator: IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>;
export declare const WilliamsRIndicator: IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>;
export declare const StochasticKIndicator: IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>;
export declare const MoneyFlowIndexIndicator: IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>;
export declare const MomentumOfMovingAverageIndicator: IndicatorDefinition<IndicatorCandle, MomentumOfMovingAverageParameters>;
export declare const OscillatorOfMovingAverageIndicator: IndicatorDefinition<IndicatorCandle, OscillatorOfMovingAverageParameters>;
export declare const PrettyGoodOscillatorIndicator: IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>;
export declare const RelativeMomentumIndexIndicator: IndicatorDefinition<IndicatorCandle, RelativeMomentumIndexParameters>;
export declare const RangeActionVerificationIndexIndicator: IndicatorDefinition<IndicatorCandle, RangeActionVerificationIndexParameters>;
export declare const RankCorrelationIndexIndicator: IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>;
export declare const MomentumPinballIndicator: IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>;
export declare const ChaikinMoneyFlowIndicator: IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>;
export declare const ChaikinOscillatorIndicator: IndicatorDefinition<IndicatorCandle, ChaikinOscillatorParameters>;
export declare const ChandeMomentumOscillatorIndicator: IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>;
export declare const ConnorsRsiIndicator: IndicatorDefinition<IndicatorCandle, ConnorsRsiParameters>;
export declare const EaseOfMovementIndicator: IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>;
export declare const ApprovalFlowIndexIndicator: IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>;
export declare const ForceIndexIndicator: IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>;
export declare const ForecastOscillatorIndicator: IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>;
export declare const FiniteVolumeElementIndicator: IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>;
export declare const HighLowIndexIndicator: IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>;
export declare const IntradayIntensityIndexIndicator: IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>;
export declare const IntradayMomentumIndexIndicator: IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>;
export declare const VolumeWeightedMovingAverageIndicator: IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>;
export declare const PercentageVolumeOscillatorIndicator: IndicatorDefinition<IndicatorCandle, PercentageVolumeOscillatorParameters>;
export declare const TwiggsMoneyFlowIndicator: IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>;
export declare const UltimateOscillatorIndicator: IndicatorDefinition<IndicatorCandle, IndicatorParameters>;
export declare const VolumeIndicator: IndicatorDefinition<IndicatorCandle, IndicatorParameters>;
export declare const MarketFacilitationIndexIndicator: IndicatorDefinition<IndicatorCandle, IndicatorParameters>;
export declare const NegativeVolumeIndexIndicator: IndicatorDefinition<IndicatorCandle, IndicatorParameters>;
export declare const PositiveVolumeIndexIndicator: IndicatorDefinition<IndicatorCandle, IndicatorParameters>;
export declare const PsychologicalLineIndicator: IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>;
export declare const PriceVolumeTrendIndicator: IndicatorDefinition<IndicatorCandle, IndicatorParameters>;
export declare const OnBalanceVolumeIndicator: IndicatorDefinition<IndicatorCandle, IndicatorParameters>;
export declare const OnBalanceVolumeMeanIndicator: IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>;
export declare const BalanceVolumeIndicator: IndicatorDefinition<IndicatorCandle, IndicatorParameters>;
export declare const MomentumVolumeIndicators: readonly [IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>, IndicatorDefinition<IndicatorCandle, DynamicZonesRsiParameters>, IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>, IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>, IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>, IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>, IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>, IndicatorDefinition<IndicatorCandle, MomentumOfMovingAverageParameters>, IndicatorDefinition<IndicatorCandle, OscillatorOfMovingAverageParameters>, IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>, IndicatorDefinition<IndicatorCandle, RelativeMomentumIndexParameters>, IndicatorDefinition<IndicatorCandle, RangeActionVerificationIndexParameters>, IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>, IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>, IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>, IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>, IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>, IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>, IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>, IndicatorDefinition<IndicatorCandle, ChaikinOscillatorParameters>, IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>, IndicatorDefinition<IndicatorCandle, ConnorsRsiParameters>, IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>, IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>, IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>, IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>, IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>, IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>, IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>, IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>, IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>, IndicatorDefinition<IndicatorCandle, PercentageVolumeOscillatorParameters>, IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>, IndicatorDefinition<IndicatorCandle, Readonly<Record<string, import("../indicator-definition.js").IndicatorParameterValue>>>, IndicatorDefinition<IndicatorCandle, Readonly<Record<string, import("../indicator-definition.js").IndicatorParameterValue>>>, IndicatorDefinition<IndicatorCandle, Readonly<Record<string, import("../indicator-definition.js").IndicatorParameterValue>>>, IndicatorDefinition<IndicatorCandle, Readonly<Record<string, import("../indicator-definition.js").IndicatorParameterValue>>>, IndicatorDefinition<IndicatorCandle, Readonly<Record<string, import("../indicator-definition.js").IndicatorParameterValue>>>, IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>, IndicatorDefinition<IndicatorCandle, Readonly<Record<string, import("../indicator-definition.js").IndicatorParameterValue>>>, IndicatorDefinition<IndicatorCandle, Readonly<Record<string, import("../indicator-definition.js").IndicatorParameterValue>>>, IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>, IndicatorDefinition<IndicatorCandle, Readonly<Record<string, import("../indicator-definition.js").IndicatorParameterValue>>>];
export {};

// Public API module: indicators/built-ins/range-definitions.d.ts
import { type IndicatorCandle, type IndicatorDefinition, type IndicatorParameters, type IndicatorProcessInput } from '../indicator-definition.js';
import { SequentialIndicatorProcessor, type IndicatorCalculationResult } from '../sequential-processor.js';
import { type RingBufferCheckpoint, type RollingWindowCheckpoint, type SeededMovingAverageCheckpoint } from '../math/index.js';
export interface RangeLengthParameters extends IndicatorParameters {
    readonly length: number;
}
export interface AroonCheckpoint {
    readonly highs: readonly number[];
    readonly lows: readonly number[];
    readonly maximum: number;
    readonly maximumAge: number;
    readonly minimum: number;
    readonly minimumAge: number;
}
export interface ChoppinessIndexCheckpoint {
    readonly highLowRanges: RingBufferCheckpoint<number>;
    readonly trueRanges: RingBufferCheckpoint<number>;
    readonly previousClose: number;
}
export interface ChandeKrollStopParameters extends IndicatorParameters {
    readonly period: number;
    readonly multiplier: number;
    readonly stopPeriod: number;
}
export interface ChandeKrollStopCheckpoint {
    readonly highest: RollingWindowCheckpoint;
    readonly lowest: RollingWindowCheckpoint;
    readonly longAverage: RingBufferCheckpoint<number>;
    readonly shortAverage: RingBufferCheckpoint<number>;
}
export interface FibonacciRetracementCheckpoint {
    readonly high: RollingWindowCheckpoint;
    readonly low: RollingWindowCheckpoint;
}
export interface VerticalHorizontalFilterCheckpoint {
    readonly previousClose: number | null;
    readonly highest: RollingWindowCheckpoint;
    readonly lowest: RollingWindowCheckpoint;
    readonly movement: RollingWindowCheckpoint;
}
export interface VortexIndicatorCheckpoint {
    readonly previousHigh: number | null;
    readonly previousLow: number | null;
    readonly previousClose: number | null;
    readonly trueRange: RollingWindowCheckpoint;
    readonly positiveMovement: RollingWindowCheckpoint;
    readonly negativeMovement: RollingWindowCheckpoint;
}
export declare class AroonProcessor extends SequentialIndicatorProcessor<IndicatorCandle, AroonCheckpoint> {
    readonly length: number;
    private readonly aroon;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): AroonCheckpoint;
    protected restoreState(state: AroonCheckpoint): void;
}
export declare class AroonOscillatorProcessor extends SequentialIndicatorProcessor<IndicatorCandle, AroonCheckpoint> {
    readonly length: number;
    private readonly aroon;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): AroonCheckpoint;
    protected restoreState(state: AroonCheckpoint): void;
}
export declare class BalanceOfPowerProcessor extends SequentialIndicatorProcessor<IndicatorCandle, null> {
    constructor();
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, _commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): null;
    protected restoreState(state: null): void;
}
export declare class BalanceOfMarketPowerProcessor extends SequentialIndicatorProcessor<IndicatorCandle, RollingWindowCheckpoint> {
    readonly length: number;
    private readonly average;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): RollingWindowCheckpoint;
    protected restoreState(state: RollingWindowCheckpoint): void;
}
export declare class ChoppinessIndexProcessor extends SequentialIndicatorProcessor<IndicatorCandle, ChoppinessIndexCheckpoint> {
    readonly length: number;
    private readonly highLowRanges;
    private readonly trueRanges;
    private readonly logarithm;
    private sumHighLowRange;
    private sumTrueRange;
    private previousClose;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): ChoppinessIndexCheckpoint;
    protected restoreState(state: ChoppinessIndexCheckpoint): void;
}
export declare class ChandeKrollStopProcessor extends SequentialIndicatorProcessor<IndicatorCandle, ChandeKrollStopCheckpoint> {
    readonly period: number;
    readonly multiplier: number;
    readonly stopPeriod: number;
    private readonly highest;
    private readonly lowest;
    private readonly longAverage;
    private readonly shortAverage;
    constructor(period: number, multiplier: number, stopPeriod: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): ChandeKrollStopCheckpoint;
    protected restoreState(state: ChandeKrollStopCheckpoint): void;
}
export declare class BearPowerProcessor extends SequentialIndicatorProcessor<IndicatorCandle, SeededMovingAverageCheckpoint> {
    readonly length: number;
    private readonly average;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): SeededMovingAverageCheckpoint;
    protected restoreState(state: SeededMovingAverageCheckpoint): void;
}
export declare class BullPowerProcessor extends SequentialIndicatorProcessor<IndicatorCandle, SeededMovingAverageCheckpoint> {
    readonly length: number;
    private readonly average;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): SeededMovingAverageCheckpoint;
    protected restoreState(state: SeededMovingAverageCheckpoint): void;
}
export declare class ElderRayProcessor extends SequentialIndicatorProcessor<IndicatorCandle, SeededMovingAverageCheckpoint> {
    readonly length: number;
    private readonly average;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): SeededMovingAverageCheckpoint;
    protected restoreState(state: SeededMovingAverageCheckpoint): void;
}
export declare class FibonacciRetracementProcessor extends SequentialIndicatorProcessor<IndicatorCandle, FibonacciRetracementCheckpoint> {
    readonly length: number;
    private readonly high;
    private readonly low;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): FibonacciRetracementCheckpoint;
    protected restoreState(state: FibonacciRetracementCheckpoint): void;
}
export declare class VerticalHorizontalFilterProcessor extends SequentialIndicatorProcessor<IndicatorCandle, VerticalHorizontalFilterCheckpoint> {
    readonly length: number;
    private previousClose;
    private readonly highest;
    private readonly lowest;
    private readonly movement;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): VerticalHorizontalFilterCheckpoint;
    protected restoreState(state: VerticalHorizontalFilterCheckpoint): void;
}
export declare class VortexIndicatorProcessor extends SequentialIndicatorProcessor<IndicatorCandle, VortexIndicatorCheckpoint> {
    readonly length: number;
    private previousHigh;
    private previousLow;
    private previousClose;
    private readonly trueRange;
    private readonly positiveMovement;
    private readonly negativeMovement;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): VortexIndicatorCheckpoint;
    protected restoreState(state: VortexIndicatorCheckpoint): void;
}
export declare const AroonIndicator: IndicatorDefinition<IndicatorCandle, RangeLengthParameters>;
export declare const AroonOscillatorIndicator: IndicatorDefinition<IndicatorCandle, RangeLengthParameters>;
export declare const BalanceOfPowerIndicator: IndicatorDefinition<IndicatorCandle, IndicatorParameters>;
export declare const BearPowerIndicator: IndicatorDefinition<IndicatorCandle, RangeLengthParameters>;
export declare const BullPowerIndicator: IndicatorDefinition<IndicatorCandle, RangeLengthParameters>;
export declare const BalanceOfMarketPowerIndicator: IndicatorDefinition<IndicatorCandle, RangeLengthParameters>;
export declare const ChoppinessIndexIndicator: IndicatorDefinition<IndicatorCandle, RangeLengthParameters>;
export declare const ChandeKrollStopIndicator: IndicatorDefinition<IndicatorCandle, ChandeKrollStopParameters>;
export declare const ElderRayIndicator: IndicatorDefinition<IndicatorCandle, RangeLengthParameters>;
export declare const FibonacciRetracementIndicator: IndicatorDefinition<IndicatorCandle, RangeLengthParameters>;
export declare const VerticalHorizontalFilterIndicator: IndicatorDefinition<IndicatorCandle, RangeLengthParameters>;
export declare const VortexIndicator: IndicatorDefinition<IndicatorCandle, RangeLengthParameters>;
export declare const RangeIndicators: readonly [IndicatorDefinition<IndicatorCandle, RangeLengthParameters>, IndicatorDefinition<IndicatorCandle, RangeLengthParameters>, IndicatorDefinition<IndicatorCandle, Readonly<Record<string, import("../indicator-definition.js").IndicatorParameterValue>>>, IndicatorDefinition<IndicatorCandle, RangeLengthParameters>, IndicatorDefinition<IndicatorCandle, RangeLengthParameters>, IndicatorDefinition<IndicatorCandle, RangeLengthParameters>, IndicatorDefinition<IndicatorCandle, RangeLengthParameters>, IndicatorDefinition<IndicatorCandle, ChandeKrollStopParameters>, IndicatorDefinition<IndicatorCandle, RangeLengthParameters>, IndicatorDefinition<IndicatorCandle, RangeLengthParameters>, IndicatorDefinition<IndicatorCandle, RangeLengthParameters>, IndicatorDefinition<IndicatorCandle, RangeLengthParameters>];

// Public API module: indicators/built-ins/recursive-statistical-definitions.d.ts
import { type IndicatorCandle, type IndicatorDefinition, type IndicatorParameters, type IndicatorProcessInput } from '../indicator-definition.js';
import { SequentialIndicatorProcessor, type IndicatorCalculationResult } from '../sequential-processor.js';
import { type ExpandingWilderMovingAverageCheckpoint, type RingBufferCheckpoint } from '../math/index.js';
export interface RecursiveLengthParameters extends IndicatorParameters {
    readonly length: number;
}
export interface FractalDimensionCheckpoint {
    readonly values: RingBufferCheckpoint<number>;
}
export interface HurstExponentCheckpoint {
    readonly values: RingBufferCheckpoint<number | null>;
}
export interface MarketMeannessIndexCheckpoint {
    readonly values: RingBufferCheckpoint<number>;
    readonly priceChanges: number;
    readonly directionChanges: number;
    readonly previousDirection: -1 | 0 | 1;
}
export interface DirectionalCandleSnapshot {
    readonly high: number;
    readonly low: number;
    readonly close: number;
}
export interface DirectionalMovementCheckpoint {
    readonly previousCandle: DirectionalCandleSnapshot | null;
    readonly plus: ExpandingWilderMovingAverageCheckpoint;
    readonly minus: ExpandingWilderMovingAverageCheckpoint;
    readonly trueRange: ExpandingWilderMovingAverageCheckpoint;
}
export interface AverageDirectionalIndexCheckpoint extends DirectionalMovementCheckpoint {
    readonly average: ExpandingWilderMovingAverageCheckpoint;
}
export declare class AverageDirectionalIndexProcessor extends SequentialIndicatorProcessor<IndicatorCandle, AverageDirectionalIndexCheckpoint> {
    readonly length: number;
    private readonly directional;
    private readonly average;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): AverageDirectionalIndexCheckpoint;
    protected restoreState(state: AverageDirectionalIndexCheckpoint): void;
}
export declare class DirectionalIndexProcessor extends SequentialIndicatorProcessor<IndicatorCandle, DirectionalMovementCheckpoint> {
    readonly length: number;
    private readonly directional;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): DirectionalMovementCheckpoint;
    protected restoreState(state: DirectionalMovementCheckpoint): void;
}
export interface CommodityChannelIndexCheckpoint {
    readonly typicalPrices: RingBufferCheckpoint<number | null>;
}
export declare class CommodityChannelIndexProcessor extends SequentialIndicatorProcessor<IndicatorCandle, CommodityChannelIndexCheckpoint> {
    readonly length: number;
    private readonly index;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): CommodityChannelIndexCheckpoint;
    protected restoreState(state: CommodityChannelIndexCheckpoint): void;
}
export declare class FractalDimensionProcessor extends SequentialIndicatorProcessor<IndicatorCandle, FractalDimensionCheckpoint> {
    readonly length: number;
    private readonly values;
    private readonly maximum;
    private readonly minimum;
    private readonly logDenominator;
    private pathLength;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): FractalDimensionCheckpoint;
    protected restoreState(state: FractalDimensionCheckpoint): void;
    private projectPath;
    private append;
}
export declare class HurstExponentProcessor extends SequentialIndicatorProcessor<IndicatorCandle, HurstExponentCheckpoint> {
    readonly length: number;
    private readonly values;
    private readonly logLength;
    private sum;
    private invalid;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): HurstExponentCheckpoint;
    protected restoreState(state: HurstExponentCheckpoint): void;
    private evaluate;
    private projectedValue;
    private append;
}
export declare class MarketMeannessIndexProcessor extends SequentialIndicatorProcessor<IndicatorCandle, MarketMeannessIndexCheckpoint> {
    readonly length: number;
    private readonly values;
    private priceChanges;
    private directionChanges;
    private previousDirection;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): MarketMeannessIndexCheckpoint;
    protected restoreState(state: MarketMeannessIndexCheckpoint): void;
    private evaluate;
    private sign;
}
export declare const AverageDirectionalIndexIndicator: IndicatorDefinition<IndicatorCandle, RecursiveLengthParameters>;
export declare const DirectionalIndexIndicator: IndicatorDefinition<IndicatorCandle, RecursiveLengthParameters>;
export declare const CommodityChannelIndexIndicator: IndicatorDefinition<IndicatorCandle, RecursiveLengthParameters>;
export declare const FractalDimensionIndicator: IndicatorDefinition<IndicatorCandle, RecursiveLengthParameters>;
export declare const HurstExponentIndicator: IndicatorDefinition<IndicatorCandle, RecursiveLengthParameters>;
export declare const MarketMeannessIndexIndicator: IndicatorDefinition<IndicatorCandle, RecursiveLengthParameters>;
export declare const RecursiveStatisticalIndicators: readonly [IndicatorDefinition<IndicatorCandle, RecursiveLengthParameters>, IndicatorDefinition<IndicatorCandle, RecursiveLengthParameters>, IndicatorDefinition<IndicatorCandle, RecursiveLengthParameters>, IndicatorDefinition<IndicatorCandle, RecursiveLengthParameters>, IndicatorDefinition<IndicatorCandle, RecursiveLengthParameters>, IndicatorDefinition<IndicatorCandle, RecursiveLengthParameters>];

// Public API module: indicators/built-ins/shifted-sparse-definitions.d.ts
import { type IndicatorCandle, type IndicatorDefinition, type IndicatorParameters, type IndicatorProcessInput } from '../indicator-definition.js';
import { SequentialIndicatorProcessor, type IndicatorCalculationResult } from '../sequential-processor.js';
import { type RingBufferCheckpoint, type RollingWindowCheckpoint, type SmoothedMovingAverageCheckpoint } from '../math/index.js';
export interface IchimokuParameters extends IndicatorParameters {
    readonly tenkan: number;
    readonly kijun: number;
    readonly senkouB: number;
}
export interface FractalsParameters extends IndicatorParameters {
    readonly length: number;
}
export interface AlligatorParameters extends IndicatorParameters {
    readonly jawLength: number;
    readonly jawShift: number;
    readonly teethLength: number;
    readonly teethShift: number;
    readonly lipsLength: number;
    readonly lipsShift: number;
}
export interface AlligatorCheckpoint {
    readonly jaw: SmoothedMovingAverageCheckpoint;
    readonly teeth: SmoothedMovingAverageCheckpoint;
    readonly lips: SmoothedMovingAverageCheckpoint;
}
export interface GatorLineCheckpoint {
    readonly average: SmoothedMovingAverageCheckpoint;
    readonly delay: RingBufferCheckpoint<number | null>;
}
export interface GatorOscillatorCheckpoint {
    readonly jaw: GatorLineCheckpoint;
    readonly teeth: GatorLineCheckpoint;
    readonly lips: GatorLineCheckpoint;
}
export interface ZigZagParameters extends IndicatorParameters {
    readonly deviation: number;
}
export interface FractalWindowValue {
    readonly high: number | null;
    readonly low: number | null;
}
export interface FractalsCheckpoint {
    readonly window: RingBufferCheckpoint<FractalWindowValue>;
    readonly upCounter: number;
    readonly downCounter: number;
}
export interface ZigZagCheckpoint {
    readonly disabled: boolean;
    readonly previousClose: number | null;
    readonly lastExtremum: number | null;
    readonly isUpTrend: boolean | null;
    readonly shift: number;
}
export interface IchimokuCheckpoint {
    readonly tenkanHigh: RollingWindowCheckpoint;
    readonly tenkanLow: RollingWindowCheckpoint;
    readonly kijunHigh: RollingWindowCheckpoint;
    readonly kijunLow: RollingWindowCheckpoint;
    readonly senkouBHigh: RollingWindowCheckpoint;
    readonly senkouBLow: RollingWindowCheckpoint;
}
export declare class AlligatorProcessor extends SequentialIndicatorProcessor<IndicatorCandle, AlligatorCheckpoint> {
    readonly jawLength: number;
    readonly jawShift: number;
    readonly teethLength: number;
    readonly teethShift: number;
    readonly lipsLength: number;
    readonly lipsShift: number;
    private readonly jaw;
    private readonly teeth;
    private readonly lips;
    constructor(jawLength: number, jawShift: number, teethLength: number, teethShift: number, lipsLength: number, lipsShift: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): AlligatorCheckpoint;
    protected restoreState(state: AlligatorCheckpoint): void;
}
export declare class GatorOscillatorProcessor extends SequentialIndicatorProcessor<IndicatorCandle, GatorOscillatorCheckpoint> {
    readonly jawLength: number;
    readonly jawShift: number;
    readonly teethLength: number;
    readonly teethShift: number;
    readonly lipsLength: number;
    readonly lipsShift: number;
    private readonly jaw;
    private readonly teeth;
    private readonly lips;
    private readonly jawDelay;
    private readonly teethDelay;
    private readonly lipsDelay;
    constructor(jawLength: number, jawShift: number, teethLength: number, teethShift: number, lipsLength: number, lipsShift: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): GatorOscillatorCheckpoint;
    protected restoreState(state: GatorOscillatorCheckpoint): void;
    private line;
    private lineCheckpoint;
    private restoreLine;
}
export declare class IchimokuProcessor extends SequentialIndicatorProcessor<IndicatorCandle, IchimokuCheckpoint> {
    readonly tenkan: number;
    readonly kijun: number;
    readonly senkouB: number;
    private readonly tenkanHigh;
    private readonly tenkanLow;
    private readonly kijunHigh;
    private readonly kijunLow;
    private readonly senkouBHigh;
    private readonly senkouBLow;
    constructor(tenkan: number, kijun: number, senkouB: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): IchimokuCheckpoint;
    protected restoreState(state: IchimokuCheckpoint): void;
    private forward;
}
export declare class FractalsProcessor extends SequentialIndicatorProcessor<IndicatorCandle, FractalsCheckpoint> {
    readonly length: number;
    private readonly window;
    private upCounter;
    private downCounter;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): FractalsCheckpoint;
    protected restoreState(state: FractalsCheckpoint): void;
    private pivot;
}
type ZigZagSource = 'close' | 'high' | 'low';
type ZigZagDirection = 'both' | 'up' | 'down';
declare class ZigZagFamilyProcessor extends SequentialIndicatorProcessor<IndicatorCandle, ZigZagCheckpoint> {
    readonly deviation: number;
    private readonly source;
    private readonly direction;
    private disabled;
    private previousPrice;
    private lastExtremum;
    private isUpTrend;
    private shift;
    constructor(deviation: number, source: ZigZagSource, direction: ZigZagDirection);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): ZigZagCheckpoint;
    protected restoreState(state: ZigZagCheckpoint): void;
}
export declare class ZigZagProcessor extends ZigZagFamilyProcessor {
    constructor(deviation: number);
}
export declare class PeakProcessor extends ZigZagFamilyProcessor {
    constructor(deviation: number);
}
export declare class TroughProcessor extends ZigZagFamilyProcessor {
    constructor(deviation: number);
}
export declare const IchimokuIndicator: IndicatorDefinition<IndicatorCandle, IchimokuParameters>;
export declare const AlligatorIndicator: IndicatorDefinition<IndicatorCandle, AlligatorParameters>;
export declare const GatorOscillatorIndicator: IndicatorDefinition<IndicatorCandle, AlligatorParameters>;
export declare const FractalsIndicator: IndicatorDefinition<IndicatorCandle, FractalsParameters>;
export declare const ZigZagIndicator: IndicatorDefinition<IndicatorCandle, ZigZagParameters>;
export declare const PeakIndicator: IndicatorDefinition<IndicatorCandle, ZigZagParameters>;
export declare const TroughIndicator: IndicatorDefinition<IndicatorCandle, ZigZagParameters>;
export declare const ShiftedSparseIndicators: readonly [IndicatorDefinition<IndicatorCandle, IchimokuParameters>, IndicatorDefinition<IndicatorCandle, AlligatorParameters>, IndicatorDefinition<IndicatorCandle, AlligatorParameters>, IndicatorDefinition<IndicatorCandle, FractalsParameters>, IndicatorDefinition<IndicatorCandle, ZigZagParameters>, IndicatorDefinition<IndicatorCandle, ZigZagParameters>, IndicatorDefinition<IndicatorCandle, ZigZagParameters>];
export {};

// Public API module: indicators/built-ins/volatility-definitions.d.ts
import { type IndicatorCandle, type IndicatorDefinition, type IndicatorParameters, type IndicatorProcessInput } from '../indicator-definition.js';
import { SequentialIndicatorProcessor, type IndicatorCalculationResult } from '../sequential-processor.js';
import { type RingBufferCheckpoint, type RollingWindowCheckpoint, type PartialSeedExponentialMovingAverageCheckpoint } from '../math/index.js';
export interface VolatilityLengthParameters extends IndicatorParameters {
    readonly length: number;
}
export interface HistoricalVolatilityRatioParameters extends IndicatorParameters {
    readonly shortPeriod: number;
    readonly longPeriod: number;
}
export interface MassIndexParameters extends IndicatorParameters {
    readonly length: number;
    readonly emaLength: number;
}
export interface ChaikinVolatilityParameters extends IndicatorParameters {
    readonly emaLength: number;
    readonly rocLength: number;
}
export interface ChaikinVolatilityCheckpoint {
    readonly averageCount: number;
    readonly averageSeedSum: number;
    readonly averageFormed: boolean;
    readonly averagePrevious: number;
    readonly history: RingBufferCheckpoint<number | null>;
}
export interface GopalakrishnanRangeIndexCheckpoint {
    readonly high: RollingWindowCheckpoint;
    readonly low: RollingWindowCheckpoint;
}
export interface HistoricalVolatilityRatioCheckpoint {
    readonly short: RollingWindowCheckpoint;
    readonly long: RollingWindowCheckpoint;
}
export interface MassIndexCheckpoint {
    readonly single: PartialSeedExponentialMovingAverageCheckpoint;
    readonly double: PartialSeedExponentialMovingAverageCheckpoint;
    readonly ratios: RingBufferCheckpoint<number>;
    readonly ratioSum: number;
}
export declare class ChaikinVolatilityProcessor extends SequentialIndicatorProcessor<IndicatorCandle, ChaikinVolatilityCheckpoint> {
    readonly emaLength: number;
    readonly rocLength: number;
    private averageCount;
    private averageSeedSum;
    private averageFormed;
    private averagePrevious;
    private readonly history;
    constructor(emaLength: number, rocLength: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): ChaikinVolatilityCheckpoint;
    protected restoreState(state: ChaikinVolatilityCheckpoint): void;
    private evaluateAverage;
}
export declare class MassIndexProcessor extends SequentialIndicatorProcessor<IndicatorCandle, MassIndexCheckpoint> {
    readonly length: number;
    readonly emaLength: number;
    private readonly single;
    private readonly double;
    private readonly ratios;
    private ratioSum;
    constructor(length: number, emaLength: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): MassIndexCheckpoint;
    protected restoreState(state: MassIndexCheckpoint): void;
}
export declare class GopalakrishnanRangeIndexProcessor extends SequentialIndicatorProcessor<IndicatorCandle, GopalakrishnanRangeIndexCheckpoint> {
    readonly length: number;
    private readonly high;
    private readonly low;
    private readonly logLength;
    constructor(length: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): GopalakrishnanRangeIndexCheckpoint;
    protected restoreState(state: GopalakrishnanRangeIndexCheckpoint): void;
}
export declare class HistoricalVolatilityRatioProcessor extends SequentialIndicatorProcessor<IndicatorCandle, HistoricalVolatilityRatioCheckpoint> {
    readonly shortPeriod: number;
    readonly longPeriod: number;
    private readonly short;
    private readonly long;
    constructor(shortPeriod: number, longPeriod: number);
    protected calculate(input: IndicatorProcessInput<IndicatorCandle>, commit: boolean): IndicatorCalculationResult;
    protected resetState(): void;
    protected captureState(): HistoricalVolatilityRatioCheckpoint;
    protected restoreState(state: HistoricalVolatilityRatioCheckpoint): void;
}
export declare const ChaikinVolatilityIndicator: IndicatorDefinition<IndicatorCandle, ChaikinVolatilityParameters>;
export declare const MassIndexIndicator: IndicatorDefinition<IndicatorCandle, MassIndexParameters>;
export declare const GopalakrishnanRangeIndexIndicator: IndicatorDefinition<IndicatorCandle, VolatilityLengthParameters>;
export declare const HistoricalVolatilityRatioIndicator: IndicatorDefinition<IndicatorCandle, HistoricalVolatilityRatioParameters>;
export declare const VolatilityIndicators: readonly [IndicatorDefinition<IndicatorCandle, ChaikinVolatilityParameters>, IndicatorDefinition<IndicatorCandle, MassIndexParameters>, IndicatorDefinition<IndicatorCandle, VolatilityLengthParameters>, IndicatorDefinition<IndicatorCandle, HistoricalVolatilityRatioParameters>];

// Public API module: indicators/index.d.ts
export * from './indicator-definition.js';
export * from './indicator-registry.js';
export * from './sequential-processor.js';
export * from './indicator-runtime.js';
export * from './indicator-source.js';
export * from './indicator-output-style.js';
export * from './indicator-taxonomy.js';
export * from './math/index.js';
export * from './built-ins/index.js';

// Public API module: indicators/indicator-definition.d.ts
import type { CandlestickData, Time } from '../core/chart-api.js';
export interface IndicatorCandle extends CandlestickData {
    readonly volume?: number;
}
export declare const IndicatorCategory: Readonly<{
    readonly Trend: 'trend';
    readonly Momentum: 'momentum';
    readonly Volatility: 'volatility';
    readonly Volume: 'volume';
    readonly Price: 'price';
    readonly MarketStrength: 'market-strength';
    readonly SupportResistance: 'support-resistance';
    readonly Cycle: 'cycle';
    readonly Statistical: 'statistical';
}>;
export type IndicatorCategory = typeof IndicatorCategory[keyof typeof IndicatorCategory];
export declare const IndicatorInputKind: Readonly<{
    readonly Candlestick: 'candlestick';
    readonly Scalar: 'scalar';
}>;
export type IndicatorInputKind = typeof IndicatorInputKind[keyof typeof IndicatorInputKind];
export declare const IndicatorInputFieldType: Readonly<{
    readonly Number: 'number';
}>;
export type IndicatorInputFieldType = typeof IndicatorInputFieldType[keyof typeof IndicatorInputFieldType];
export interface IndicatorInputField {
    readonly id: string;
    readonly type: IndicatorInputFieldType;
    readonly required: boolean;
}
export interface IndicatorInputSchema {
    readonly kind: IndicatorInputKind;
    readonly fields: readonly IndicatorInputField[];
}
export declare const IndicatorParameterType: Readonly<{
    readonly Number: 'number';
    readonly Integer: 'integer';
    readonly Boolean: 'boolean';
    readonly String: 'string';
}>;
export type IndicatorParameterType = typeof IndicatorParameterType[keyof typeof IndicatorParameterType];
export type IndicatorParameterValue = number | boolean | string;
export type IndicatorParameters = Readonly<Record<string, IndicatorParameterValue>>;
export interface IndicatorParameterDefinition {
    readonly id: string;
    readonly name: string;
    readonly description?: string;
    readonly type: IndicatorParameterType;
    readonly defaultValue: IndicatorParameterValue;
    readonly min?: number;
    readonly max?: number;
    readonly step?: number;
    readonly options?: readonly string[];
}
export declare const IndicatorSeriesStyle: Readonly<{
    readonly Line: 'line';
    readonly Histogram: 'histogram';
    readonly Area: 'area';
    readonly Band: 'band';
    readonly Markers: 'markers';
}>;
export type IndicatorSeriesStyle = typeof IndicatorSeriesStyle[keyof typeof IndicatorSeriesStyle];
export interface IndicatorOutputStyle {
    readonly series: IndicatorSeriesStyle;
    readonly color?: string;
    readonly lineWidth?: number;
    readonly visible?: boolean;
    readonly options?: Readonly<Record<string, string | number | boolean>>;
}
export interface IndicatorOutputDefinition {
    readonly id: string;
    readonly name: string;
    readonly description?: string;
    readonly defaultStyle: IndicatorOutputStyle;
}
export type IndicatorOutputFactory<TParameters extends IndicatorParameters> = (parameters: TParameters) => readonly IndicatorOutputDefinition[];
export declare const IndicatorPane: Readonly<{
    readonly Overlay: 'overlay';
    readonly Separate: 'separate';
}>;
export type IndicatorPane = typeof IndicatorPane[keyof typeof IndicatorPane];
export declare const IndicatorMeasure: Readonly<{
    readonly Price: 'price';
    readonly Percent: 'percent';
    readonly MinusOnePlusOne: 'minus-one-plus-one';
    readonly Volume: 'volume';
    readonly Absolute: 'absolute';
}>;
export type IndicatorMeasure = typeof IndicatorMeasure[keyof typeof IndicatorMeasure];
/** One source value passed to an incremental processor. */
export interface IndicatorProcessInput<TInput> {
    readonly index: number;
    readonly time: Time;
    readonly value: Readonly<TInput>;
    /** False means preview the current input without mutating committed state. */
    readonly isFinal: boolean;
}
/** Immutable painter fields carried alongside one numeric output value. */
export type IndicatorOutputMetadataValue = string | number | boolean | null;
export type IndicatorOutputMetadata = Readonly<Record<string, IndicatorOutputMetadataValue>>;
/** One named numeric value, placed at an explicit logical input index. */
export interface IndicatorOutputValue {
    readonly outputId: string;
    readonly value: number | null;
    readonly targetIndex: number;
    /** Optional flat fields forwarded to the rendered data point. */
    readonly metadata?: IndicatorOutputMetadata;
}
export interface IndicatorProcessResult {
    readonly sourceIndex: number;
    readonly isFormed: boolean;
    readonly values: readonly IndicatorOutputValue[];
}
/**
 * Stateful incremental processor. A non-final process call must leave the
 * checkpoint byte-for-byte equivalent to the state before that call.
 */
export interface IIndicatorProcessor<TInput> {
    readonly position: number;
    reset(): void;
    process(input: IndicatorProcessInput<TInput>): IndicatorProcessResult;
    checkpoint(): unknown;
    restore(checkpoint: unknown): void;
}
export type IndicatorProcessorFactory<TInput, TParameters extends IndicatorParameters> = (parameters: TParameters) => IIndicatorProcessor<TInput>;
/** Metadata and executable factory for one genuinely incremental indicator. */
export interface IndicatorDefinition<TInput = IndicatorCandle, TParameters extends IndicatorParameters = IndicatorParameters> {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly category: IndicatorCategory;
    readonly input: IndicatorInputSchema;
    readonly parameters: readonly IndicatorParameterDefinition[];
    readonly outputs: readonly IndicatorOutputDefinition[];
    /** Resolves parameter-dependent outputs; `outputs` describes the default parameters. */
    readonly outputFactory?: IndicatorOutputFactory<TParameters>;
    readonly naturalPane: IndicatorPane;
    readonly measure: IndicatorMeasure;
    readonly processorFactory: IndicatorProcessorFactory<TInput, TParameters>;
}
export declare function resolveIndicatorOutputs<TInput, TParameters extends IndicatorParameters>(definition: IndicatorDefinition<TInput, TParameters>, parameters: TParameters): readonly IndicatorOutputDefinition[];
export declare const CandlestickIndicatorInput: IndicatorInputSchema;

// Public API module: indicators/indicator-output-style.d.ts
import type { LineStyleValue } from '../core/chart-api.js';
/** Effective editor-facing appearance of one semantic indicator output. */
export interface IndicatorOutputAppearance {
    readonly color?: string;
    readonly lineWidth?: number;
    readonly lineStyle?: LineStyleValue;
    readonly visible: boolean;
    readonly precision?: number;
}
/** Fields accepted by a live output-style edit. Omitted fields stay unchanged. */
export interface IndicatorOutputStylePatch {
    readonly color?: string;
    /** Null clears an explicit width and returns to the renderer default. */
    readonly lineWidth?: number | null;
    /** Null clears an explicit dash style and returns to the renderer default. */
    readonly lineStyle?: LineStyleValue | null;
    readonly visible?: boolean;
    /** Null clears an explicit precision and returns to the series formatter. */
    readonly precision?: number | null;
}
/** Validates and freezes an editor supplied partial appearance. */
export declare function normalizeIndicatorOutputStylePatch(value: unknown): IndicatorOutputStylePatch;

// Public API module: indicators/indicator-registry.d.ts
import { type IndicatorDefinition, type IndicatorParameters } from './indicator-definition.js';
/** Registry for definitions backed by real incremental processors. */
export declare class IndicatorRegistry {
    private readonly definitions;
    register<TInput, TParameters extends IndicatorParameters>(definition: IndicatorDefinition<TInput, TParameters>): IndicatorDefinition<TInput, TParameters>;
    unregister(id: string): boolean;
    has(id: string): boolean;
    get(id: string): IndicatorDefinition<any, any> | undefined;
    all(): readonly IndicatorDefinition<any, any>[];
}
export declare const indicatorRegistry: IndicatorRegistry;
export declare function registerIndicator<TInput, TParameters extends IndicatorParameters>(definition: IndicatorDefinition<TInput, TParameters>): IndicatorDefinition<TInput, TParameters>;
export declare function unregisterIndicator(id: string): boolean;
export declare function getIndicatorDefinition(id: string): IndicatorDefinition<any, any> | undefined;
export declare function getIndicatorDefinitions(): readonly IndicatorDefinition<any, any>[];

// Public API module: indicators/indicator-runtime.d.ts
import type { Time } from '../core/chart-api.js';
import type { IndicatorDefinition, IndicatorOutputMetadata, IndicatorOutputDefinition, IndicatorParameters } from './indicator-definition.js';
export interface IndicatorRuntimeInput<TInput> {
    readonly time: Time;
    readonly value: TInput;
}
export interface IndicatorRuntimePoint {
    readonly outputId: string;
    readonly sourceIndex: number;
    readonly targetIndex: number;
    /** Null only while a forward-shifted target bar does not exist yet. */
    readonly time: Time | null;
    readonly value: number;
    /** Optional flat fields forwarded to the rendered data point. */
    readonly metadata?: IndicatorOutputMetadata;
}
export declare const IndicatorPatchOperation: Readonly<{
    readonly Append: 'append';
    readonly Replace: 'replace';
    readonly Remove: 'remove';
}>;
export type IndicatorPatchOperation = typeof IndicatorPatchOperation[keyof typeof IndicatorPatchOperation];
export interface IndicatorRuntimePatchOperation {
    readonly operation: IndicatorPatchOperation;
    readonly outputId: string;
    readonly targetIndex: number;
    readonly point?: IndicatorRuntimePoint;
}
export declare const IndicatorRuntimePatchKind: Readonly<{
    readonly Reset: 'reset';
    readonly Update: 'update';
    readonly Correction: 'correction';
}>;
export type IndicatorRuntimePatchKind = typeof IndicatorRuntimePatchKind[keyof typeof IndicatorRuntimePatchKind];
export interface IndicatorRuntimePatch {
    readonly revision: number;
    readonly kind: IndicatorRuntimePatchKind;
    readonly fromIndex: number;
    readonly operations: readonly IndicatorRuntimePatchOperation[];
}
export interface IndicatorRuntimeSnapshot {
    readonly revision: number;
    readonly committedInputs: number;
    /** First committed input whose value is still retained for correction replay. */
    readonly retainedFrom: number;
    readonly hasPreview: boolean;
    readonly outputPoints: number;
    readonly checkpoints: number;
}
export interface IndicatorRuntimeOptions<TInput, TParameters extends IndicatorParameters> {
    readonly definition: IndicatorDefinition<TInput, TParameters>;
    readonly parameters: TParameters;
    readonly checkpointInterval?: number;
    /** Owns a stable input snapshot for later correction replay. */
    readonly snapshotInput?: (value: TInput) => Readonly<TInput>;
}
/** Stateful, patch-producing runtime for one indicator definition. */
export declare class IndicatorRuntime<TInput, TParameters extends IndicatorParameters> {
    readonly options: IndicatorRuntimeOptions<TInput, TParameters>;
    private readonly processor;
    private readonly outputsValue;
    private readonly checkpointInterval;
    private readonly snapshotInput;
    private readonly outputOrder;
    private readonly inputsValue;
    private readonly results;
    private readonly contributions;
    private readonly committedOutputs;
    private readonly previewOutputs;
    private readonly previewRemovals;
    private readonly keysByTarget;
    private readonly checkpoints;
    private readonly archivedTimes;
    private basePositionValue;
    private previewInput;
    private revisionValue;
    constructor(options: IndicatorRuntimeOptions<TInput, TParameters>);
    get revision(): number;
    get outputs(): readonly IndicatorOutputDefinition[];
    get committedCount(): number;
    get retainedFrom(): number;
    get hasPreview(): boolean;
    snapshot(): IndicatorRuntimeSnapshot;
    /** Returns only input values retained for correction replay. */
    inputs(): readonly IndicatorRuntimeInput<Readonly<TInput>>[];
    points(outputId?: string): readonly IndicatorRuntimePoint[];
    /**
     * Releases committed input values, output history and replay checkpoints.
     * The processor state, absolute indexes, target times and current preview
     * remain valid. The consumer must already own all previously emitted points;
     * corrections before `retainedFrom` and a historical patch-only reset are no
     * longer possible until the runtime is seeded again with `reset()`.
     */
    compactHistory(): IndicatorRuntimeSnapshot;
    /**
     * Rebuilds the processor and returns one full output snapshot while retaining
     * only streaming state. This is the bounded-memory initialization path for a
     * consumer that immediately owns the returned points via a full `setData`.
     */
    resetStreaming(inputs?: readonly IndicatorRuntimeInput<TInput>[], preview?: IndicatorRuntimeInput<TInput>): readonly IndicatorRuntimePoint[];
    reset(inputs?: readonly IndicatorRuntimeInput<TInput>[]): IndicatorRuntimePatch;
    update(input: IndicatorRuntimeInput<TInput>, isFinal?: boolean): IndicatorRuntimePatch;
    /**
     * Removes the current non-final input and restores the committed output
     * visible underneath it. This is the inverse of update(input, false) and
     * is intentionally patch-producing so a streaming renderer can rewind a
     * derived tail without rebuilding the complete indicator history.
     */
    discardPreview(): IndicatorRuntimePatch;
    /**
     * Removes exactly one retained committed input and restores processor state
     * from its nearest checkpoint. Call discardPreview() first when a preview is
     * installed. Compacted inputs deliberately cannot be reopened: consumers
     * that need a rewindable tail must retain that tail instead of compacting it.
     */
    truncateTail(): IndicatorRuntimePatch;
    correct(index: number, input: IndicatorRuntimeInput<TInput>): IndicatorRuntimePatch;
    private correctNormalized;
    private reopenLast;
    private processTail;
    private commitInput;
    private installPreview;
    private setPreview;
    private clearPreview;
    private replayFrom;
    private removeResultsFrom;
    private applyCommittedResult;
    private applyStreamingResult;
    private storedOutput;
    private rememberKey;
    private forgetKey;
    private keysAtTarget;
    private maybeCheckpoint;
    private runtimeCheckpoint;
    private normalizeInput;
    private assertIncreasing;
    private validateProcessor;
    private normalizeResult;
    private captureState;
    private restoreState;
    private restoreMap;
    private clearState;
    private capture;
    private captureAll;
    private materialize;
    private materializeStored;
    private timeAt;
    private inputAt;
    private currentPoints;
    private diff;
    private patch;
}

// Public API module: indicators/indicator-source.d.ts
export declare const IndicatorSourceKind: Readonly<{
    readonly Candles: 'candles';
    readonly CandleField: 'candle-field';
    readonly IndicatorOutput: 'indicator-output';
}>;
export type IndicatorSourceKind = typeof IndicatorSourceKind[keyof typeof IndicatorSourceKind];
export declare const IndicatorCandleField: Readonly<{
    readonly Open: 'open';
    readonly High: 'high';
    readonly Low: 'low';
    readonly Close: 'close';
    readonly Median: 'hl2';
    readonly Typical: 'hlc3';
    readonly Average: 'ohlc4';
    readonly Volume: 'volume';
}>;
export type IndicatorCandleField = typeof IndicatorCandleField[keyof typeof IndicatorCandleField];
export interface IndicatorCandlesSource {
    /** Full OHLCV candle input; scalar definitions receive its close field. */
    readonly kind: typeof IndicatorSourceKind.Candles;
}
export interface IndicatorCandleFieldSource {
    /** The selected scalar is lifted to O=H=L=C for candlestick-input definitions. */
    readonly kind: typeof IndicatorSourceKind.CandleField;
    readonly field: IndicatorCandleField;
}
/**
 * Uses finite samples from one output on their rendered timestamps. Missing
 * sparse samples are skipped. `indicatorId` is the stable persistence id.
 */
export interface IndicatorOutputSource {
    readonly kind: typeof IndicatorSourceKind.IndicatorOutput;
    readonly indicatorId: string;
    readonly outputId: string;
}
export type IndicatorSource = IndicatorCandlesSource | IndicatorCandleFieldSource | IndicatorOutputSource;
export declare const IndicatorSourceStatusReason: Readonly<{
    readonly Ready: 'ready';
    readonly MissingIndicator: 'missing-indicator';
    readonly MissingOutput: 'missing-output';
    readonly UpstreamUnavailable: 'upstream-unavailable';
    readonly Error: 'error';
}>;
export type IndicatorSourceStatusReason = typeof IndicatorSourceStatusReason[keyof typeof IndicatorSourceStatusReason];
export interface IndicatorSourceStatus {
    readonly source: IndicatorSource;
    readonly available: boolean;
    readonly reason: IndicatorSourceStatusReason;
}
export declare const DefaultIndicatorSource: IndicatorCandlesSource;
/** Validates, clones and freezes an editor/persistence supplied source binding. */
export declare function normalizeIndicatorSource(value: unknown): IndicatorSource;
export declare function indicatorSourcesEqual(left: IndicatorSource, right: IndicatorSource): boolean;

// Public API module: indicators/indicator-taxonomy.d.ts
import { type IndicatorCategory as IndicatorCategoryValue } from './indicator-definition.js';
export interface IndicatorTaxonomyEntry {
    readonly category: IndicatorCategoryValue;
    readonly label: string;
    readonly order: number;
}
/** Canonical trading-oriented category order and labels shared by catalog and UI. */
export declare const IndicatorTaxonomy: readonly IndicatorTaxonomyEntry[];
export declare function indicatorTaxonomyEntry(category: IndicatorCategoryValue): IndicatorTaxonomyEntry;
export declare function indicatorCategoryLabel(category: IndicatorCategoryValue): string;

// Public API module: indicators/math/efficiency-ratio.d.ts
import { type RingBufferCheckpoint } from './ring-buffer.js';
type NumericValue = number | null | undefined;
export type RollingEfficiencyRatioCheckpoint = RingBufferCheckpoint<number | null>;
/** Kaufman efficiency ratio over a fixed sample window with O(1) updates. */
export declare class RollingEfficiencyRatio {
    readonly windowLength: number;
    private readonly values;
    private volatility;
    private invalid;
    constructor(windowLength: number);
    get isFormed(): boolean;
    get value(): number | null;
    push(value: NumericValue): number | null;
    preview(value: NumericValue): number | null;
    reset(): void;
    checkpoint(): RollingEfficiencyRatioCheckpoint;
    restore(checkpoint: RollingEfficiencyRatioCheckpoint): void;
}
export {};

// Public API module: indicators/math/index.d.ts
export * from './ring-buffer.js';
export * from './rolling-window.js';
export * from './moving-averages.js';
export * from './true-range.js';
export * from './efficiency-ratio.js';
export * from './relative-strength.js';
export * from './linear-regression.js';
export * from './lunar-phase.js';

// Public API module: indicators/math/linear-regression.d.ts
import { type RingBufferCheckpoint } from './ring-buffer.js';
type NumericValue = number | null | undefined;
export type RollingLinearRegressionCheckpoint = RingBufferCheckpoint<number | null>;
/** Least-squares endpoint, forecast, slope and standard error, updated in O(1). */
export declare class RollingLinearRegression {
    readonly windowLength: number;
    private readonly values;
    private readonly sumX;
    private readonly divisor;
    private invalid;
    private reference;
    private centeredSum;
    private centeredSum2;
    private centeredSumXy;
    private validSumX;
    constructor(windowLength: number);
    get isFormed(): boolean;
    get value(): number | null;
    get nextValue(): number | null;
    get slopeValue(): number | null;
    get standardErrorValue(): number | null;
    get rSquaredValue(): number | null;
    push(value: NumericValue): number | null;
    preview(value: NumericValue): number | null;
    previewNext(value: NumericValue): number | null;
    previewSlope(value: NumericValue): number | null;
    previewStandardError(value: NumericValue): number | null;
    previewRSquared(value: NumericValue): number | null;
    reset(): void;
    checkpoint(): RollingLinearRegressionCheckpoint;
    restore(checkpoint: RollingLinearRegressionCheckpoint): void;
    private project;
    private endpoint;
    private next;
    private slope;
    private standardError;
    private rSquared;
}
export {};

// Public API module: indicators/math/lunar-phase.d.ts
/**
 * Mirrors Ecng.Common.TimeHelper.GetLunarPhase and returns its phase index 0..7.
 */
export declare function lunarPhaseFromMilliseconds(timestamp: number): number | null;

// Public API module: indicators/math/moving-averages.d.ts
import { type RingBufferCheckpoint } from './ring-buffer.js';
import { type RollingWindowCheckpoint } from './rolling-window.js';
type NumericValue = number | null | undefined;
export declare class SimpleMovingAverage {
    readonly windowLength: number;
    private readonly sum;
    constructor(windowLength: number);
    get isFormed(): boolean;
    get value(): number | null;
    push(value: NumericValue): number | null;
    preview(value: NumericValue): number | null;
    reset(): void;
    checkpoint(): RollingWindowCheckpoint;
    restore(checkpoint: RollingWindowCheckpoint): void;
}
/**
 * StockSharp SMA value semantics: finite samples fill a bounded window, while
 * the partial sum is divided by the full configured length from the first sample.
 * Invalid samples emit null and do not advance the window.
 */
export declare class PartialSeedSimpleMovingAverage {
    readonly windowLength: number;
    private readonly buffer;
    private sum;
    constructor(windowLength: number);
    get isFormed(): boolean;
    get value(): number | null;
    push(value: NumericValue): number | null;
    preview(value: NumericValue): number | null;
    reset(): void;
    checkpoint(): RingBufferCheckpoint<number>;
    restore(checkpoint: RingBufferCheckpoint<number>): void;
}
export interface PartialSeedExponentialMovingAverageCheckpoint {
    readonly count: number;
    readonly seedSum: number;
    readonly formed: boolean;
    readonly previous: number;
}
/** StockSharp EMA values, including partial `seedSum / length` warm-up output. */
export declare class PartialSeedExponentialMovingAverage {
    readonly windowLength: number;
    private count;
    private seedSum;
    private formed;
    private previous;
    private readonly multiplier;
    constructor(windowLength: number);
    get isFormed(): boolean;
    get value(): number | null;
    push(value: NumericValue): number | null;
    preview(value: NumericValue): number | null;
    reset(): void;
    checkpoint(): PartialSeedExponentialMovingAverageCheckpoint;
    restore(state: PartialSeedExponentialMovingAverageCheckpoint): void;
    private evaluate;
}
/** Linear WMA with weights 1..length from oldest to newest in O(1). */
export declare class LinearWeightedMovingAverage {
    readonly windowLength: number;
    private readonly buffer;
    private sum;
    private weightedSum;
    private invalid;
    private readonly divisor;
    constructor(windowLength: number);
    get isFormed(): boolean;
    get value(): number | null;
    push(value: NumericValue): number | null;
    preview(value: NumericValue): number | null;
    reset(): void;
    checkpoint(): RollingWindowCheckpoint;
    restore(checkpoint: RollingWindowCheckpoint): void;
}
/** Fixed newest-to-oldest weights over a bounded window with isolated previews. */
export declare class FixedWeightedMovingAverage {
    private readonly buffer;
    readonly weights: readonly number[];
    private readonly divisor;
    constructor(weights: readonly number[]);
    get windowLength(): number;
    get isFormed(): boolean;
    get value(): number | null;
    push(value: NumericValue): number | null;
    preview(value: NumericValue): number | null;
    reset(): void;
    checkpoint(): RollingWindowCheckpoint;
    restore(checkpoint: RollingWindowCheckpoint): void;
}
export interface SmoothedMovingAverageCheckpoint {
    readonly count: number;
    readonly seedSum: number;
    readonly previous: number;
}
/**
 * StockSharp SMMA: partial seed sum divided by the full length, followed by
 * Wilder recursion. Invalid samples return null without advancing state.
 */
export declare class SmoothedMovingAverage {
    readonly windowLength: number;
    private count;
    private seedSum;
    private previous;
    constructor(windowLength: number);
    get isFormed(): boolean;
    get value(): number | null;
    push(value: NumericValue): number | null;
    preview(value: NumericValue): number | null;
    reset(): void;
    checkpoint(): SmoothedMovingAverageCheckpoint;
    restore(checkpoint: SmoothedMovingAverageCheckpoint): void;
    private evaluate;
}
export interface ExpandingWilderMovingAverageCheckpoint {
    readonly count: number;
    readonly previous: number;
}
/** Wilder average with a growing warm-up divisor capped at the configured length. */
export declare class ExpandingWilderMovingAverage {
    readonly windowLength: number;
    private count;
    private previous;
    constructor(windowLength: number);
    get isFormed(): boolean;
    get value(): number | null;
    push(value: NumericValue): number | null;
    preview(value: NumericValue): number | null;
    reset(): void;
    checkpoint(): ExpandingWilderMovingAverageCheckpoint;
    restore(checkpoint: ExpandingWilderMovingAverageCheckpoint): void;
    private evaluate;
}
export interface SeededMovingAverageCheckpoint {
    readonly count: number;
    readonly seedSum: number;
    readonly seedValid: boolean;
    readonly formed: boolean;
    readonly previous: number;
    readonly poisoned: boolean;
}
declare abstract class SeededMovingAverage {
    readonly windowLength: number;
    private readonly poisonAfterGap;
    private count;
    private seedSum;
    private seedValid;
    private formed;
    private previous;
    private poisoned;
    constructor(windowLength: number, poisonAfterGap: boolean);
    get isFormed(): boolean;
    get value(): number | null;
    push(value: NumericValue): number | null;
    preview(value: NumericValue): number | null;
    reset(): void;
    checkpoint(): SeededMovingAverageCheckpoint;
    restore(checkpoint: SeededMovingAverageCheckpoint): void;
    protected abstract next(previous: number, value: number): number;
    private evaluate;
}
export declare class ExponentialMovingAverage extends SeededMovingAverage {
    private readonly multiplier;
    constructor(windowLength: number);
    protected next(previous: number, value: number): number;
}
export declare class WilderMovingAverage extends SeededMovingAverage {
    constructor(windowLength: number);
    protected next(previous: number, value: number): number;
}
export {};

// Public API module: indicators/math/relative-strength.d.ts
import { type SmoothedMovingAverageCheckpoint } from './moving-averages.js';
export interface PartialRelativeStrengthIndexCheckpoint {
    readonly initialized: boolean;
    readonly previous: number | null;
    readonly gain: SmoothedMovingAverageCheckpoint;
    readonly loss: SmoothedMovingAverageCheckpoint;
}
/**
 * StockSharp RSI value stream, including partial SMMA values during warm-up.
 * The first finite input seeds the prior value and emits null; later finite
 * deltas emit RSI immediately, while `isFormed` tracks the full SMMA length.
 */
export declare class PartialRelativeStrengthIndex {
    readonly length: number;
    private initialized;
    private previous;
    private readonly gain;
    private readonly loss;
    constructor(length: number);
    get isFormed(): boolean;
    push(value: number | null | undefined): number | null;
    preview(value: number | null | undefined): number | null;
    reset(): void;
    checkpoint(): PartialRelativeStrengthIndexCheckpoint;
    restore(state: PartialRelativeStrengthIndexCheckpoint): void;
    private evaluate;
}

// Public API module: indicators/math/ring-buffer.d.ts
export interface RingBufferCheckpoint<T> {
    readonly values: readonly T[];
}
/** Fixed-capacity FIFO with O(1) append/eviction and stable logical indexing. */
export declare class RingBuffer<T> {
    readonly capacity: number;
    private values;
    private head;
    private sizeValue;
    constructor(capacity: number);
    get size(): number;
    get full(): boolean;
    at(index: number): T | undefined;
    front(): T | undefined;
    back(): T | undefined;
    push(value: T): void;
    clear(): void;
    toArray(): T[];
    checkpoint(): RingBufferCheckpoint<T>;
    restore(checkpoint: RingBufferCheckpoint<T>): void;
}

// Public API module: indicators/math/rolling-window.d.ts
import { type RingBufferCheckpoint } from './ring-buffer.js';
type NumericValue = number | null | undefined;
export type RollingWindowCheckpoint = RingBufferCheckpoint<number | null>;
/** Finite-only rolling sum; output is null until the complete window is valid. */
export declare class RollingSum {
    readonly windowLength: number;
    private readonly buffer;
    private sum;
    private invalid;
    constructor(windowLength: number);
    get isFormed(): boolean;
    get value(): number | null;
    push(value: NumericValue): number | null;
    preview(value: NumericValue): number | null;
    reset(): void;
    checkpoint(): RollingWindowCheckpoint;
    restore(checkpoint: RollingWindowCheckpoint): void;
    private add;
    private remove;
}
export declare class RollingMinimum {
    readonly windowLength: number;
    private readonly extrema;
    constructor(windowLength: number);
    get isFormed(): boolean;
    get value(): number | null;
    get partialValue(): number | null;
    push(value: NumericValue): number | null;
    preview(value: NumericValue): number | null;
    previewPartial(value: NumericValue): number | null;
    reset(): void;
    checkpoint(): RollingWindowCheckpoint;
    restore(checkpoint: RollingWindowCheckpoint): void;
}
export declare class RollingMaximum {
    readonly windowLength: number;
    private readonly extrema;
    constructor(windowLength: number);
    get isFormed(): boolean;
    get value(): number | null;
    get partialValue(): number | null;
    push(value: NumericValue): number | null;
    preview(value: NumericValue): number | null;
    previewPartial(value: NumericValue): number | null;
    reset(): void;
    checkpoint(): RollingWindowCheckpoint;
    restore(checkpoint: RollingWindowCheckpoint): void;
}
export declare class RollingVariance {
    readonly windowLength: number;
    readonly sample: boolean;
    private readonly buffer;
    private readonly state;
    constructor(windowLength: number, sample?: boolean);
    get isFormed(): boolean;
    get value(): number | null;
    push(value: NumericValue): number | null;
    preview(value: NumericValue): number | null;
    reset(): void;
    checkpoint(): RollingWindowCheckpoint;
    restore(checkpoint: RollingWindowCheckpoint): void;
}
export declare class RollingStandardDeviation {
    readonly windowLength: number;
    readonly sample: boolean;
    private readonly variance;
    constructor(windowLength: number, sample?: boolean);
    get isFormed(): boolean;
    get value(): number | null;
    push(value: NumericValue): number | null;
    preview(value: NumericValue): number | null;
    reset(): void;
    checkpoint(): RollingWindowCheckpoint;
    restore(checkpoint: RollingWindowCheckpoint): void;
}
/** Mean absolute deviation from the mean of a complete finite rolling window. */
export declare class RollingMeanDeviation {
    readonly windowLength: number;
    private readonly buffer;
    private sum;
    private invalid;
    constructor(windowLength: number);
    get isFormed(): boolean;
    get value(): number | null;
    push(value: NumericValue): number | null;
    preview(value: NumericValue): number | null;
    reset(): void;
    checkpoint(): RollingWindowCheckpoint;
    restore(checkpoint: RollingWindowCheckpoint): void;
    private deviation;
    private add;
    private remove;
}
/** Median of a complete finite rolling window, backed by FIFO and sorted views. */
export declare class RollingMedian {
    readonly windowLength: number;
    private readonly buffer;
    private sorted;
    constructor(windowLength: number);
    get isFormed(): boolean;
    get value(): number | null;
    push(value: NumericValue): number | null;
    preview(value: NumericValue): number | null;
    reset(): void;
    checkpoint(): RollingWindowCheckpoint;
    restore(checkpoint: RollingWindowCheckpoint): void;
    private lowerBound;
    private insert;
    private remove;
    private median;
}
export {};

// Public API module: indicators/math/true-range.d.ts
import type { IndicatorCandle } from '../indicator-definition.js';
import { type ExpandingWilderMovingAverageCheckpoint, type SeededMovingAverageCheckpoint } from './moving-averages.js';
export interface TrueRangeCheckpoint {
    readonly hasPrevious: boolean;
    readonly previousClose: number | null;
}
export declare class TrueRange {
    private hasPrevious;
    private previousClose;
    push(candle: Readonly<IndicatorCandle>): number | null;
    preview(candle: Readonly<IndicatorCandle>): number | null;
    reset(): void;
    checkpoint(): TrueRangeCheckpoint;
    restore(checkpoint: TrueRangeCheckpoint): void;
    private calculate;
}
export interface AverageTrueRangeCheckpoint {
    readonly trueRange: TrueRangeCheckpoint;
    readonly average: SeededMovingAverageCheckpoint;
}
export declare class AverageTrueRange {
    readonly windowLength: number;
    private readonly trueRange;
    private readonly average;
    constructor(windowLength: number);
    get isFormed(): boolean;
    get value(): number | null;
    push(candle: Readonly<IndicatorCandle>): number | null;
    preview(candle: Readonly<IndicatorCandle>): number | null;
    reset(): void;
    checkpoint(): AverageTrueRangeCheckpoint;
    restore(checkpoint: AverageTrueRangeCheckpoint): void;
}
export interface ExpandingAverageTrueRangeCheckpoint {
    readonly previousClose: number | null;
    readonly average: ExpandingWilderMovingAverageCheckpoint;
}
/**
 * StockSharp-style ATR with a growing warm-up divisor. Invalid high/low samples
 * neither advance the average nor replace the previous valid candle close.
 */
export declare class ExpandingAverageTrueRange {
    readonly windowLength: number;
    private previousClose;
    private readonly average;
    constructor(windowLength: number);
    get isFormed(): boolean;
    get value(): number | null;
    push(candle: Readonly<IndicatorCandle>): number | null;
    preview(candle: Readonly<IndicatorCandle>): number | null;
    reset(): void;
    checkpoint(): ExpandingAverageTrueRangeCheckpoint;
    restore(checkpoint: ExpandingAverageTrueRangeCheckpoint): void;
    private trueRange;
}

// Public API module: indicators/sequential-processor.d.ts
import type { IIndicatorProcessor, IndicatorOutputMetadata, IndicatorOutputValue, IndicatorProcessInput, IndicatorProcessResult } from './indicator-definition.js';
export interface IndicatorCalculationResult {
    readonly isFormed: boolean;
    readonly values: readonly IndicatorOutputValue[];
}
export interface SequentialIndicatorCheckpoint<TState> {
    readonly version: 1;
    readonly position: number;
    readonly state: TState;
}
/**
 * Base for processors that consume one logical input at a time. Derived classes
 * receive an explicit commit flag and must use non-mutating kernel previews when
 * it is false.
 */
export declare abstract class SequentialIndicatorProcessor<TInput, TState> implements IIndicatorProcessor<TInput> {
    private positionValue;
    private readonly outputIds;
    protected constructor(outputIds: readonly string[]);
    get position(): number;
    process(input: IndicatorProcessInput<TInput>): IndicatorProcessResult;
    reset(): void;
    checkpoint(): SequentialIndicatorCheckpoint<TState>;
    restore(checkpoint: SequentialIndicatorCheckpoint<TState>): void;
    protected output(outputIdValue: string, value: number | null, targetIndex?: number, metadata?: IndicatorOutputMetadata): IndicatorOutputValue;
    protected abstract calculate(input: IndicatorProcessInput<TInput>, commit: boolean): IndicatorCalculationResult;
    protected abstract resetState(): void;
    protected abstract captureState(): TState;
    protected abstract restoreState(state: TState): void;
    private validateInput;
    private normalizeResult;
}

// Public API module: orderflow/aggregation.d.ts
import type { Time } from '../core/chart-api.js';
import { type FootprintBar, type FootprintNormalizationOptions, type OrderFlowTrade } from './model.js';
export interface FootprintAggregationOptions extends FootprintNormalizationOptions {
    /** Fixed bar duration in seconds. */
    readonly barDuration: number;
    /** Origin used to align bar boundaries. Defaults to the UNIX epoch. */
    readonly timeOrigin?: Time;
}
export type FootprintAggregationUpdateKind = 'append' | 'update';
/** One tail-only change produced from a chronologically appended trade. */
export interface FootprintAggregationPatch {
    readonly kind: FootprintAggregationUpdateKind;
    readonly fromIndex: number;
    readonly removed: 0 | 1;
    readonly data: readonly FootprintBar[];
}
/**
 * Stateful trade-to-footprint aggregation. New trades touch only the current
 * level and replace only the current immutable bar, or append one new bar.
 */
export declare class FootprintAggregator {
    private readonly config;
    private readonly normalization;
    private readonly dataValue;
    private readonly ids;
    private tail;
    private previousTime;
    private previousSequence;
    constructor(options: FootprintAggregationOptions);
    get size(): number;
    get latest(): FootprintBar | null;
    /** Returns a stable immutable point-in-time copy. It is never mutated by later pushes. */
    snapshot(): readonly FootprintBar[];
    /** Atomically replaces all state from an ordered trade snapshot. */
    reset(values: readonly OrderFlowTrade[]): readonly FootprintBar[];
    /** Appends one chronological trade and emits a one-bar tail patch. */
    push(value: OrderFlowTrade): FootprintAggregationPatch;
    clear(): void;
    private validateNext;
    private remember;
    private ingest;
}
export declare function aggregateFootprintBars(trades: readonly OrderFlowTrade[], options: FootprintAggregationOptions): readonly FootprintBar[];

// Public API module: orderflow/footprint-series.d.ts
import type { SeriesOptions } from '../core/chart-api.js';
import type { CustomSeriesDefinition } from '../series/registry.js';
import { type FootprintBar } from './model.js';
import { type FootprintMetricsOptions } from './metrics.js';
export declare const FootprintDisplayMode: Readonly<{
    readonly BidAsk: 'bid-ask';
    readonly Delta: 'delta';
    readonly Total: 'total';
    readonly Ladder: 'ladder';
}>;
export type FootprintDisplayMode = typeof FootprintDisplayMode[keyof typeof FootprintDisplayMode];
export declare const FootprintDetailLevel: Readonly<{
    readonly Auto: 'auto';
    readonly Numbers: 'numbers';
    readonly Heatmap: 'heatmap';
    readonly Summary: 'summary';
}>;
export type FootprintDetailLevel = typeof FootprintDetailLevel[keyof typeof FootprintDetailLevel];
export type ResolvedFootprintDetailLevel = Exclude<FootprintDetailLevel, typeof FootprintDetailLevel.Auto>;
export interface FootprintDetailGeometry {
    readonly barSpacing: number;
    readonly cellHeight: number;
}
export interface FootprintSeriesOptions extends SeriesOptions, FootprintMetricsOptions {
    readonly mode: FootprintDisplayMode;
    readonly detailLevel: FootprintDetailLevel;
    readonly bidColor: string;
    readonly askColor: string;
    readonly positiveDeltaColor: string;
    readonly negativeDeltaColor: string;
    readonly totalColor: string;
    readonly pocColor: string;
    readonly valueAreaColor: string;
    readonly imbalanceColor: string;
    readonly unfinishedAuctionColor: string;
    readonly cellOpacity: number;
    readonly fontSize: number;
    readonly minimumNumbersBarSpacing: number;
    readonly minimumNumbersCellHeight: number;
    readonly minimumHeatmapBarSpacing: number;
    readonly minimumHeatmapCellHeight: number;
    readonly showPoc: boolean;
    readonly showValueArea: boolean;
    readonly showImbalances: boolean;
    readonly showUnfinishedAuctions: boolean;
}
export declare const defaultFootprintSeriesOptions: Readonly<FootprintSeriesOptions>;
export declare function resolveFootprintDetailLevel(geometry: FootprintDetailGeometry, options?: Readonly<FootprintSeriesOptions>): ResolvedFootprintDetailLevel;
export declare const FootprintSeries: CustomSeriesDefinition<FootprintBar, FootprintSeriesOptions>;

// Public API module: orderflow/index.d.ts
export * from './model.js';
export * from './aggregation.js';
export * from './metrics.js';
export * from './footprint-series.js';
export * from './volume-profile.js';
export * from './volume-profile-series.js';
export * from './tpo-series.js';

// Public API module: orderflow/metrics.d.ts
import { type FootprintBar, type FootprintNormalizationOptions } from './model.js';
export declare const FootprintPocTieBreak: Readonly<{
    readonly ClosestToClose: 'closest-to-close';
    readonly LowerPrice: 'lower-price';
    readonly HigherPrice: 'higher-price';
}>;
export type FootprintPocTieBreak = typeof FootprintPocTieBreak[keyof typeof FootprintPocTieBreak];
export declare const FootprintAuctionCompletion: Readonly<{
    readonly Finished: 'finished';
    readonly Unfinished: 'unfinished';
    readonly Unavailable: 'unavailable';
}>;
export type FootprintAuctionCompletion = typeof FootprintAuctionCompletion[keyof typeof FootprintAuctionCompletion];
export type FootprintImbalanceSide = 'buy' | 'sell';
export interface FootprintMetricsOptions extends FootprintNormalizationOptions {
    /** Fraction of total volume included in value area. Defaults to 0.7. */
    readonly valueAreaPercentage?: number;
    /** Required dominant/opposing diagonal ratio. Defaults to 3. */
    readonly imbalanceRatio?: number;
    /** Required dominant-side volume. Defaults to zero. */
    readonly imbalanceMinimumVolume?: number;
    /** Consecutive same-side imbalances required for a stack. Defaults to 3. */
    readonly stackedImbalanceCount?: number;
    /** Deterministic policy for equal-volume POC candidates. */
    readonly pocTieBreak?: FootprintPocTieBreak;
}
export interface FootprintLevelMetrics {
    readonly price: number;
    readonly bidVolume: number;
    readonly askVolume: number;
    readonly totalVolume: number;
    readonly delta: number;
    readonly tradeCount?: number;
    readonly buyImbalance: boolean;
    readonly sellImbalance: boolean;
}
export interface FootprintValueArea {
    readonly low: number;
    readonly high: number;
    readonly volume: number;
    readonly targetVolume: number;
    readonly percentage: number;
}
export interface FootprintImbalance {
    readonly side: FootprintImbalanceSide;
    readonly price: number;
    readonly volume: number;
    readonly comparedPrice: number;
    readonly comparedVolume: number;
    /** Infinity when the valid opposing cell is zero. */
    readonly ratio: number;
}
export interface FootprintStackedImbalance {
    readonly side: FootprintImbalanceSide;
    readonly low: number;
    readonly high: number;
    readonly levelCount: number;
}
export interface FootprintAuctionMetrics {
    readonly low: FootprintAuctionCompletion;
    readonly high: FootprintAuctionCompletion;
}
export interface FootprintBarMetrics {
    readonly time: number;
    readonly totalBidVolume: number;
    readonly totalAskVolume: number;
    readonly totalVolume: number;
    readonly delta: number;
    /** Sum only when every level supplied tradeCount; otherwise null. */
    readonly tradeCount: number | null;
    readonly pocPrice: number;
    readonly pocVolume: number;
    readonly valueArea: FootprintValueArea;
    readonly imbalances: readonly FootprintImbalance[];
    readonly stackedImbalances: readonly FootprintStackedImbalance[];
    readonly auction: FootprintAuctionMetrics;
    readonly levels: readonly FootprintLevelMetrics[];
}
/**
 * Computes exact per-bar order-flow metrics. The result depends only on the bar
 * and calculation options; viewport and renderer state never enter this path.
 *
 * Buy imbalance compares ask(P) with bid(P - tick). Sell imbalance compares
 * bid(P) with ask(P + tick). A comparison outside the bar range is unavailable.
 */
export declare function calculateFootprintMetrics(value: FootprintBar, options: FootprintMetricsOptions): FootprintBarMetrics;

// Public API module: orderflow/model.d.ts
import type { CandlestickData, Time } from '../core/chart-api.js';
export declare const OrderFlowDataMode: Readonly<{
    readonly Exact: 'exact';
    readonly Approximate: 'approximate';
}>;
export type OrderFlowDataMode = typeof OrderFlowDataMode[keyof typeof OrderFlowDataMode];
export declare const TradeAggressorSide: Readonly<{
    /** Aggressive buyer: the trade executed against resting liquidity at the ask. */
    readonly Buy: 'buy';
    /** Aggressive seller: the trade executed against resting liquidity at the bid. */
    readonly Sell: 'sell';
}>;
export type TradeAggressorSide = typeof TradeAggressorSide[keyof typeof TradeAggressorSide];
export declare const FootprintApproximation: Readonly<{
    /** Candle volume distributed over its low/high range. Never treated as exact order flow. */
    readonly UniformCandleRange: 'uniform-candle-range';
    /** Venue/vendor supplied estimates without aggressor-side executions. */
    readonly VendorEstimated: 'vendor-estimated';
    /** Real trades whose aggressor side could not be classified. */
    readonly UnclassifiedTrades: 'unclassified-trades';
}>;
export type FootprintApproximation = typeof FootprintApproximation[keyof typeof FootprintApproximation];
/** One classified market execution used to construct exact footprint data. */
export interface OrderFlowTrade {
    readonly time: Time;
    readonly price: number;
    readonly volume: number;
    readonly aggressorSide: TradeAggressorSide;
    readonly id?: string;
    /** Optional venue ordering key for trades sharing one timestamp. */
    readonly sequence?: number;
}
export interface FootprintLevel {
    /** Tick-aligned execution price. */
    readonly price: number;
    /** Volume of aggressive sells executed against resting bids. */
    readonly bidVolume: number;
    /** Volume of aggressive buys executed against resting asks. */
    readonly askVolume: number;
    readonly tradeCount?: number;
}
/** Exact aggressor-classified volume-at-price for one OHLC bar. */
export interface FootprintBar extends CandlestickData {
    readonly dataMode: typeof OrderFlowDataMode.Exact;
    /** Strictly ascending, unique and tick-aligned levels. */
    readonly levels: readonly FootprintLevel[];
}
export type ExactFootprintBar = FootprintBar;
export interface ApproximateFootprintLevel {
    readonly price: number;
    readonly totalVolume: number;
    readonly tradeCount?: number;
}
/**
 * Explicitly non-exact volume-at-price. It cannot be passed to APIs requiring FootprintBar,
 * because total volume has no fabricated bid/ask split.
 */
export interface ApproximateFootprintBar extends CandlestickData {
    readonly dataMode: typeof OrderFlowDataMode.Approximate;
    readonly approximation: FootprintApproximation;
    readonly levels: readonly ApproximateFootprintLevel[];
}
export type OrderFlowBar = FootprintBar | ApproximateFootprintBar;
export interface FootprintNormalizationOptions {
    readonly tickSize: number;
    /** Tick-grid origin. Defaults to zero. */
    readonly priceOrigin?: number;
}
/** Validates and snapshots an OHLC point on the same price grid as order-flow data. */
export declare function normalizeTickAlignedCandle(value: CandlestickData, options: FootprintNormalizationOptions): CandlestickData;
export declare function normalizeOrderFlowTrade(value: OrderFlowTrade, options: FootprintNormalizationOptions): OrderFlowTrade;
export declare function normalizeOrderFlowTrades(values: readonly OrderFlowTrade[], options: FootprintNormalizationOptions): readonly OrderFlowTrade[];
export declare function normalizeFootprintLevel(value: FootprintLevel, options: FootprintNormalizationOptions): FootprintLevel;
export declare function normalizeFootprintBar(value: FootprintBar, options: FootprintNormalizationOptions): FootprintBar;
export declare function normalizeFootprintBars(values: readonly FootprintBar[], options: FootprintNormalizationOptions): readonly FootprintBar[];
export declare function normalizeApproximateFootprintBar(value: ApproximateFootprintBar, options: FootprintNormalizationOptions): ApproximateFootprintBar;
export declare function normalizeApproximateFootprintBars(values: readonly ApproximateFootprintBar[], options: FootprintNormalizationOptions): readonly ApproximateFootprintBar[];
export declare function isExactFootprintBar(value: OrderFlowBar): value is FootprintBar;
export declare function isApproximateFootprintBar(value: OrderFlowBar): value is ApproximateFootprintBar;
export declare function footprintLevelVolume(level: FootprintLevel): number;
export declare function footprintBarVolume(bar: FootprintBar): number;

// Public API module: orderflow/tpo-series.d.ts
import type { CandlestickData, SeriesOptions } from '../core/chart-api.js';
import type { CustomSeriesDefinition } from '../series/registry.js';
import { type FootprintNormalizationOptions } from './model.js';
export interface TpoBar extends CandlestickData {
    /** Stable, serializable trading-session identity. */
    readonly sessionId: string;
}
export interface TpoCalculationOptions extends FootprintNormalizationOptions {
    readonly valueAreaPercentage?: number;
    readonly initialBalancePeriods?: number;
    readonly symbolSequence?: string;
    /** Safety bound for one candle's inclusive low/high tick span. */
    readonly maxLevelsPerBar?: number;
}
export interface TpoLevel {
    readonly price: number;
    readonly count: number;
    readonly periodIndexes: readonly number[];
    readonly symbols: readonly string[];
    readonly singlePrint: boolean;
}
export interface TpoValueArea {
    readonly low: number;
    readonly high: number;
    readonly count: number;
    readonly targetCount: number;
    readonly percentage: number;
}
export interface TpoSessionProfile {
    readonly sessionId: string;
    readonly from: number;
    readonly to: number;
    readonly periodCount: number;
    readonly totalTpos: number;
    readonly levels: readonly TpoLevel[];
    readonly pocPrice: number;
    readonly pocCount: number;
    readonly valueArea: TpoValueArea;
    readonly initialBalanceLow: number;
    readonly initialBalanceHigh: number;
}
export declare function normalizeTpoBar(value: TpoBar, options: FootprintNormalizationOptions): TpoBar;
export declare function normalizeTpoBars(values: readonly TpoBar[], options: FootprintNormalizationOptions): readonly TpoBar[];
export declare function tpoSymbolForPeriod(periodIndex: number, symbolSequence?: string): string;
export declare function calculateTpoProfiles(values: readonly TpoBar[], options: TpoCalculationOptions): readonly TpoSessionProfile[];
export declare const TpoDisplayMode: Readonly<{
    readonly Auto: 'auto';
    readonly Letters: 'letters';
    readonly Blocks: 'blocks';
}>;
export type TpoDisplayMode = typeof TpoDisplayMode[keyof typeof TpoDisplayMode];
export interface TpoSeriesOptions extends SeriesOptions, TpoCalculationOptions {
    readonly displayMode: TpoDisplayMode;
    readonly letterColor: string;
    readonly blockColor: string;
    readonly singlePrintColor: string;
    readonly pocColor: string;
    readonly valueAreaColor: string;
    readonly initialBalanceColor: string;
    readonly cellOpacity: number;
    readonly fontSize: number;
    readonly showPoc: boolean;
    readonly showValueArea: boolean;
    readonly showInitialBalance: boolean;
    readonly showSinglePrints: boolean;
}
export declare const defaultTpoSeriesOptions: Readonly<TpoSeriesOptions>;
export declare const TpoSeries: CustomSeriesDefinition<TpoBar, TpoSeriesOptions>;

// Public API module: orderflow/volume-profile-series.d.ts
import type { SeriesOptions, TimeRange } from '../core/chart-api.js';
import type { CustomSeriesDefinition } from '../series/registry.js';
import { type FootprintBar } from './model.js';
import { type VolumeProfileCalculationOptions } from './volume-profile.js';
export declare const VolumeProfileRangeMode: Readonly<{
    readonly Visible: 'visible';
    readonly Fixed: 'fixed';
    readonly Session: 'session';
}>;
export type VolumeProfileRangeMode = typeof VolumeProfileRangeMode[keyof typeof VolumeProfileRangeMode];
export declare const VolumeProfileDisplayMode: Readonly<{
    readonly Total: 'total';
    readonly BidAsk: 'bid-ask';
    readonly Delta: 'delta';
}>;
export type VolumeProfileDisplayMode = typeof VolumeProfileDisplayMode[keyof typeof VolumeProfileDisplayMode];
export declare const VolumeProfileAlignment: Readonly<{
    readonly Left: 'left';
    readonly Right: 'right';
}>;
export type VolumeProfileAlignment = typeof VolumeProfileAlignment[keyof typeof VolumeProfileAlignment];
/** Serializable half-open session boundary [from, to). */
export interface VolumeProfileSessionRange {
    readonly id: string;
    readonly from: number;
    readonly to: number;
}
export interface ExactVolumeProfileRangeOptions {
    readonly rangeMode: VolumeProfileRangeMode;
    readonly fixedRange?: TimeRange;
    readonly sessionRanges: readonly VolumeProfileSessionRange[];
    /** Defaults to the viewport end. */
    readonly sessionAnchorTime?: number;
}
export interface ExactVolumeProfileSeriesOptions extends SeriesOptions, VolumeProfileCalculationOptions, ExactVolumeProfileRangeOptions {
    readonly displayMode: VolumeProfileDisplayMode;
    readonly alignment: VolumeProfileAlignment;
    readonly profileWidth: number;
    readonly cellOpacity: number;
    readonly totalColor: string;
    readonly bidColor: string;
    readonly askColor: string;
    readonly positiveDeltaColor: string;
    readonly negativeDeltaColor: string;
    readonly pocColor: string;
    readonly valueAreaColor: string;
    readonly developingValueAreaColor: string;
    readonly showPoc: boolean;
    readonly showValueArea: boolean;
    readonly showLabels: boolean;
    readonly showDevelopingLevels: boolean;
    readonly fontSize: number;
}
export declare const defaultExactVolumeProfileSeriesOptions: Readonly<ExactVolumeProfileSeriesOptions>;
/** Selects the exact source bars for visible, fixed, or serializable session ranges. */
export declare function selectExactVolumeProfileBars(bars: readonly FootprintBar[], visibleRange: TimeRange, options: Readonly<ExactVolumeProfileRangeOptions>): readonly FootprintBar[];
export declare const ExactVolumeProfileSeries: CustomSeriesDefinition<FootprintBar, ExactVolumeProfileSeriesOptions>;

// Public API module: orderflow/volume-profile.d.ts
import { FootprintApproximation, OrderFlowDataMode, type FootprintBar, type FootprintNormalizationOptions, type OrderFlowBar } from './model.js';
import { FootprintPocTieBreak, type FootprintValueArea } from './metrics.js';
export declare const VolumeProfileStatus: Readonly<{
    readonly Ready: 'ready';
    readonly Empty: 'empty';
    readonly Approximate: 'approximate';
    readonly Mixed: 'mixed';
}>;
export type VolumeProfileStatus = typeof VolumeProfileStatus[keyof typeof VolumeProfileStatus];
export interface VolumeProfileCalculationOptions extends FootprintNormalizationOptions {
    readonly valueAreaPercentage?: number;
    readonly pocTieBreak?: FootprintPocTieBreak;
}
export interface ExactVolumeProfileLevel {
    readonly price: number;
    readonly bidVolume: number;
    readonly askVolume: number;
    readonly totalVolume: number;
    readonly delta: number;
    readonly tradeCount?: number;
}
interface ExactVolumeProfileBase {
    readonly dataMode: typeof OrderFlowDataMode.Exact;
    readonly barCount: number;
    readonly levels: readonly ExactVolumeProfileLevel[];
    readonly totalBidVolume: number;
    readonly totalAskVolume: number;
    readonly totalVolume: number;
    readonly delta: number;
    readonly tradeCount: number | null;
}
export interface ReadyExactVolumeProfile extends ExactVolumeProfileBase {
    readonly status: typeof VolumeProfileStatus.Ready;
    readonly from: number;
    readonly to: number;
    readonly pocPrice: number;
    readonly pocVolume: number;
    readonly valueArea: FootprintValueArea;
}
export interface EmptyExactVolumeProfile extends ExactVolumeProfileBase {
    readonly status: typeof VolumeProfileStatus.Empty;
    readonly from: null;
    readonly to: null;
    readonly pocPrice: null;
    readonly pocVolume: 0;
    readonly valueArea: null;
}
export type ExactVolumeProfile = ReadyExactVolumeProfile | EmptyExactVolumeProfile;
export interface UnavailableVolumeProfile {
    readonly status: typeof VolumeProfileStatus.Approximate | typeof VolumeProfileStatus.Mixed;
    readonly inputMode: typeof OrderFlowDataMode.Approximate | 'mixed';
    readonly profile: null;
    readonly approximations: readonly FootprintApproximation[];
    readonly message: string;
}
export type VolumeProfileResolution = ExactVolumeProfile | UnavailableVolumeProfile;
export type VolumeProfileAggregationUpdateKind = 'append' | 'update';
export interface VolumeProfileAggregationUpdate {
    readonly kind: VolumeProfileAggregationUpdateKind;
    readonly profile: ReadyExactVolumeProfile;
}
export interface DevelopingVolumeProfilePoint {
    readonly time: number;
    readonly totalBidVolume: number;
    readonly totalAskVolume: number;
    readonly totalVolume: number;
    readonly delta: number;
    readonly pocPrice: number;
    readonly pocVolume: number;
    readonly valueAreaLow: number;
    readonly valueAreaHigh: number;
}
/**
 * Incremental exact volume-at-price accumulator. Append and replace-last apply
 * level deltas only; they never rebuild prior bars or distribute candle volume.
 */
export declare class ExactVolumeProfileAccumulator {
    private readonly options;
    private levels;
    private firstTime;
    private lastBar;
    private count;
    constructor(options: VolumeProfileCalculationOptions);
    get barCount(): number;
    reset(values: readonly FootprintBar[]): ExactVolumeProfile;
    push(value: FootprintBar): VolumeProfileAggregationUpdate;
    snapshot(): ExactVolumeProfile;
}
export declare function calculateVolumeProfile(bars: readonly FootprintBar[], options: VolumeProfileCalculationOptions): ExactVolumeProfile;
/**
 * Resolves heterogeneous input without ever converting approximate total
 * volume into a fake exact bid/ask profile.
 */
export declare function resolveVolumeProfile(bars: readonly OrderFlowBar[], options: VolumeProfileCalculationOptions): VolumeProfileResolution;
export declare function calculateDevelopingVolumeProfile(bars: readonly FootprintBar[], options: VolumeProfileCalculationOptions): readonly DevelopingVolumeProfilePoint[];
export {};

// Public API module: persistence/chart-state-persistence.d.ts
import type { DrawingController, DrawingRestoreResult } from '../drawings/drawing-controller.js';
import { type ChartStateV1, type PersistedChartOptions, type PersistedIndicator, type PersistedPane, type PersistedSeries } from './chart-state.js';
export type MaybePromise<T> = T | Promise<T>;
export interface ChartStateLayoutSnapshot {
    readonly chartOptions: PersistedChartOptions;
    readonly panes: readonly PersistedPane[];
    readonly series: readonly PersistedSeries[];
}
export interface ChartStateLayoutAdapter {
    capture(): ChartStateLayoutSnapshot;
    restore(state: ChartStateLayoutSnapshot): MaybePromise<void>;
}
export interface ChartStateIndicatorAdapter {
    capture(): readonly PersistedIndicator[];
    /** Releases runtime series before the layout removes or recreates their panes. */
    clear(): MaybePromise<void>;
    restore(indicators: readonly PersistedIndicator[]): MaybePromise<void>;
}
/** Host-owned storage. Implementations may use files, a backend, IndexedDB, etc. */
export interface ChartStateStorage {
    load(key: string): MaybePromise<string | null>;
    save(key: string, value: string): MaybePromise<void>;
    remove(key: string): MaybePromise<void>;
}
export interface ChartStatePersistenceOptions<TContext = void> {
    readonly layout: ChartStateLayoutAdapter;
    readonly indicators: ChartStateIndicatorAdapter;
    readonly drawings: DrawingController;
    readonly storage: ChartStateStorage;
    /** Host selects layout-bound vs per-symbol (or any other) storage scope here. */
    readonly key: (context: TContext) => string;
    readonly pretty?: boolean;
}
export interface ChartStateRestoreResult {
    readonly state: ChartStateV1;
    readonly drawings: DrawingRestoreResult;
}
/** Coordinates validated snapshots without owning a storage technology or scope policy. */
export declare class ChartStatePersistence<TContext = void> {
    private readonly layout;
    private readonly indicators;
    private readonly drawings;
    private readonly storage;
    private readonly resolveKey;
    private readonly pretty;
    constructor(options: ChartStatePersistenceOptions<TContext>);
    snapshot(): ChartStateV1;
    restore(value: ChartStateV1): Promise<ChartStateRestoreResult>;
    save(context: TContext): Promise<ChartStateV1>;
    load(context: TContext): Promise<ChartStateRestoreResult | null>;
    remove(context: TContext): Promise<void>;
    private key;
}

// Public API module: persistence/chart-state.d.ts
import { type DrawingInstance } from '../drawings/drawing-model.js';
import { type PersistedObject } from './json-value.js';
import { type IndicatorSource } from '../indicators/indicator-source.js';
export declare const CHART_STATE_SCHEMA_VERSION: 1;
export type PersistedChartOptions = PersistedObject;
export type PersistedSeriesOptions = PersistedObject;
export type PersistedIndicatorParameters = PersistedObject;
export type PersistedIndicatorStyles = PersistedObject;
export type PersistedDrawing = DrawingInstance;
export interface PersistedPriceScale {
    readonly id: string;
    readonly mode?: number;
    readonly autoScale?: boolean;
    readonly scaleMargins?: Readonly<{
        top: number;
        bottom: number;
    }>;
}
export interface PersistedPane {
    readonly id: string;
    readonly order: number;
    readonly height: number;
    readonly minHeight: number;
    readonly state: 'normal' | 'minimized' | 'maximized';
    readonly priceScales: readonly PersistedPriceScale[];
}
export interface PersistedSeries {
    readonly id: string;
    readonly type: string;
    readonly paneId: string;
    readonly priceScaleId: string;
    readonly options: PersistedSeriesOptions;
}
export interface PersistedIndicator {
    readonly id: string;
    readonly type: string;
    readonly paneId: string | null;
    readonly params: PersistedIndicatorParameters;
    readonly styles: PersistedIndicatorStyles;
    readonly source?: IndicatorSource;
    readonly visible?: boolean;
    /** Omitted for automatic scale routing. */
    readonly priceScaleId?: string;
}
export interface ChartStateV1 {
    readonly schemaVersion: typeof CHART_STATE_SCHEMA_VERSION;
    readonly chartOptions: PersistedChartOptions;
    readonly panes: readonly PersistedPane[];
    readonly series: readonly PersistedSeries[];
    readonly indicators: readonly PersistedIndicator[];
    readonly drawings: readonly PersistedDrawing[];
}
export declare function normalizeChartStateV1(value: unknown): ChartStateV1;

// Public API module: persistence/index.d.ts
export * from './json-value.js';
export * from './chart-state.js';
export * from './migrations.js';
export * from './serializer.js';
export * from './chart-state-persistence.js';
export * from './native-chart-layout-adapter.js';
export * from './indicator-engine-state-adapter.js';

// Public API module: persistence/indicator-engine-state-adapter.d.ts
import type { PersistedIndicator } from './chart-state.js';
import type { ChartStateIndicatorAdapter, MaybePromise } from './chart-state-persistence.js';
import { type IndicatorSource } from '../indicators/indicator-source.js';
export interface PersistableIndicatorStyleSeries {
    options?(): object;
    applyOptions?(options: object): void;
}
export interface PersistableIndicatorEntry {
    readonly id: string | number;
    persistenceId?: string;
    readonly type: string;
    readonly paneId: string | null;
    readonly params: object;
    readonly seriesRefs?: readonly PersistableIndicatorStyleSeries[];
    readonly styleSources?: Readonly<Record<string, PersistableIndicatorStyleSeries>>;
    readonly outputNames?: readonly string[];
    readonly legendSources?: Readonly<Record<string, {
        readonly series?: PersistableIndicatorStyleSeries;
        readonly field?: string;
        readonly colorOption?: string;
        readonly lineWidthOption?: string;
        readonly lineStyleOption?: string;
        readonly visibilityOption?: string;
    }>>;
    colors?: string[];
    readonly source?: IndicatorSource;
    readonly visible?: boolean;
    /** Explicit scale selection; undefined means automatic routing. */
    readonly priceScaleId?: string;
}
export interface IndicatorEnginePersistenceApi {
    getIndicators(): readonly PersistableIndicatorEntry[];
    removeAll(): MaybePromise<void>;
    add(type: string, params: object, targetPaneId?: string, persistence?: {
        readonly persistenceId?: string;
        readonly source?: IndicatorSource;
        readonly priceScaleId?: string;
    }): MaybePromise<PersistableIndicatorEntry | null>;
    setVisible(id: string | number, visible: boolean): boolean;
}
export interface IndicatorEngineStateAdapterOptions {
    readonly engine: IndicatorEnginePersistenceApi;
    /** Maps a persisted pane to a host pane-controller target when ids differ. */
    readonly resolveTargetPaneId?: (indicator: PersistedIndicator) => string | undefined;
    readonly onUnknownIndicator?: (indicator: PersistedIndicator) => void;
    readonly onUnknownStyle?: (indicator: PersistedIndicator, styleId: string) => void;
}
/** Persists indicator configuration and painter styles without computed output data. */
export declare class IndicatorEngineStateAdapter implements ChartStateIndicatorAdapter {
    private readonly engine;
    private readonly resolveTargetPaneId?;
    private readonly onUnknownIndicator?;
    private readonly onUnknownStyle?;
    constructor(options: IndicatorEngineStateAdapterOptions);
    capture(): readonly PersistedIndicator[];
    clear(): MaybePromise<void>;
    restore(indicators: readonly PersistedIndicator[]): Promise<void>;
    private targetPaneId;
}

// Public API module: persistence/json-value.d.ts
export type PersistedJsonValue = string | number | boolean | null | readonly PersistedJsonValue[] | PersistedObject;
export interface PersistedObject {
    readonly [key: string]: PersistedJsonValue;
}
export interface PersistedObjectNormalizationOptions {
    /** Omit undefined object properties. Undefined array items remain invalid. */
    readonly omitUndefined?: boolean;
}
/** Deep-clones JSON data into immutable, prototype-safe library state. */
export declare function normalizePersistedObject(value: unknown, path?: string, options?: PersistedObjectNormalizationOptions): PersistedObject;

// Public API module: persistence/migrations.d.ts
export type RawChartState = Readonly<Record<string, unknown>>;
export type ChartStateMigration = (state: RawChartState) => RawChartState;
export declare class ChartStateMigrationRegistry {
    private readonly migrations;
    register(fromVersion: number, migration: ChartStateMigration): void;
    migrate(value: unknown, targetVersion?: 1): RawChartState;
}
export declare const chartStateMigrations: ChartStateMigrationRegistry;

// Public API module: persistence/native-chart-layout-adapter.d.ts
import { type IChartApi, type IPaneApi, type ISeriesApi } from '../core/chart-api.js';
import type { PersistedSeries } from './chart-state.js';
import type { ChartStateLayoutAdapter, ChartStateLayoutSnapshot, MaybePromise } from './chart-state-persistence.js';
export interface NativeChartLayoutAdapterOptions {
    readonly chart: IChartApi;
    /** Root pane that cannot be removed. Defaults to the conventional `main` id. */
    readonly mainPaneId?: string;
    /** Overrides registry-based empty-series recreation (for host data-source wiring). */
    readonly createSeries?: (series: PersistedSeries, pane: IPaneApi) => MaybePromise<ISeriesApi<any, any> | null | void>;
    readonly includeSeries?: (series: ISeriesApi<any, any>) => boolean;
    readonly onUnknownSeries?: (series: PersistedSeries) => void;
}
/** Captures native pane/series metadata while deliberately excluding raw series data. */
export declare class NativeChartLayoutAdapter implements ChartStateLayoutAdapter {
    private readonly chart;
    private readonly mainPaneId;
    private readonly createSeries?;
    private readonly includeSeries?;
    private readonly onUnknownSeries?;
    constructor(options: NativeChartLayoutAdapterOptions);
    capture(): ChartStateLayoutSnapshot;
    restore(state: ChartStateLayoutSnapshot): Promise<void>;
    private capturePane;
}

// Public API module: persistence/serializer.d.ts
import { type ChartStateV1 } from './chart-state.js';
import { type ChartStateMigrationRegistry } from './migrations.js';
export interface SerializeChartStateOptions {
    readonly pretty?: boolean;
}
export interface DeserializeChartStateOptions {
    readonly migrations?: ChartStateMigrationRegistry;
}
export declare function serializeChartState(state: ChartStateV1, options?: SerializeChartStateOptions): string;
export declare function deserializeChartState(value: string | unknown, options?: DeserializeChartStateOptions): ChartStateV1;

// Public API module: primitives/horizontal-line.d.ts
import type { AutoscaleInfo, HitTestContext, IChartPrimitive, LineStyleValue, LogicalRange, PrimitiveAttachedContext, PrimitiveAxisView, PrimitiveHit, PrimitiveInteractionEvent, PrimitivePaneView, PrimitiveZOrder as PrimitiveZOrderValue } from '../core/chart-api.js';
export interface HorizontalLineOptions {
    /** Stable model identifier. It cannot be changed after construction. */
    readonly id?: string;
    readonly price: number;
    readonly color?: string;
    readonly lineWidth?: number;
    readonly lineStyle?: LineStyleValue;
    readonly axisLabelVisible?: boolean;
    readonly axisLabelColor?: string;
    readonly axisLabelTextColor?: string;
    readonly title?: string;
    readonly draggable?: boolean;
    /** Include the line price in the attached scale's autoscale range. */
    readonly autoscale?: boolean;
    readonly zOrder?: PrimitiveZOrderValue;
    readonly priceFormatter?: (price: number) => string;
}
export type HorizontalLineOptionsPatch = Partial<Omit<HorizontalLineOptions, 'id'>>;
export type ResolvedHorizontalLineOptions = Readonly<Required<HorizontalLineOptions>>;
/**
 * Reference interactive primitive. Attach it with chart.attachPrimitive(),
 * optionally passing a series so its price scale and formatting domain match.
 */
export declare class HorizontalLine implements IChartPrimitive {
    private readonly stableId;
    private readonly model;
    private context;
    private plot;
    private coordinate;
    private drag;
    private selected;
    private readonly renderer;
    private readonly paneView;
    private readonly axisView;
    private readonly interactionListener;
    constructor(options: HorizontalLineOptions);
    id(): string;
    price(): number;
    options(): ResolvedHorizontalLineOptions;
    setPrice(price: number): void;
    applyOptions(patch: HorizontalLineOptionsPatch): void;
    attached(context: PrimitiveAttachedContext): void;
    detached(): void;
    updateAllViews(): void;
    paneViews(): readonly PrimitivePaneView[];
    priceAxisViews(): readonly PrimitiveAxisView[];
    autoscaleInfo(_range: LogicalRange): AutoscaleInfo | null;
    hitTest(point: Readonly<{
        x: number;
        y: number;
    }>, context: HitTestContext): PrimitiveHit | null;
    onPointerDown(): void;
    onPointerMove(event: PrimitiveInteractionEvent): void;
    onPointerUp(): void;
    onPointerCancel(): void;
    private finishDrag;
    private assignPrice;
    private refreshCoordinate;
    private lineCoordinate;
    private axisBackground;
    private axisTextColor;
    private axisText;
    private draw;
}

// Public API module: primitives/session-shading.d.ts
import { type IChartPrimitive, type PrimitiveAttachedContext, type PrimitivePaneView, type PrimitiveZOrder as PrimitiveZOrderValue } from '../core/chart-api.js';
import { type ITradingCalendar, type TradingSession, type TradingSessionKind as TradingSessionKindValue } from '../time/trading-calendar.js';
export interface SessionShadingStyle {
    readonly color?: string;
    readonly visible?: boolean;
}
export interface SessionShadingOptions {
    readonly id?: string;
    readonly calendar: ITradingCalendar;
    readonly styles?: Partial<Record<TradingSessionKindValue, SessionShadingStyle>>;
    readonly zOrder?: PrimitiveZOrderValue;
}
export type SessionShadingOptionsPatch = Partial<Omit<SessionShadingOptions, 'id'>>;
export interface ResolvedSessionShadingStyle {
    readonly color: string;
    readonly visible: boolean;
}
export interface ResolvedSessionShadingOptions {
    readonly id: string;
    readonly calendar: ITradingCalendar;
    readonly styles: Readonly<Record<TradingSessionKindValue, ResolvedSessionShadingStyle>>;
    readonly zOrder: PrimitiveZOrderValue;
}
/** Calendar-backed pane background implemented only through the public primitive API. */
export declare class SessionShading implements IChartPrimitive {
    private readonly stableId;
    private readonly model;
    private context;
    private range;
    private sessions;
    private cache;
    private readonly renderer;
    private readonly paneView;
    constructor(options: SessionShadingOptions);
    id(): string;
    options(): ResolvedSessionShadingOptions;
    visibleSessions(): readonly TradingSession[];
    applyOptions(patch: SessionShadingOptionsPatch): void;
    attached(context: PrimitiveAttachedContext): void;
    detached(): void;
    updateAllViews(): void;
    paneViews(): readonly PrimitivePaneView[];
    private refresh;
    private invalidateCache;
    private draw;
}

// Public API module: primitives/trend-line.d.ts
import type { AutoscaleInfo, HitTestContext, IChartPrimitive, LineStyleValue, LogicalRange, PrimitiveAttachedContext, PrimitiveHit, PrimitiveInteractionEvent, PrimitivePaneView, PrimitiveZOrder as PrimitiveZOrderValue, Time } from '../core/chart-api.js';
export interface TrendLinePoint {
    readonly time: Time;
    readonly price: number;
}
export interface TrendLineOptions {
    /** Stable model identifier. It cannot be changed after construction. */
    readonly id?: string;
    readonly start: TrendLinePoint;
    readonly end: TrendLinePoint;
    readonly color?: string;
    readonly lineWidth?: number;
    readonly lineStyle?: LineStyleValue;
    readonly draggable?: boolean;
    readonly autoscale?: boolean;
    readonly extendLeft?: boolean;
    readonly extendRight?: boolean;
    readonly zOrder?: PrimitiveZOrderValue;
}
export type TrendLineOptionsPatch = Partial<Omit<TrendLineOptions, 'id'>>;
export interface ResolvedTrendLineOptions {
    readonly id: string;
    readonly start: TrendLinePoint;
    readonly end: TrendLinePoint;
    readonly color: string;
    readonly lineWidth: number;
    readonly lineStyle: LineStyleValue;
    readonly draggable: boolean;
    readonly autoscale: boolean;
    readonly extendLeft: boolean;
    readonly extendRight: boolean;
    readonly zOrder: PrimitiveZOrderValue;
}
/** Reference two-point drawing built exclusively on the public primitive API. */
export declare class TrendLine implements IChartPrimitive {
    private readonly stableId;
    private readonly model;
    private context;
    private plot;
    private screen;
    private drag;
    private selected;
    private readonly renderer;
    private readonly paneView;
    private readonly interactionListener;
    constructor(options: TrendLineOptions);
    id(): string;
    startPoint(): TrendLinePoint;
    endPoint(): TrendLinePoint;
    points(): Readonly<{
        start: TrendLinePoint;
        end: TrendLinePoint;
    }>;
    options(): ResolvedTrendLineOptions;
    setPoints(start: TrendLinePoint, end: TrendLinePoint): void;
    applyOptions(patch: TrendLineOptionsPatch): void;
    attached(context: PrimitiveAttachedContext): void;
    detached(): void;
    updateAllViews(): void;
    paneViews(): readonly PrimitivePaneView[];
    autoscaleInfo(_range: LogicalRange): AutoscaleInfo | null;
    hitTest(pointToTest: Readonly<{
        x: number;
        y: number;
    }>, context: HitTestContext): PrimitiveHit | null;
    onPointerDown(event: PrimitiveInteractionEvent): void;
    onPointerMove(event: PrimitiveInteractionEvent): void;
    onPointerUp(): void;
    onPointerCancel(): void;
    private hit;
    private finishDrag;
    private assignPoints;
    private pointFromCoordinate;
    private refreshScreen;
    private visibleSegment;
    private draw;
}

// Public API module: series/registry.d.ts
export interface TimedSeriesData {
    time: number;
}
export interface SeriesPriceRange {
    min: number;
    max: number;
}
export interface SeriesRendererPane {
    left: number;
    right: number;
    top: number;
    bottom: number;
    width: number;
    height: number;
}
export interface SeriesRendererTheme {
    fontFamily: string;
    textColor: string;
    horizontalGridColor: string;
    verticalGridColor: string;
}
export interface SeriesRendererContext<TData extends TimedSeriesData = TimedSeriesData, TOptions extends object = object> {
    readonly target: CanvasRenderingContext2D;
    readonly data: readonly TData[];
    readonly allData: readonly TData[];
    readonly options: Readonly<TOptions>;
    readonly priceRange: SeriesPriceRange;
    readonly visibleTimeRange: Readonly<{
        from: number;
        to: number;
    }>;
    readonly pane: SeriesRendererPane;
    readonly theme: SeriesRendererTheme;
    readonly barSpacing: number;
    readonly metadata: Readonly<Record<string, unknown>>;
    timeToCoordinate(time: number): number;
    priceToCoordinate(price: number): number;
}
export interface PreparedSeriesData<TData extends TimedSeriesData = TimedSeriesData> {
    readonly data: readonly TData[];
    readonly metadata?: Readonly<Record<string, unknown>>;
}
export type SeriesDataProcessor<TData extends TimedSeriesData, TOptions extends object> = (data: readonly TData[], options: Readonly<TOptions>) => PreparedSeriesData<TData>;
export type SeriesDataUpdateKind = 'append' | 'update';
/** A tail splice emitted by a stateful series data processor. */
export interface SeriesDataProcessorPatch<TData extends TimedSeriesData = TimedSeriesData> {
    readonly fromIndex: number;
    readonly removed: number;
    readonly data: readonly TData[];
    readonly metadata?: Readonly<Record<string, unknown>>;
}
/**
 * Per-series processor instance for transforms whose live update is cheaper
 * than rebuilding their complete output (for example Renko and Point & Figure).
 */
export interface IIncrementalSeriesDataProcessor<TData extends TimedSeriesData, TOptions extends object> {
    reset(data: readonly TData[], options: Readonly<TOptions>): PreparedSeriesData<TData>;
    update(point: TData, options: Readonly<TOptions>, kind: SeriesDataUpdateKind): SeriesDataProcessorPatch<TData> | null;
}
export type IncrementalSeriesDataProcessorFactory<TData extends TimedSeriesData, TOptions extends object> = () => IIncrementalSeriesDataProcessor<TData, TOptions>;
export interface ISeriesRenderer<TData extends TimedSeriesData = TimedSeriesData, TOptions extends object = object> {
    readonly dataPadding?: number;
    /** Allows all-data overlays to render when no source point intersects the viewport. */
    readonly drawOutsideVisibleRange?: boolean;
    draw(context: SeriesRendererContext<TData, TOptions>): void;
    priceRange?(data: readonly TData[], options: Readonly<TOptions>): SeriesPriceRange | null;
    priceValue?(data: TData, options: Readonly<TOptions>): number | null;
    colorAt?(data: TData, options: Readonly<TOptions>): string | null;
    magnetValues?(data: TData, options: Readonly<TOptions>): readonly number[];
}
declare const seriesDataType: unique symbol;
declare const seriesOptionsType: unique symbol;
export interface SeriesDefinition<TData extends TimedSeriesData = TimedSeriesData, TOptions extends object = object> {
    readonly type: string;
    /** Type-only fields used to preserve data/options inference for registry references. */
    readonly [seriesDataType]?: TData;
    readonly [seriesOptionsType]?: TOptions;
}
export interface CustomSeriesDefinition<TData extends TimedSeriesData = TimedSeriesData, TOptions extends object = object> extends SeriesDefinition<TData, TOptions> {
    readonly defaultOptions: Readonly<TOptions>;
    readonly renderer: ISeriesRenderer<TData, TOptions>;
    readonly dataProcessor?: SeriesDataProcessor<TData, TOptions>;
    readonly incrementalDataProcessorFactory?: IncrementalSeriesDataProcessorFactory<TData, TOptions>;
    readonly affectsTimeScale?: boolean;
}
export declare class SeriesRendererRegistry {
    private readonly definitions;
    register<TData extends TimedSeriesData, TOptions extends object>(definition: CustomSeriesDefinition<TData, TOptions>): CustomSeriesDefinition<TData, TOptions>;
    unregister(type: string): boolean;
    has(type: string): boolean;
    get(type: string): CustomSeriesDefinition<any, any> | undefined;
    resolve(definition: SeriesDefinition<any, any>): CustomSeriesDefinition<any, any>;
    reference<TData extends TimedSeriesData = TimedSeriesData, TOptions extends object = object>(type: string): SeriesDefinition<TData, TOptions>;
    types(): readonly string[];
}
export declare const seriesRendererRegistry: SeriesRendererRegistry;
export declare function registerSeries<TData extends TimedSeriesData, TOptions extends object>(definition: CustomSeriesDefinition<TData, TOptions>): CustomSeriesDefinition<TData, TOptions>;
export declare function unregisterSeries(type: string): boolean;
export declare function getSeriesDefinition(type: string): CustomSeriesDefinition<any, any> | undefined;
export declare function getSeriesTypes(): readonly string[];
export {};

// Public API module: time/bar-clock.d.ts
import type { Time } from '../core/chart-api.js';
import { type ITradingCalendar, type TradingSession, type TradingSessionKind as TradingSessionKindValue } from './trading-calendar.js';
export declare const BarClockState: Readonly<{
    readonly Pending: 'pending';
    readonly Open: 'open';
    readonly Closed: 'closed';
}>;
export type BarClockState = typeof BarClockState[keyof typeof BarClockState];
export interface BarClockOptions {
    readonly calendar?: ITradingCalendar;
    /** Defaults to regular sessions when a calendar is present. */
    readonly sessionKinds?: readonly TradingSessionKindValue[];
}
export interface TradingBarBounds {
    readonly resolution: string;
    readonly intervalSeconds: number;
    readonly openTime: Time;
    readonly closeTime: Time;
    readonly durationSeconds: number;
    readonly session: TradingSession | null;
}
export interface BarCountdown {
    readonly state: BarClockState;
    readonly now: Time;
    readonly bounds: TradingBarBounds;
    readonly untilOpenSeconds: number;
    readonly elapsedSeconds: number;
    readonly remainingSeconds: number;
    readonly progress: number;
}
/**
 * Resolves the close of a feed bar from its open timestamp. Intraday bars are
 * truncated at their owning session close; D/W bars advance by local trading
 * dates rather than by browser-local midnights.
 */
export declare function resolveTradingBarBounds(barOpenTime: Time, resolution: string, options?: BarClockOptions): TradingBarBounds | null;
/** Deterministic countdown snapshot. The caller owns the clock and supplies now. */
export declare function calculateBarCountdown(barOpenTime: Time, resolution: string, now: Time, options?: BarClockOptions): BarCountdown | null;

// Public API module: time/index.d.ts
export * from './trading-calendar.js';
export * from './trading-calendar-engine.js';
export * from './time-axis-formatter.js';
export * from './bar-clock.js';

// Public API module: time/time-axis-formatter.d.ts
import type { Time } from '../core/chart-api.js';
export declare const TimeScaleLabelKind: Readonly<{
    readonly Tick: 'tick';
    readonly Crosshair: 'crosshair';
}>;
export type TimeScaleLabelKind = typeof TimeScaleLabelKind[keyof typeof TimeScaleLabelKind];
export interface TimeScaleFormatContext {
    readonly kind: TimeScaleLabelKind;
    readonly locale: string;
    readonly timeZone: string;
    readonly timeVisible: boolean;
    readonly secondsVisible: boolean;
    readonly tickStep: number | null;
}
export type TimeScaleFormatter = (time: Time, context: TimeScaleFormatContext) => string;
export interface TimeAxisFormatterOptions {
    readonly locale?: string;
    readonly timeZone?: string;
    readonly timeVisible?: boolean;
    readonly secondsVisible?: boolean;
    readonly formatter?: TimeScaleFormatter;
}
/** Cached Intl formatter shared by time-axis ticks and crosshair labels. */
export declare class TimeAxisFormatter {
    readonly locale: string;
    readonly timeZone: string;
    private readonly timeVisible;
    private readonly secondsVisible;
    private readonly custom;
    private readonly formatters;
    private readonly partsFormatter;
    constructor(options?: TimeAxisFormatterOptions);
    formatCrosshair(time: Time): string;
    formatTick(time: Time, step: number): string;
    private tryCustom;
    private format;
    private localDateParts;
}

// Public API module: time/trading-calendar-engine.d.ts
import type { Time, TimeRange } from '../core/chart-api.js';
import { type ITradingCalendar, type TradingSchedule, type TradingSession, type TradingSessionKind as TradingSessionKindValue } from './trading-calendar.js';
/** IANA/DST-aware materializer for recurring exchange sessions. */
export declare class TradingCalendar implements ITradingCalendar {
    private readonly scheduleValue;
    private readonly formatter;
    private readonly holidays;
    private readonly overrides;
    private readonly sessionCache;
    private readonly offsetCache;
    constructor(schedule: TradingSchedule);
    schedule(): TradingSchedule;
    sessionsInRange(range: TimeRange, kinds?: readonly TradingSessionKindValue[]): readonly TradingSession[];
    sessionAt(time: Time, kinds?: readonly TradingSessionKindValue[]): TradingSession | null;
    isTradingTime(time: Time, kinds?: readonly TradingSessionKindValue[]): boolean;
    nextSession(time: Time, kinds?: readonly TradingSessionKindValue[]): TradingSession | null;
    previousSession(time: Time, kinds?: readonly TradingSessionKindValue[]): TradingSession | null;
    private sessionsForDate;
    private materialize;
    private localDateAt;
    private parseDate;
    private isoWeekday;
    private localParts;
    private toUtc;
    private offsetsForDate;
}

// Public API module: time/trading-calendar.d.ts
import type { Time, TimeRange } from '../core/chart-api.js';
/** ISO-8601 weekday: Monday is 1 and Sunday is 7. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
/** Calendar-local date in the strict YYYY-MM-DD form. */
export type LocalDate = string;
export interface LocalTimeOfDay {
    readonly hour: number;
    readonly minute: number;
    readonly second?: number;
}
export declare const TradingSessionKind: Readonly<{
    readonly PreMarket: 'pre-market';
    readonly Regular: 'regular';
    readonly PostMarket: 'post-market';
}>;
export type TradingSessionKind = typeof TradingSessionKind[keyof typeof TradingSessionKind];
/** One local-time session shape, reusable by weekly rules and date overrides. */
export interface TradingSessionTemplate {
    readonly id: string;
    readonly kind: TradingSessionKind;
    readonly open: LocalTimeOfDay;
    readonly close: LocalTimeOfDay;
    /** Explicitly places close on the opening day (0) or the following local day (1). */
    readonly closeDayOffset?: 0 | 1;
}
/** A recurring session whose weekday is the local date on which it opens. */
export interface TradingSessionRule extends TradingSessionTemplate {
    readonly weekdays: readonly IsoWeekday[];
}
/** Replaces every recurring session for one local trading date, e.g. an early close. */
export interface TradingDayOverride {
    readonly date: LocalDate;
    readonly sessions: readonly TradingSessionTemplate[];
}
export interface TradingSchedule {
    readonly id?: string;
    /** IANA timezone, for example America/New_York or Europe/Moscow. */
    readonly timeZone: string;
    readonly sessions: readonly TradingSessionRule[];
    /** Fully closed local trading dates. */
    readonly holidays?: readonly LocalDate[];
    /** Date-specific replacement sessions. */
    readonly overrides?: readonly TradingDayOverride[];
}
/** One concrete half-open UTC interval [openTime, closeTime). */
export interface TradingSession {
    readonly id: string;
    readonly ruleId: string;
    readonly kind: TradingSessionKind;
    readonly tradingDate: LocalDate;
    readonly openTime: Time;
    readonly closeTime: Time;
    readonly isOverride: boolean;
}
/** Immutable calendar boundary used by scale, shading and bar-clock features. */
export interface ITradingCalendar {
    schedule(): TradingSchedule;
    /** Returns sessions intersecting the half-open UTC range [from, to). */
    sessionsInRange(range: TimeRange, kinds?: readonly TradingSessionKind[]): readonly TradingSession[];
    sessionAt(time: Time, kinds?: readonly TradingSessionKind[]): TradingSession | null;
    isTradingTime(time: Time, kinds?: readonly TradingSessionKind[]): boolean;
    nextSession(time: Time, kinds?: readonly TradingSessionKind[]): TradingSession | null;
    previousSession(time: Time, kinds?: readonly TradingSessionKind[]): TradingSession | null;
}

// Public API module: workspace/chart-navigator.d.ts
import type { IChartApi, Time, TimeRange, TimedSeriesData } from '../core/chart-api.js';
import { type ChartDataControllerListener, type ChartDataControllerSnapshot } from '../data/chart-data-controller.js';
export declare const NavigatorStatus: Readonly<{
    readonly Idle: 'idle';
    readonly Loading: 'loading';
    readonly Ready: 'ready';
    readonly Error: 'error';
}>;
export type NavigatorStatus = typeof NavigatorStatus[keyof typeof NavigatorStatus];
export declare const NavigatorRangePreset: Readonly<{
    readonly OneDay: '1d';
    readonly FiveDays: '5d';
    readonly OneMonth: '1m';
    readonly ThreeMonths: '3m';
    readonly SixMonths: '6m';
    readonly YearToDate: 'ytd';
    readonly OneYear: '1y';
    readonly FiveYears: '5y';
    readonly All: 'all';
}>;
export type NavigatorRangePreset = typeof NavigatorRangePreset[keyof typeof NavigatorRangePreset];
export declare const NavigatorDateAlignment: Readonly<{
    readonly Start: 'start';
    readonly Center: 'center';
    readonly End: 'end';
}>;
export type NavigatorDateAlignment = typeof NavigatorDateAlignment[keyof typeof NavigatorDateAlignment];
export declare const NavigatorNavigationOutcome: Readonly<{
    readonly Applied: 'applied';
    readonly Clamped: 'clamped';
    readonly PageLimit: 'page-limit';
    readonly Empty: 'empty';
    readonly Cancelled: 'cancelled';
}>;
export type NavigatorNavigationOutcome = typeof NavigatorNavigationOutcome[keyof typeof NavigatorNavigationOutcome];
export interface NavigatorBounds {
    readonly from: Time;
    readonly to: Time;
    readonly count: number;
}
export interface NavigatorSample {
    readonly from: Time;
    readonly to: Time;
    readonly open: number | null;
    readonly high: number | null;
    readonly low: number | null;
    readonly close: number | null;
    readonly count: number;
}
export interface NavigatorValue {
    readonly value: number;
    readonly high?: number;
    readonly low?: number;
}
export type NavigatorValueAccessor<TBar extends TimedSeriesData> = (bar: TBar) => number | NavigatorValue | null;
export interface NavigatorPresetContext {
    readonly anchor: Time;
    readonly bounds: NavigatorBounds;
    readonly data: ChartDataControllerSnapshot;
}
export interface NavigatorPresetDefinition {
    readonly id: string;
    readonly label: string;
    /** Null means the complete available history. */
    readonly range: (context: NavigatorPresetContext) => TimeRange | null;
}
export interface NavigatorDataController<TBar extends TimedSeriesData> {
    snapshot(): ChartDataControllerSnapshot;
    /** Half-open raw-data window [fromIndex, toIndex). */
    rawDataSlice(fromIndex?: number, toIndex?: number): readonly TBar[];
    loadMoreBefore(): Promise<number>;
    subscribe(listener: ChartDataControllerListener): void;
    unsubscribe(listener: ChartDataControllerListener): void;
}
export interface ChartNavigatorOptions<TBar extends TimedSeriesData> {
    readonly chart: IChartApi;
    readonly data: NavigatorDataController<TBar>;
    readonly valueAccessor?: NavigatorValueAccessor<TBar>;
    /** Maximum number of immutable overview buckets. Defaults to 600. */
    readonly maxPoints?: number;
    /** Safety limit for one range/date operation. Defaults to 100 history pages. */
    readonly maxHistoryPages?: number;
    /** Replaces the built-in preset list when supplied. */
    readonly presets?: readonly NavigatorPresetDefinition[];
}
export interface NavigatorHistoryOptions {
    readonly maxHistoryPages?: number;
}
export interface NavigatorGoToDateOptions extends NavigatorHistoryOptions {
    /** Visible time span in seconds. The current chart span is used by default. */
    readonly spanSeconds?: number;
    readonly alignment?: NavigatorDateAlignment;
}
export interface NavigatorNavigationResult {
    readonly outcome: NavigatorNavigationOutcome;
    readonly requestedRange: TimeRange | null;
    readonly requestedTime: Time | null;
    readonly visibleRange: TimeRange | null;
    readonly presetId: string | null;
    readonly pagesLoaded: number;
    readonly barsLoaded: number;
    readonly historyExhausted: boolean;
}
export interface ChartNavigatorSnapshot {
    readonly status: NavigatorStatus;
    readonly dataStatus: ChartDataControllerSnapshot['status'];
    readonly generation: number;
    readonly loading: boolean;
    readonly bounds: NavigatorBounds | null;
    readonly visibleRange: TimeRange | null;
    readonly activePresetId: string | null;
    readonly pendingPresetId: string | null;
    readonly samples: readonly NavigatorSample[];
    readonly lastNavigation: NavigatorNavigationResult | null;
    readonly error: unknown | null;
}
export type ChartNavigatorListener = (snapshot: ChartNavigatorSnapshot) => void;
/** Built-in UTC-calendar presets. Supply custom definitions for exchange-specific boundaries. */
export declare function defaultNavigatorPresets(): readonly NavigatorPresetDefinition[];
/**
 * DOM-neutral chart navigator. It owns range/preset/date navigation and exposes a bounded
 * min/max overview model; the host remains free to render it with canvas, SVG or native UI.
 */
export declare class ChartNavigator<TBar extends TimedSeriesData> {
    private readonly chart;
    private readonly data;
    private readonly valueAccessor;
    private readonly maxPoints;
    private readonly maxHistoryPages;
    private readonly presetValues;
    private readonly presetsById;
    private readonly listeners;
    private dataState;
    private boundsValue;
    private visibleRangeValue;
    private samplesValue;
    private activePresetIdValue;
    private pendingPresetIdValue;
    private lastNavigationValue;
    private operationError;
    private samplingError;
    private operationId;
    private loading;
    private applyingRange;
    private overviewDirty;
    private sampledGeneration;
    private sampledLength;
    private sampledFirstTime;
    private sampledBucketSize;
    private disposed;
    private readonly dataListener;
    private readonly rangeListener;
    constructor(options: ChartNavigatorOptions<TBar>);
    snapshot(): ChartNavigatorSnapshot;
    presets(): readonly NavigatorPresetDefinition[];
    setRange(range: TimeRange, options?: NavigatorHistoryOptions): Promise<NavigatorNavigationResult>;
    selectPreset(presetId: string, options?: NavigatorHistoryOptions): Promise<NavigatorNavigationResult>;
    goToDate(time: Time, options?: NavigatorGoToDateOptions): Promise<NavigatorNavigationResult>;
    cancel(): boolean;
    clearError(): void;
    subscribe(listener: ChartNavigatorListener): void;
    unsubscribe(listener: ChartNavigatorListener): void;
    dispose(): void;
    private navigate;
    private applyNavigationRange;
    private needsOlderHistory;
    private operationCurrent;
    private cancelledResult;
    private handleData;
    private acceptDataSnapshot;
    private handleRange;
    private cancelActiveOperation;
    private refreshData;
    private readBounds;
    private refreshOverviewIfDirty;
    private refreshOverview;
    private defaultDateSpan;
    private navigationPageLimit;
    private snapshotValue;
    private emit;
    private assertAlive;
}

// Public API module: workspace/compare-controller.d.ts
import { type IChartApi, type ISeriesApi, type LineData, type SeriesOptions, type Time, type TimedSeriesData } from '../core/chart-api.js';
import { type ChartDataControllerSnapshot } from '../data/chart-data-controller.js';
import type { IChartDataSource, SymbolInfo } from '../data/data-source.js';
import type { RealtimeReconnectPolicy, RealtimeScheduler } from '../data/reconnect-policy.js';
export declare const CompareMode: Readonly<{
    readonly Percentage: 2;
    readonly IndexedTo100: 3;
}>;
export type CompareMode = typeof CompareMode[keyof typeof CompareMode];
export declare const CompareAlignment: Readonly<{
    /** Keep the chart's existing continuous/ordinal/session-aware time domain. */
    readonly Chart: 'chart';
    /** Project every absolute timestamp through the primary symbol's exchange calendar. */
    readonly PrimarySession: 'primary-session';
}>;
export type CompareAlignment = typeof CompareAlignment[keyof typeof CompareAlignment];
export interface CompareDataOptions {
    readonly initialCount?: number;
    readonly historyCount?: number;
    readonly historyPrefetchThreshold?: number;
    readonly autoPrefetch?: boolean;
    readonly lodCacheSize?: number;
    readonly autoScrollRealtime?: boolean;
    readonly reconnectPolicy?: RealtimeReconnectPolicy;
    readonly realtimeScheduler?: RealtimeScheduler;
}
export type CompareValueAccessor<TBar extends TimedSeriesData> = (bar: TBar) => number | null;
export interface CompareControllerOptions<TBar extends TimedSeriesData> {
    readonly chart: IChartApi;
    readonly dataSource: IChartDataSource<TBar>;
    readonly valueAccessor?: CompareValueAccessor<TBar>;
    readonly scaleId?: string;
    readonly mode?: CompareMode;
    readonly alignment?: CompareAlignment;
    readonly colors?: readonly string[];
    readonly seriesOptions?: Partial<SeriesOptions>;
    readonly data?: CompareDataOptions;
}
export interface CompareAddRequest {
    readonly id?: string;
    readonly symbol: string;
    readonly resolution: string;
    readonly label?: string;
    readonly color?: string;
    readonly visible?: boolean;
    readonly primary?: boolean;
}
export interface CompareInstrumentSnapshot {
    readonly id: string;
    readonly symbol: string;
    readonly resolution: string;
    readonly label: string;
    readonly color: string;
    readonly visible: boolean;
    readonly primary: boolean;
    readonly status: ChartDataControllerSnapshot['status'];
    readonly realtimeStatus: ChartDataControllerSnapshot['realtimeStatus'];
    readonly symbolInfo: SymbolInfo | null;
    readonly loadedBars: number;
    readonly renderedBars: number;
    readonly lastValue: number | null;
    /** Current load, realtime or history failure, in that priority order. */
    readonly error: unknown | null;
}
export interface CompareLegendItem {
    readonly id: string;
    readonly symbol: string;
    readonly label: string;
    readonly color: string;
    readonly time: Time | null;
    readonly rawValue: number | null;
    readonly changePercent: number | null;
    readonly indexedTo100: number | null;
    /** Matches the controller's current Percentage/IndexedTo100 mode. */
    readonly displayValue: number | null;
}
export interface CompareControllerSnapshot {
    readonly mode: CompareMode;
    readonly alignment: CompareAlignment;
    readonly scaleId: string;
    readonly primaryId: string | null;
    readonly crosshairTime: Time | null;
    readonly instruments: readonly CompareInstrumentSnapshot[];
    readonly legend: readonly CompareLegendItem[];
}
export type CompareControllerListener = (snapshot: CompareControllerSnapshot) => void;
/**
 * Owns compare line series and one independent ChartDataController/subscription per symbol.
 * Relative normalization remains in the chart price scale, so zoom-dependent bases cannot drift
 * from rendering; this controller exposes the same bases for its legend.
 */
export declare class CompareController<TBar extends TimedSeriesData> {
    private readonly chart;
    private readonly dataSource;
    private readonly valueAccessor;
    private readonly scaleIdValue;
    private readonly colors;
    private readonly seriesOptions;
    private readonly dataOptions;
    private readonly entries;
    private readonly listeners;
    private readonly originalTimeScale;
    private readonly originalScaleMode;
    private modeValue;
    private alignmentValue;
    private primaryIdValue;
    private crosshairTimeValue;
    private alignedCalendar;
    private nextColor;
    private disposed;
    private readonly handleCrosshair;
    constructor(options: CompareControllerOptions<TBar>);
    snapshot(): CompareControllerSnapshot;
    instruments(): readonly CompareInstrumentSnapshot[];
    get(id: string): CompareInstrumentSnapshot | undefined;
    series(id: string): ISeriesApi<LineData, SeriesOptions> | undefined;
    /** A failed initial load remains in Error state so a workspace can expose retry/remove. */
    add(request: CompareAddRequest): Promise<CompareInstrumentSnapshot>;
    remove(id: string): boolean;
    setPrimary(id: string): void;
    setMode(mode: CompareMode): void;
    setAlignment(alignment: CompareAlignment): void;
    setColor(id: string, color: string): void;
    setVisible(id: string, visible: boolean): void;
    reload(id: string): Promise<SymbolInfo | null>;
    loadMoreBefore(id: string): Promise<number>;
    legend(time?: Time | null): readonly CompareLegendItem[];
    subscribe(listener: CompareControllerListener): void;
    unsubscribe(listener: CompareControllerListener): void;
    dispose(): void;
    private snapshotValue;
    private buildLegend;
    private instrumentSnapshot;
    private label;
    private applyScaleMode;
    private applyAlignment;
    private restoreAlignment;
    private requireEntry;
    private availableId;
    private emit;
    private assertAlive;
}

// Public API module: workspace/index.d.ts
export * from './pane-controller.js';
export * from './indicator-controller.js';
export * from './indicator-catalog-controller.js';
export * from './templates.js';
export * from './compare-controller.js';
export * from './multi-chart-workspace.js';
export * from './chart-navigator.js';

// Public API module: workspace/indicator-catalog-controller.d.ts
export type IndicatorCatalogMaybePromise<T> = T | Promise<T>;
export interface IndicatorCatalogEntry {
    readonly id: string;
    readonly name: string;
    readonly fullName: string;
    /** Stable category id, for example `support-resistance`. */
    readonly category: string;
    /** User-facing category label, for example `Support & Resistance`. */
    readonly categoryLabel: string;
    readonly aliases?: readonly string[];
}
export interface IndicatorCatalogQuery {
    readonly text?: string;
    /** Matches either the stable category id or its label. */
    readonly category?: string;
    readonly favoritesOnly?: boolean;
}
/** Host-owned preference storage. The host decides scope and storage technology. */
export interface IndicatorFavoritesStorage {
    load(): IndicatorCatalogMaybePromise<readonly string[] | null>;
    save(indicatorIds: readonly string[]): IndicatorCatalogMaybePromise<void>;
}
export interface IndicatorCatalogControllerOptions {
    readonly entries: readonly IndicatorCatalogEntry[];
    readonly favorites?: readonly string[];
    readonly storage?: IndicatorFavoritesStorage;
}
export interface IndicatorCatalogSnapshot {
    readonly favorites: readonly string[];
    readonly loaded: boolean;
}
export type IndicatorCatalogListener = (snapshot: IndicatorCatalogSnapshot) => void;
/** Searchable indicator catalog with host-persisted, catalog-scoped favorites. */
export declare class IndicatorCatalogController {
    private readonly indexed;
    private readonly byId;
    private readonly favoriteIds;
    private readonly listeners;
    private readonly storage?;
    private loadPromise;
    private saveTail;
    private loadingOverrides;
    private loaded;
    constructor(options: IndicatorCatalogControllerOptions);
    entries(): readonly IndicatorCatalogEntry[];
    search(query?: IndicatorCatalogQuery): readonly IndicatorCatalogEntry[];
    isFavorite(indicatorId: string): boolean;
    favorites(): readonly string[];
    snapshot(): IndicatorCatalogSnapshot;
    subscribe(listener: IndicatorCatalogListener): void;
    unsubscribe(listener: IndicatorCatalogListener): void;
    loadFavorites(): Promise<readonly string[]>;
    setFavorite(indicatorId: string, favorite: boolean): Promise<void>;
    toggleFavorite(indicatorId: string): Promise<boolean>;
    private requireId;
    private replaceFavorites;
    private normalizeFavoriteIds;
    private persist;
    private emit;
}

// Public API module: workspace/indicator-controller.d.ts
import type { ICommandStack } from '../core/interaction/command-stack.js';
import { type IndicatorDefinition, type IndicatorInputSchema, type IndicatorOutputAppearance, type IndicatorOutputStylePatch, type IndicatorParameterDefinition, type IndicatorParameters, type IndicatorParameterValue, type IndicatorSource, type IndicatorSourceStatus } from '../indicators/index.js';
export interface IndicatorControllerEngineEntry {
    readonly id: string | number;
    readonly persistenceId: string;
    readonly type: string;
    readonly params: Readonly<Record<string, unknown>>;
    readonly paneId: string | null;
    readonly paneScaleId?: string;
    readonly priceScaleId?: string;
    readonly outputNames?: readonly string[];
    readonly source?: IndicatorSource;
    readonly visible?: boolean;
    readonly definition?: IndicatorDefinition;
}
/** Minimal synchronous engine contract consumed by the public workspace facade. */
export interface IndicatorControllerEngine {
    getIndicators(): readonly IndicatorControllerEngineEntry[];
    replaceParams(id: string | number, parameters: Readonly<Record<string, unknown>>): IndicatorControllerEngineEntry | null | undefined;
    setSource(id: string | number, source: IndicatorSource): boolean;
    getSourceStatus(id: string | number): IndicatorSourceStatus | null;
    move(id: string | number, paneId: string): boolean;
    setScale(id: string | number, priceScaleId: string | null): boolean;
    setOutputStyle(id: string | number, outputId: string, patch: IndicatorOutputStylePatch): boolean;
    setVisible(id: string | number, visible: boolean): boolean;
    getStyles(id: string | number): Readonly<Record<string, Readonly<Record<string, unknown>>>> | null;
    getOutputStyles(id: string | number): Readonly<Record<string, IndicatorOutputAppearance>> | null;
    replaceStyles(id: string | number, styles: Readonly<Record<string, unknown>>): boolean;
    subscribeChange(listener: () => void): void;
    unsubscribeChange(listener: () => void): void;
}
export interface IndicatorControllerOptions {
    readonly engine: IndicatorControllerEngine;
    readonly commandStack: ICommandStack;
}
export interface IndicatorOutputSnapshot {
    readonly id: string;
    readonly name: string;
    readonly style: IndicatorOutputAppearance;
}
export interface IndicatorControllerSnapshot {
    /** Stable layout id. Runtime ids are intentionally not exposed. */
    readonly id: string;
    readonly type: string;
    readonly name: string;
    readonly description: string;
    readonly input: IndicatorInputSchema | null;
    readonly parameterDefinitions: readonly IndicatorParameterDefinition[];
    readonly parameters: IndicatorParameters;
    readonly source: IndicatorSource;
    readonly sourceStatus: IndicatorSourceStatus;
    readonly paneId: string | null;
    /** Explicit selection; null means automatic routing. */
    readonly priceScaleId: string | null;
    readonly effectivePriceScaleId: string;
    readonly visible: boolean;
    readonly outputs: readonly IndicatorOutputSnapshot[];
}
export interface IndicatorUpdatePatch {
    /** Partial parameter patch; omitted values retain their current value. */
    readonly parameters?: Readonly<Record<string, IndicatorParameterValue>>;
    readonly source?: IndicatorSource;
    /** Null moves to the main pane. The target pane must already exist. */
    readonly paneId?: string | null;
    /** Null returns to automatic scale routing. */
    readonly priceScaleId?: string | null;
    readonly visible?: boolean;
    readonly outputs?: Readonly<Record<string, IndicatorOutputStylePatch>>;
}
export type IndicatorControllerListener = (indicators: readonly IndicatorControllerSnapshot[]) => void;
/** Undoable, validated editing facade over transient indicator-engine records. */
export declare class IndicatorController {
    private readonly engine;
    private readonly commands;
    private readonly listeners;
    private applying;
    private disposed;
    private readonly handleEngineChange;
    constructor(options: IndicatorControllerOptions);
    indicators(): readonly IndicatorControllerSnapshot[];
    get(id: string): IndicatorControllerSnapshot | undefined;
    update(id: string, patch: IndicatorUpdatePatch): IndicatorControllerSnapshot;
    setParameters(id: string, parameters: Readonly<Record<string, IndicatorParameterValue>>): IndicatorControllerSnapshot;
    setSource(id: string, source: IndicatorSource): IndicatorControllerSnapshot;
    moveToPane(id: string, paneId: string | null): IndicatorControllerSnapshot;
    setPriceScale(id: string, priceScaleId: string | null): IndicatorControllerSnapshot;
    setVisible(id: string, visible: boolean): IndicatorControllerSnapshot;
    setOutputStyle(id: string, outputId: string, patch: IndicatorOutputStylePatch): IndicatorControllerSnapshot;
    subscribe(listener: IndicatorControllerListener): void;
    unsubscribe(listener: IndicatorControllerListener): void;
    dispose(): void;
    private snapshot;
    private captureState;
    private applyPatch;
    private applyStateAtomically;
    private applyState;
    private mutateAtomically;
    private replaceParameters;
    private move;
    private setScale;
    private setVisibility;
    private findEntry;
    private requireEntry;
    private emit;
    private assertAlive;
}

// Public API module: workspace/multi-chart-workspace.d.ts
import type { IChartApi, Time, TimeRange } from '../core/chart-api.js';
import type { ChartDataSelection } from '../data/chart-data-controller.js';
export type WorkspaceMaybePromise<T> = T | Promise<T>;
export interface WorkspaceSelectionSnapshot {
    readonly selection: ChartDataSelection | null;
}
/** Structural subset implemented directly by ChartDataController. */
export interface WorkspaceSelectionController {
    snapshot(): WorkspaceSelectionSnapshot;
    setSelection(selection: ChartDataSelection): WorkspaceMaybePromise<unknown>;
    subscribe(listener: (snapshot: WorkspaceSelectionSnapshot) => void): void;
    unsubscribe(listener: (snapshot: WorkspaceSelectionSnapshot) => void): void;
}
export interface WorkspaceChartCell {
    readonly chart: IChartApi;
    readonly data?: WorkspaceSelectionController;
    /** Defaults to chart.remove(). */
    readonly dispose?: () => void;
}
export interface WorkspaceChartFactoryContext {
    readonly id: string;
    readonly index: number;
    readonly host: HTMLElement;
}
export type WorkspaceChartFactory = (context: WorkspaceChartFactoryContext) => WorkspaceChartCell;
export interface WorkspaceLinkOptions {
    readonly symbol?: boolean;
    readonly resolution?: boolean;
}
export interface WorkspaceSyncOptions {
    readonly range?: boolean;
    readonly crosshair?: boolean;
}
export interface MultiChartWorkspaceOptions {
    readonly container: HTMLElement;
    readonly createChart: WorkspaceChartFactory;
    readonly count?: number;
    /** Null/undefined selects an automatic near-square grid. */
    readonly columns?: number | null;
    readonly links?: WorkspaceLinkOptions;
    readonly sync?: WorkspaceSyncOptions;
}
export interface WorkspaceLayoutRequest {
    readonly count: number;
    readonly columns?: number | null;
}
export interface WorkspaceCellSnapshot {
    readonly id: string;
    readonly index: number;
    readonly active: boolean;
    readonly selection: ChartDataSelection | null;
    readonly visibleRange: TimeRange | null;
    readonly crosshairTime: Time | null;
}
export declare const WorkspaceSyncErrorKind: Readonly<{
    readonly Selection: 'selection';
    readonly Range: 'range';
    readonly Crosshair: 'crosshair';
    readonly Lifecycle: 'lifecycle';
}>;
export type WorkspaceSyncErrorKind = typeof WorkspaceSyncErrorKind[keyof typeof WorkspaceSyncErrorKind];
export interface WorkspaceSyncError {
    readonly cellId: string;
    readonly kind: WorkspaceSyncErrorKind;
    readonly error: unknown;
}
export interface MultiChartWorkspaceSnapshot {
    readonly count: number;
    readonly columns: number;
    readonly rows: number;
    readonly activeId: string;
    readonly links: Readonly<{
        symbol: boolean;
        resolution: boolean;
    }>;
    readonly sync: Readonly<{
        range: boolean;
        crosshair: boolean;
    }>;
    readonly cells: readonly WorkspaceCellSnapshot[];
    readonly errors: readonly WorkspaceSyncError[];
}
export type MultiChartWorkspaceListener = (snapshot: MultiChartWorkspaceSnapshot) => void;
/**
 * Owns top-level chart cells only. A chart's indicator panes remain internal to that chart and
 * are never counted, laid out or synchronized as workspace cells.
 */
export declare class MultiChartWorkspace {
    private readonly container;
    private readonly factory;
    private readonly entries;
    private readonly listeners;
    private readonly errors;
    private readonly originalStyle;
    private columnsValue;
    private linksValue;
    private syncValue;
    private activeIdValue;
    private nextId;
    private syncingSelection;
    private syncingRange;
    private syncingCrosshair;
    private disposed;
    constructor(options: MultiChartWorkspaceOptions);
    snapshot(): MultiChartWorkspaceSnapshot;
    cells(): readonly WorkspaceCellSnapshot[];
    chart(id: string): IChartApi | undefined;
    host(id: string): HTMLElement | undefined;
    add(id?: string): WorkspaceCellSnapshot;
    remove(id: string): boolean;
    setCount(count: number): void;
    setColumns(columns: number | null): void;
    setLayout(layout: WorkspaceLayoutRequest): void;
    activate(id: string): void;
    setLinks(options: WorkspaceLinkOptions): void;
    setSync(options: WorkspaceSyncOptions): void;
    setSelection(id: string, selection: ChartDataSelection): Promise<unknown>;
    clearErrors(): void;
    subscribe(listener: MultiChartWorkspaceListener): void;
    unsubscribe(listener: MultiChartWorkspaceListener): void;
    dispose(): void;
    private resize;
    private createEntry;
    private disposeEntry;
    private disposeEntries;
    private handleSelection;
    private propagateSelection;
    private handleRange;
    private propagateRange;
    private handleCrosshair;
    private propagateCrosshair;
    private applyLayout;
    private restoreContainerStyle;
    private actualColumns;
    private reindex;
    private cellSnapshots;
    private cellSnapshot;
    private snapshotValue;
    private createId;
    private find;
    private indexOf;
    private requireEntry;
    private readSelection;
    private recordError;
    private emit;
    private assertAlive;
}

// Public API module: workspace/pane-controller.d.ts
import type { IChartApi, ISeriesApi } from '../core/chart-api.js';
import type { ICommandStack } from '../core/interaction/command-stack.js';
import type { PaneState } from '../core/model/pane-model.js';
export interface PaneControllerOptions {
    readonly chart: IChartApi;
    /** Defaults to the chart's shared command stack. */
    readonly commands?: ICommandStack;
}
export interface PaneControllerSnapshot {
    readonly id: string;
    readonly height: number;
    readonly minHeight: number;
    readonly order: number;
    readonly state: PaneState;
}
export type PaneControllerListener = (panes: readonly PaneControllerSnapshot[]) => void;
/** Undoable pane sizing, ordering and visibility state without recreating pane contents. */
export declare class PaneController {
    private readonly chart;
    private readonly commands;
    private readonly listeners;
    private disposed;
    constructor(options: PaneControllerOptions);
    panes(): readonly PaneControllerSnapshot[];
    resizePair(beforePaneId: string, afterPaneId: string, delta: number): boolean;
    reorder(paneIdValue: string, targetIndex: number): boolean;
    moveSeries(series: ISeriesApi, targetPaneId: string): boolean;
    setState(paneIdValue: string, state: PaneState): boolean;
    toggleMinimized(paneIdValue: string): boolean;
    toggleMaximized(paneIdValue: string): boolean;
    subscribe(listener: PaneControllerListener): void;
    unsubscribe(listener: PaneControllerListener): void;
    dispose(): void;
    private execute;
    private apply;
    private applySeriesMove;
    private notify;
    private requirePane;
    private assertAlive;
}

// Public API module: workspace/templates.d.ts
import type { LineStyleValue } from '../core/chart-api.js';
import { type IndicatorCandleFieldSource, type IndicatorCandlesSource, type IndicatorParameterValue } from '../indicators/index.js';
import type { IndicatorControllerSnapshot, IndicatorUpdatePatch } from './indicator-controller.js';
export declare const INDICATOR_TEMPLATE_SCHEMA_VERSION: 1;
export type IndicatorTemplateSource = IndicatorCandlesSource | IndicatorCandleFieldSource;
export interface IndicatorTemplateOutputStyle {
    readonly color?: string;
    readonly lineWidth: number | null;
    readonly lineStyle: LineStyleValue | null;
    readonly visible: boolean;
    readonly precision: number | null;
}
export interface IndicatorTemplateV1 {
    readonly schemaVersion: typeof INDICATOR_TEMPLATE_SCHEMA_VERSION;
    readonly id: string;
    readonly name: string;
    readonly indicatorType: string;
    readonly parameters: Readonly<Record<string, IndicatorParameterValue>>;
    /** Null means a runtime indicator-output source was intentionally not captured. */
    readonly source: IndicatorTemplateSource | null;
    readonly visible: boolean;
    readonly outputs: Readonly<Record<string, IndicatorTemplateOutputStyle>>;
}
export interface IndicatorTemplateDocumentV1 {
    readonly schemaVersion: typeof INDICATOR_TEMPLATE_SCHEMA_VERSION;
    readonly templates: readonly IndicatorTemplateV1[];
}
export interface IndicatorTemplateStorage {
    load(): string | null | Promise<string | null>;
    save(serialized: string): void | Promise<void>;
}
export interface IndicatorTemplateIndicatorController {
    get(indicatorId: string): IndicatorControllerSnapshot | undefined;
    update(indicatorId: string, patch: IndicatorUpdatePatch): IndicatorControllerSnapshot;
}
export interface IndicatorTemplateControllerOptions {
    readonly indicators: IndicatorTemplateIndicatorController;
    readonly storage?: IndicatorTemplateStorage;
    readonly createId?: () => string;
    readonly pretty?: boolean;
}
export interface IndicatorTemplateControllerSnapshot {
    readonly document: IndicatorTemplateDocumentV1;
    readonly loaded: boolean;
}
export type IndicatorTemplateListener = (snapshot: IndicatorTemplateControllerSnapshot) => void;
export interface SerializeIndicatorTemplatesOptions {
    readonly pretty?: boolean;
}
/** Validates and serializes the versioned, portable indicator-template document. */
export declare function serializeIndicatorTemplates(value: IndicatorTemplateDocumentV1, options?: SerializeIndicatorTemplatesOptions): string;
/** Parses and validates a versioned indicator-template document. */
export declare function deserializeIndicatorTemplates(value: string | unknown): IndicatorTemplateDocumentV1;
export declare function normalizeIndicatorTemplateDocument(value: unknown): IndicatorTemplateDocumentV1;
/** CRUD, persistence and undoable application of portable indicator templates. */
export declare class IndicatorTemplateController {
    private readonly indicators;
    private readonly storage?;
    private readonly createIdValue;
    private readonly pretty;
    private readonly values;
    private readonly listeners;
    private loadPromise;
    private saveTail;
    private loadingMutations;
    private loaded;
    constructor(options: IndicatorTemplateControllerOptions);
    templates(indicatorType?: string): readonly IndicatorTemplateV1[];
    get(templateId: string): IndicatorTemplateV1 | undefined;
    document(): IndicatorTemplateDocumentV1;
    snapshot(): IndicatorTemplateControllerSnapshot;
    subscribe(listener: IndicatorTemplateListener): void;
    unsubscribe(listener: IndicatorTemplateListener): void;
    load(): Promise<IndicatorTemplateDocumentV1>;
    create(name: string, indicatorId: string): Promise<IndicatorTemplateV1>;
    replace(templateId: string, indicatorId: string, name?: string): Promise<IndicatorTemplateV1>;
    rename(templateId: string, name: string): Promise<IndicatorTemplateV1>;
    remove(templateId: string): Promise<boolean>;
    /** Applies calculation/source/appearance while deliberately preserving pane and scale. */
    apply(templateId: string, indicatorId: string): IndicatorControllerSnapshot;
    private requireIndicator;
    private requireTemplate;
    private nextId;
    private write;
    private persist;
    private emit;
}
