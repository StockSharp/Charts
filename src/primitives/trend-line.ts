import type {
    AutoscaleInfo,
    HitTestContext,
    IChartApi,
    IChartPrimitive,
    IPrimitiveRenderer,
    LineStyleValue,
    LogicalRange,
    PrimitiveAttachedContext,
    PrimitiveHit,
    PrimitiveInteractionEvent,
    PrimitivePaneView,
    PrimitiveRect,
    PrimitiveZOrder as PrimitiveZOrderValue,
    Time,
} from '../core/chart-api.js';
import {
    PrimitiveHitTestLocation,
    PrimitiveHitTestRole,
    PrimitiveZOrder,
} from '../core/chart-api.js';
import { lineDash, pointSegmentDistance } from './drawing-utils.js';

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

interface TrendLineModel {
    start: TrendLinePoint;
    end: TrendLinePoint;
    color: string;
    lineWidth: number;
    lineStyle: LineStyleValue;
    draggable: boolean;
    autoscale: boolean;
    extendLeft: boolean;
    extendRight: boolean;
    zOrder: PrimitiveZOrderValue;
}

interface ScreenPoint { readonly x: number; readonly y: number }
interface ScreenPoints { readonly start: ScreenPoint; readonly end: ScreenPoint }
type TrendLinePart = 'body' | 'start' | 'end';

interface TrendLineHitData {
    readonly kind: 'trend-line';
    readonly part: TrendLinePart;
    readonly line: TrendLine;
}

interface TrendLineDrag {
    readonly part: TrendLinePart;
    readonly start: TrendLinePoint;
    readonly end: TrendLinePoint;
    readonly screen: ScreenPoints;
}

let nextTrendLineId = 1;

/** Reference two-point drawing built exclusively on the public primitive API. */
export class TrendLine implements IChartPrimitive {
    private readonly stableId: string;
    private readonly model: TrendLineModel;
    private context: PrimitiveAttachedContext | null = null;
    private plot: PrimitiveRect | null = null;
    private screen: ScreenPoints | null = null;
    private drag: TrendLineDrag | null = null;
    private selected = false;
    private readonly renderer: IPrimitiveRenderer = { draw: (target) => this.draw(target) };
    private readonly paneView: PrimitivePaneView = {
        zOrder: () => this.model.zOrder,
        renderer: () => this.renderer,
    };
    private readonly interactionListener = (
        snapshot: ReturnType<IChartApi['interactionState']>,
    ): void => {
        const selected = snapshot.selected?.primitive === this;
        if (selected === this.selected) return;
        this.selected = selected;
        this.context?.requestUpdate();
    };

    constructor(options: TrendLineOptions) {
        if (options === null || typeof options !== 'object')
            throw new TypeError('sschart: trend line options are required');
        this.stableId = normalizeId(options.id);
        this.model = {
            start: point(options.start, 'start'),
            end: point(options.end, 'end'),
            color: color(options.color, '#ff9800'),
            lineWidth: width(options.lineWidth, 2),
            lineStyle: style(options.lineStyle, 0),
            draggable: options.draggable === undefined
                ? true : boolean(options.draggable, 'draggable'),
            autoscale: options.autoscale === undefined
                ? false : boolean(options.autoscale, 'autoscale'),
            extendLeft: options.extendLeft === undefined
                ? false : boolean(options.extendLeft, 'extendLeft'),
            extendRight: options.extendRight === undefined
                ? false : boolean(options.extendRight, 'extendRight'),
            zOrder: layer(options.zOrder, PrimitiveZOrder.Top),
        };
    }

    id(): string { return this.stableId; }
    startPoint(): TrendLinePoint { return freezePoint(this.model.start); }
    endPoint(): TrendLinePoint { return freezePoint(this.model.end); }
    points(): Readonly<{ start: TrendLinePoint; end: TrendLinePoint }> {
        return Object.freeze({ start: this.startPoint(), end: this.endPoint() });
    }

    options(): ResolvedTrendLineOptions {
        return Object.freeze({
            id: this.stableId,
            start: this.startPoint(),
            end: this.endPoint(),
            color: this.model.color,
            lineWidth: this.model.lineWidth,
            lineStyle: this.model.lineStyle,
            draggable: this.model.draggable,
            autoscale: this.model.autoscale,
            extendLeft: this.model.extendLeft,
            extendRight: this.model.extendRight,
            zOrder: this.model.zOrder,
        });
    }

