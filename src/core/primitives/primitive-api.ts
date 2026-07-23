import type { IDisposable } from '../disposable.js';
import type { ICommandStack } from '../interaction/command-stack.js';
import type {
    IChartApi,
    IPaneApi,
    ISeriesApi,
    SeriesOptions,
    Time,
    TimedSeriesData,
    LogicalRange,
} from '../chart-api.js';

/** Closed primitive layer set. Arbitrary numeric z-indexes are intentionally unsupported. */
export const PrimitiveZOrder = Object.freeze({
    Background: 'background',
    Bottom: 'bottom',
    Normal: 'normal',
    Top: 'top',
} as const);
export type PrimitiveZOrder = typeof PrimitiveZOrder[keyof typeof PrimitiveZOrder];

export const PrimitivePaneViewClip = Object.freeze({
    Plot: 'plot',
    Pane: 'pane',
} as const);
export type PrimitivePaneViewClip =
    typeof PrimitivePaneViewClip[keyof typeof PrimitivePaneViewClip];

export const PrimitiveHitTestRole = Object.freeze({
    Body: 'body',
    Handle: 'handle',
    Label: 'label',
    CloseButton: 'close-button',
} as const);
export type PrimitiveHitTestRole = typeof PrimitiveHitTestRole[keyof typeof PrimitiveHitTestRole];

export const PrimitiveHitTestLocation = Object.freeze({
    Pane: 'pane',
    PriceAxis: 'price-axis',
    TimeAxis: 'time-axis',
} as const);
export type PrimitiveHitTestLocation =
    typeof PrimitiveHitTestLocation[keyof typeof PrimitiveHitTestLocation];

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
    readonly point: Readonly<{ x: number; y: number }>;
    readonly startPoint: Readonly<{ x: number; y: number }>;
    readonly delta: Readonly<{ x: number; y: number }>;
    readonly totalDelta: Readonly<{ x: number; y: number }>;
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
    hitTest?(point: Readonly<{ x: number; y: number }>, context: HitTestContext): PrimitiveHit | null;
    onPointerDown?(event: PrimitiveInteractionEvent): void;
    onPointerMove?(event: PrimitiveInteractionEvent): void;
    onPointerUp?(event: PrimitiveInteractionEvent): void;
    onPointerCancel?(event: PrimitiveInteractionEvent): void;
}
