// Public API module: index.d.ts
export * from './core/chart-api.js';
export * from './primitives/horizontal-line.js';
export * from './primitives/trend-line.js';
export * from './data/index.js';

// Public API module: core/chart-api.d.ts
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
export type { CustomSeriesDefinition, ISeriesRenderer, PreparedSeriesData, SeriesDefinition, SeriesDataProcessor, SeriesPriceRange, SeriesRendererContext, SeriesRendererPane, SeriesRendererTheme, TimedSeriesData, } from '../series/registry.js';
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
export interface VolumeProfileData extends CandlestickData {
    vol?: number;
}
export interface PriceLevelData {
    price: number;
    vol: number;
}
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
    base?: number;
    priceScaleId?: string;
    priceLineVisible?: boolean;
    lastValueVisible?: boolean;
    priceLineSource?: 'lastBar' | 'lastVisible';
    priceFormat?: PriceFormat;
    boxSize?: number;
    reversal?: number;
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
    timeScale?: {
        borderColor?: string;
        timeVisible?: boolean;
        secondsVisible?: boolean;
        visible?: boolean;
        ordinal?: boolean;
    };
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
}
export interface ISeriesMarkersPlugin {
    setMarkers(markers: SeriesMarker[]): void;
}
export interface ISeriesApi<TData extends TimedSeriesData = TimedSeriesData, TOptions extends SeriesOptions = SeriesOptions> {
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
    addSeries<TData extends TimedSeriesData, TOptions extends SeriesOptions = SeriesOptions>(definition: SeriesDefinition<TData, TOptions>, options?: Partial<TOptions>): ISeriesApi<TData, TOptions>;
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
    addSeries<TData extends TimedSeriesData, TOptions extends SeriesOptions = SeriesOptions>(definition: SeriesDefinition<TData, TOptions>, options?: Partial<TOptions>, pane?: IPaneApi): ISeriesApi<TData, TOptions>;
    removeSeries(series: ISeriesApi): void;
    attachPrimitive(primitive: IChartPrimitive, options?: PrimitiveAttachOptions): void;
    detachPrimitive(primitive: IChartPrimitive): void;
    commandStack(): ICommandStack;
    interactionState(): InteractionStateSnapshot;
    subscribeInteractionStateChange(cb: InteractionStateListener): void;
    unsubscribeInteractionStateChange(cb: InteractionStateListener): void;
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
export interface OhlcvBar extends CandlestickData {
    readonly volume?: number;
}
export interface ResolveSymbolRequest {
    readonly symbol: string;
}
/** Datafeed-owned identity and display metadata. Session fields arrive in M5. */
export interface SymbolInfo {
    readonly id: string;
    readonly ticker?: string;
    readonly name?: string;
    readonly exchange?: string;
    readonly priceFormat?: PriceFormat;
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
export interface ISeriesRenderer<TData extends TimedSeriesData = TimedSeriesData, TOptions extends object = object> {
    readonly dataPadding?: number;
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