    setPoints(start: TrendLinePoint, end: TrendLinePoint): void {
        this.applyOptions({ start, end });
    }

    applyOptions(patch: TrendLineOptionsPatch): void {
        if (patch === null || typeof patch !== 'object')
            throw new TypeError('sschart: trend line options patch must be an object');
        if (this.drag !== null) this.finishDrag(true);
        const next: TrendLineModel = { ...this.model };
        if (patch.start !== undefined) next.start = point(patch.start, 'start');
        if (patch.end !== undefined) next.end = point(patch.end, 'end');
        if (patch.color !== undefined) next.color = color(patch.color, '');
        if (patch.lineWidth !== undefined) next.lineWidth = width(patch.lineWidth, 2);
        if (patch.lineStyle !== undefined) next.lineStyle = style(patch.lineStyle, 0);
        if (patch.draggable !== undefined) next.draggable = boolean(patch.draggable, 'draggable');
        if (patch.autoscale !== undefined) next.autoscale = boolean(patch.autoscale, 'autoscale');
        if (patch.extendLeft !== undefined) next.extendLeft = boolean(patch.extendLeft, 'extendLeft');
        if (patch.extendRight !== undefined)
            next.extendRight = boolean(patch.extendRight, 'extendRight');
        if (patch.zOrder !== undefined) next.zOrder = layer(patch.zOrder, PrimitiveZOrder.Top);
        Object.assign(this.model, next);
        this.refreshScreen();
        this.context?.requestUpdate();
    }

    attached(context: PrimitiveAttachedContext): void {
        this.context = context;
        this.refreshScreen();
        context.chart.subscribeInteractionStateChange(this.interactionListener);
        context.addDisposable(() => {
            context.chart.unsubscribeInteractionStateChange(this.interactionListener);
        });
    }

    detached(): void {
        this.finishDrag(true);
        this.context = null;
        this.plot = null;
        this.screen = null;
        this.selected = false;
    }

    updateAllViews(): void { this.refreshScreen(); }
    paneViews(): readonly PrimitivePaneView[] { return [this.paneView]; }

    autoscaleInfo(_range: LogicalRange): AutoscaleInfo | null {
        if (!this.model.autoscale) return null;
        return {
            priceRange: {
                min: Math.min(this.model.start.price, this.model.end.price),
                max: Math.max(this.model.start.price, this.model.end.price),
            },
            margins: { above: 6, below: 6 },
        };
    }

    hitTest(pointToTest: Readonly<{ x: number; y: number }>, context: HitTestContext): PrimitiveHit | null {
        if (context.location !== PrimitiveHitTestLocation.Pane) return null;
        const screen = this.refreshScreen();
        const plot = this.plot;
        if (screen === null || plot === null || !contains(plot, pointToTest)) return null;
        const handleRadius = Math.max(8, this.model.lineWidth + 5);
        if (this.model.draggable) {
            if (Math.hypot(pointToTest.x - screen.start.x, pointToTest.y - screen.start.y)
                <= handleRadius) return this.hit('start', PrimitiveHitTestRole.Handle, 'move');
            if (Math.hypot(pointToTest.x - screen.end.x, pointToTest.y - screen.end.y)
                <= handleRadius) return this.hit('end', PrimitiveHitTestRole.Handle, 'move');
        }

        const segment = this.visibleSegment(screen, plot);
        if (segment === null) return null;
        const tolerance = Math.max(6, this.model.lineWidth / 2 + 3);
        if (pointSegmentDistance(pointToTest, segment.start, segment.end) > tolerance) return null;
        return this.hit('body', PrimitiveHitTestRole.Body, this.model.draggable ? 'move' : 'pointer');
    }

    onPointerDown(event: PrimitiveInteractionEvent): void {
        if (!this.model.draggable || this.drag !== null) return;
        const data = event.hit.data;
        if (!isTrendLineHitData(data) || data.line !== this) return;
        const screen = this.refreshScreen();
        if (screen === null) return;
        this.drag = {
            part: data.part,
            start: this.startPoint(),
            end: this.endPoint(),
            screen,
        };
    }

