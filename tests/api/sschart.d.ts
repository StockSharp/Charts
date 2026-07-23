import { type PaneOptions } from './model/pane-model.js';
import type { TimeRange } from './scale/time-scale.js';
export type { TimeRange } from './scale/time-scale.js';
export type { PaneOptions, PaneState } from './model/pane-model.js';
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
export type SeriesKind = 'Candlestick' | 'Bar' | 'Line' | 'Histogram' | 'Area' | 'Band' | 'PointFigure' | 'Renko' | 'VolumeProfile' | 'Cluster' | 'Box';
export interface SeriesDefinition {
    type: SeriesKind;
}
export declare const CandlestickSeries: SeriesDefinition;
export declare const BarSeries: SeriesDefinition;
export declare const LineSeries: SeriesDefinition;
export declare const HistogramSeries: SeriesDefinition;
export declare const AreaSeries: SeriesDefinition;
export declare const BandSeries: SeriesDefinition;
export declare const PointFigureSeries: SeriesDefinition;
export declare const RenkoSeries: SeriesDefinition;
export declare const VolumeProfileSeries: SeriesDefinition;
export declare const ClusterSeries: SeriesDefinition;
export declare const BoxSeries2: SeriesDefinition;
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
export interface CrosshairMoveEvent {
    time?: Time;
    point?: {
        x: number;
        y: number;
    };
}
export type RangeListener = (range: TimeRange | null) => void;
export type CrosshairListener = (param: CrosshairMoveEvent) => void;
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
}
export type ClickListener = (c: ChartClick) => void;
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
export interface ISeriesApi {
    setData(points: ReadonlyArray<unknown>): void;
    update(point: unknown): void;
    applyOptions(patch: SeriesOptions): void;
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
    addSeries(definition: SeriesDefinition, options?: SeriesOptions): ISeriesApi;
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
    addSeries(definition: SeriesDefinition, options?: SeriesOptions, pane?: IPaneApi): ISeriesApi;
    removeSeries(series: ISeriesApi): void;
    timeScale(): ITimeScaleApi;
    priceScale(scaleId?: string): IPriceScaleApi;
    subscribeClick(cb: ClickListener): void;
    unsubscribeClick(cb: ClickListener): void;
    subscribeCrosshairMove(cb: CrosshairListener): void;
    unsubscribeCrosshairMove(cb: CrosshairListener): void;
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