    onPointerMove(event: PrimitiveInteractionEvent): void {
        const drag = this.drag;
        const context = this.context;
        if (drag === null || context === null) return;
        if (drag.part === 'start' || drag.part === 'end') {
            const next = this.pointFromCoordinate(event.point.x, event.point.y);
            if (next === null) return;
            this.assignPoints(
                drag.part === 'start' ? next : this.model.start,
                drag.part === 'end' ? next : this.model.end,
            );
            return;
        }

        const start = this.pointFromCoordinate(
            drag.screen.start.x + event.totalDelta.x,
            drag.screen.start.y + event.totalDelta.y,
        );
        const end = this.pointFromCoordinate(
            drag.screen.end.x + event.totalDelta.x,
            drag.screen.end.y + event.totalDelta.y,
        );
        if (start === null || end === null) return;
        this.assignPoints(start, end);
    }

    onPointerUp(): void { this.finishDrag(false); }
    onPointerCancel(): void { this.finishDrag(true); }

    private hit(part: TrendLinePart, role: PrimitiveHit['role'], cursor: string): PrimitiveHit {
        const data: TrendLineHitData = Object.freeze({ kind: 'trend-line', part, line: this });
        return {
            id: part === 'body' ? this.stableId : `${this.stableId}:${part}`,
            role,
            cursor,
            zOrder: this.model.zOrder,
            data,
            interaction: {
                selectable: true,
                draggable: this.model.draggable,
                consumePointer: true,
            },
        };
    }

    private finishDrag(cancelled: boolean): void {
        const drag = this.drag;
        if (drag === null) return;
        this.drag = null;
        const finalStart = this.startPoint();
        const finalEnd = this.endPoint();
        if (cancelled) {
            this.assignPoints(drag.start, drag.end);
            return;
        }
        if ((samePoint(drag.start, finalStart) && samePoint(drag.end, finalEnd))
            || this.context === null) return;

        this.assignPoints(drag.start, drag.end, false);
        this.context.commandStack.execute({
            label: 'Move trend line',
            execute: () => this.assignPoints(finalStart, finalEnd),
            undo: () => this.assignPoints(drag.start, drag.end),
            redo: () => this.assignPoints(finalStart, finalEnd),
        });
    }

    private assignPoints(start: TrendLinePoint, end: TrendLinePoint, invalidate = true): void {
        this.model.start = freezePoint(start);
        this.model.end = freezePoint(end);
        this.refreshScreen();
        if (invalidate) this.context?.requestUpdate();
    }

    private pointFromCoordinate(x: number, y: number): TrendLinePoint | null {
        const context = this.context;
        if (context === null) return null;
        const time = context.coordinateToTime(x);
        const price = context.coordinateToPrice(y);
        if (time === null || price === null || !Number.isFinite(time) || !Number.isFinite(price)) return null;
        return Object.freeze({ time, price });
    }

    private refreshScreen(): ScreenPoints | null {
        const context = this.context;
        if (context === null) return this.screen = null;
        const startX = context.timeToCoordinate(this.model.start.time);
        const startY = context.priceToCoordinate(this.model.start.price);
        const endX = context.timeToCoordinate(this.model.end.time);
        const endY = context.priceToCoordinate(this.model.end.price);
        if (startX === null || startY === null || endX === null || endY === null
            || !Number.isFinite(startX) || !Number.isFinite(startY)
            || !Number.isFinite(endX) || !Number.isFinite(endY)) return this.screen = null;
        return this.screen = Object.freeze({
            start: Object.freeze({ x: startX, y: startY }),
            end: Object.freeze({ x: endX, y: endY }),
        });
    }

    private visibleSegment(screen: ScreenPoints, plot: PrimitiveRect): ScreenPoints | null {
        return clipLineToRect(
            screen,
            plot,
            this.model.extendLeft,
            this.model.extendRight,
        );
    }

    private draw(target: Parameters<IPrimitiveRenderer['draw']>[0]): void {
        this.plot = target.pane.plot;
        const screen = this.refreshScreen();
        if (screen === null) return;
        const segment = this.visibleSegment(screen, target.pane.plot);
        if (segment === null) return;
        target.useMediaCoordinateSpace(({ context }) => {
            context.strokeStyle = this.model.color;
            context.lineWidth = this.model.lineWidth + (this.selected ? 1 : 0);
            context.setLineDash([...lineDash(this.model.lineStyle, this.model.lineWidth)]);
            context.beginPath();
            context.moveTo(segment.start.x, segment.start.y);
            context.lineTo(segment.end.x, segment.end.y);
            context.stroke();
            context.setLineDash([]);

            if (this.selected) {
                context.fillStyle = this.context?.theme().backgroundColor ?? '#ffffff';
                context.strokeStyle = this.model.color;
                context.lineWidth = 2;
                for (const endpoint of [screen.start, screen.end]) {
                    context.beginPath();
                    context.arc(endpoint.x, endpoint.y, 5, 0, Math.PI * 2);
                    context.fill();
                    context.stroke();
                }
            }
        });
    }
}

function isTrendLineHitData(value: unknown): value is TrendLineHitData {
    return value !== null && typeof value === 'object'
        && (value as { kind?: unknown }).kind === 'trend-line';
}

function contains(rect: PrimitiveRect, value: Readonly<{ x: number; y: number }>): boolean {
    return value.x >= rect.x && value.x <= rect.x + rect.width
        && value.y >= rect.y && value.y <= rect.y + rect.height;
}

/** Liang-Barsky clipping with independently optional rays at both endpoints. */
function clipLineToRect(
    line: ScreenPoints,
    rect: PrimitiveRect,
    extendStart: boolean,
    extendEnd: boolean,
): ScreenPoints | null {
    const dx = line.end.x - line.start.x;
    const dy = line.end.y - line.start.y;
    if (dx === 0 && dy === 0) return contains(rect, line.start) ? line : null;

    let from = extendStart ? Number.NEGATIVE_INFINITY : 0;
    let to = extendEnd ? Number.POSITIVE_INFINITY : 1;
    const constrain = (origin: number, delta: number, min: number, max: number): boolean => {
        if (delta === 0) return origin >= min && origin <= max;
        const first = (min - origin) / delta;
        const second = (max - origin) / delta;
        from = Math.max(from, Math.min(first, second));
        to = Math.min(to, Math.max(first, second));
        return from <= to;
    };
    if (!constrain(line.start.x, dx, rect.x, rect.x + rect.width)
        || !constrain(line.start.y, dy, rect.y, rect.y + rect.height)) return null;
    return Object.freeze({
        start: Object.freeze({ x: line.start.x + dx * from, y: line.start.y + dy * from }),
        end: Object.freeze({ x: line.start.x + dx * to, y: line.start.y + dy * to }),
    });
}

function normalizeId(value: string | undefined): string {
    if (value === undefined) return `trend-line-${nextTrendLineId++}`;
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new TypeError('sschart: trend line id must be a non-empty string');
    return value.trim();
}

function point(value: TrendLinePoint, name: string): TrendLinePoint {
    if (value === null || typeof value !== 'object')
        throw new TypeError(`sschart: trend line ${name} point is required`);
    if (typeof value.time !== 'number' || !Number.isFinite(value.time))
        throw new RangeError(`sschart: trend line ${name} time must be finite`);
    if (typeof value.price !== 'number' || !Number.isFinite(value.price))
        throw new RangeError(`sschart: trend line ${name} price must be finite`);
    return Object.freeze({ time: value.time, price: value.price });
}

function freezePoint(value: TrendLinePoint): TrendLinePoint {
    return Object.freeze({ time: value.time, price: value.price });
}

function color(value: string | undefined, fallback: string): string {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new TypeError('sschart: trend line color must be a non-empty string');
    return value.trim();
}

function width(value: number | undefined, fallback: number): number {
    if (value === undefined) return fallback;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 20)
        throw new RangeError('sschart: trend line width must be in the (0, 20] range');
    return value;
}

function style(value: LineStyleValue | undefined, fallback: LineStyleValue): LineStyleValue {
    if (value === undefined) return fallback;
    if (!Number.isInteger(value) || value < 0 || value > 4)
        throw new RangeError('sschart: trend line style is invalid');
    return value;
}

function layer(
    value: PrimitiveZOrderValue | undefined,
    fallback: PrimitiveZOrderValue,
): PrimitiveZOrderValue {
    if (value === undefined) return fallback;
    if (!Object.values(PrimitiveZOrder).includes(value))
        throw new RangeError('sschart: trend line z-order is invalid');
    return value;
}

function boolean(value: boolean, name: string): boolean {
    if (typeof value !== 'boolean')
        throw new TypeError(`sschart: trend line ${name} must be boolean`);
    return value;
}

function samePoint(left: TrendLinePoint, right: TrendLinePoint): boolean {
    return left.time === right.time
        && Math.abs(left.price - right.price)
            <= Number.EPSILON * Math.max(1, Math.abs(left.price), Math.abs(right.price));
}
