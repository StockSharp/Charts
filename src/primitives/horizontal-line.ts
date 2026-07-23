import type {
    AutoscaleInfo,
    HitTestContext,
    IChartApi,
    IChartPrimitive,
    IPrimitiveRenderer,
    LineStyleValue,
    LogicalRange,
    PrimitiveAttachedContext,
    PrimitiveAxisView,
    PrimitiveHit,
    PrimitiveInteractionEvent,
    PrimitivePaneView,
    PrimitiveRect,
    PrimitiveZOrder as PrimitiveZOrderValue,
} from '../core/chart-api.js';
import {
    PrimitiveHitTestLocation,
    PrimitiveHitTestRole,
    PrimitiveZOrder,
} from '../core/chart-api.js';
import {
    alignStroke,
    concisePrice,
    lineDash,
    readableTextColor,
} from './drawing-utils.js';

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

interface HorizontalLineModel {
    price: number;
    color: string;
    lineWidth: number;
    lineStyle: LineStyleValue;
    axisLabelVisible: boolean;
    axisLabelColor: string | null;
    axisLabelTextColor: string | null;
    title: string;
    draggable: boolean;
    autoscale: boolean;
    zOrder: PrimitiveZOrderValue;
    priceFormatter: (price: number) => string;
}

interface HorizontalLineDrag {
    readonly startPrice: number;
}

let nextHorizontalLineId = 1;

/**
 * Reference interactive primitive. Attach it with chart.attachPrimitive(),
 * optionally passing a series so its price scale and formatting domain match.
 */
export class HorizontalLine implements IChartPrimitive {
    private readonly stableId: string;
    private readonly model: HorizontalLineModel;
    private context: PrimitiveAttachedContext | null = null;
    private plot: PrimitiveRect | null = null;
    private coordinate: number | null = null;
    private drag: HorizontalLineDrag | null = null;
    private selected = false;
    private readonly renderer: IPrimitiveRenderer = { draw: (target) => this.draw(target) };
    private readonly paneView: PrimitivePaneView = {
        zOrder: () => this.model.zOrder,
        renderer: () => this.renderer,
    };
    private readonly axisView: PrimitiveAxisView = {
        coordinate: () => this.lineCoordinate(),
        text: () => this.axisText(),
        backgroundColor: () => this.axisBackground(),
        textColor: () => this.axisTextColor(),
        visible: () => this.model.axisLabelVisible,
    };
    private readonly interactionListener = (
        snapshot: ReturnType<IChartApi['interactionState']>,
    ): void => {
        const selected = snapshot.selected?.primitive === this;
        if (selected === this.selected) return;
        this.selected = selected;
        this.context?.requestUpdate();
    };

    constructor(options: HorizontalLineOptions) {
        if (options === null || typeof options !== 'object')
            throw new TypeError('sschart: horizontal line options are required');
        this.stableId = normalizeId(options.id);
        this.model = {
            price: finitePrice(options.price),
            color: color(options.color, '#2962ff', 'color'),
            lineWidth: width(options.lineWidth, 2),
            lineStyle: style(options.lineStyle, 2),
            axisLabelVisible: options.axisLabelVisible === undefined
                ? true : boolean(options.axisLabelVisible, 'axisLabelVisible'),
            axisLabelColor: optionalColor(options.axisLabelColor, 'axisLabelColor'),
            axisLabelTextColor: optionalColor(options.axisLabelTextColor, 'axisLabelTextColor'),
            title: text(options.title, ''),
            draggable: options.draggable === undefined
                ? true : boolean(options.draggable, 'draggable'),
            autoscale: options.autoscale === undefined
                ? false : boolean(options.autoscale, 'autoscale'),
            zOrder: layer(options.zOrder, PrimitiveZOrder.Top),
            priceFormatter: formatter(options.priceFormatter),
        };
    }

    id(): string { return this.stableId; }
    price(): number { return this.model.price; }

    options(): ResolvedHorizontalLineOptions {
        return Object.freeze({
            id: this.stableId,
            price: this.model.price,
            color: this.model.color,
            lineWidth: this.model.lineWidth,
            lineStyle: this.model.lineStyle,
            axisLabelVisible: this.model.axisLabelVisible,
            axisLabelColor: this.axisBackground(),
            axisLabelTextColor: this.axisTextColor(),
            title: this.model.title,
            draggable: this.model.draggable,
            autoscale: this.model.autoscale,
            zOrder: this.model.zOrder,
            priceFormatter: this.model.priceFormatter,
        });
    }

    setPrice(price: number): void { this.applyOptions({ price }); }

    applyOptions(patch: HorizontalLineOptionsPatch): void {
        if (patch === null || typeof patch !== 'object')
            throw new TypeError('sschart: horizontal line options patch must be an object');
        const next: HorizontalLineModel = { ...this.model };
        if (patch.price !== undefined) next.price = finitePrice(patch.price);
        if (patch.color !== undefined) next.color = color(patch.color, '', 'color');
        if (patch.lineWidth !== undefined) next.lineWidth = width(patch.lineWidth, 2);
        if (patch.lineStyle !== undefined) next.lineStyle = style(patch.lineStyle, 2);
        if (patch.axisLabelVisible !== undefined)
            next.axisLabelVisible = boolean(patch.axisLabelVisible, 'axisLabelVisible');
        if (patch.axisLabelColor !== undefined)
            next.axisLabelColor = color(patch.axisLabelColor, '', 'axisLabelColor');
        if (patch.axisLabelTextColor !== undefined)
            next.axisLabelTextColor = color(patch.axisLabelTextColor, '', 'axisLabelTextColor');
        if (patch.title !== undefined) next.title = text(patch.title, '');
        if (patch.draggable !== undefined)
            next.draggable = boolean(patch.draggable, 'draggable');
        if (patch.autoscale !== undefined) next.autoscale = boolean(patch.autoscale, 'autoscale');
        if (patch.zOrder !== undefined) next.zOrder = layer(patch.zOrder, PrimitiveZOrder.Top);
        if (patch.priceFormatter !== undefined) next.priceFormatter = formatter(patch.priceFormatter);
        Object.assign(this.model, next);
        this.refreshCoordinate();
        this.context?.requestUpdate();
    }

    attached(context: PrimitiveAttachedContext): void {
        this.context = context;
        this.refreshCoordinate();
        context.chart.subscribeInteractionStateChange(this.interactionListener);
        context.addDisposable(() => {
            context.chart.unsubscribeInteractionStateChange(this.interactionListener);
        });
    }

    detached(): void {
        this.finishDrag(true);
        this.context = null;
        this.coordinate = null;
        this.plot = null;
        this.selected = false;
    }

    updateAllViews(): void { this.refreshCoordinate(); }
    paneViews(): readonly PrimitivePaneView[] { return [this.paneView]; }
    priceAxisViews(): readonly PrimitiveAxisView[] { return [this.axisView]; }

    autoscaleInfo(_range: LogicalRange): AutoscaleInfo | null {
        if (!this.model.autoscale) return null;
        return { priceRange: { min: this.model.price, max: this.model.price } };
    }

    hitTest(point: Readonly<{ x: number; y: number }>, context: HitTestContext): PrimitiveHit | null {
        const coordinate = this.lineCoordinate();
        const plot = this.plot;
        if (coordinate === null || plot === null) return null;
        const tolerance = Math.max(6, this.model.lineWidth / 2 + 3);
        if (Math.abs(point.y - coordinate) > tolerance) return null;

        let role: PrimitiveHit['role'] = PrimitiveHitTestRole.Body;
        if (context.location === PrimitiveHitTestLocation.Pane) {
            if (point.x < plot.x || point.x > plot.x + plot.width) return null;
        } else if (context.location === PrimitiveHitTestLocation.PriceAxis) {
            if (!this.model.axisLabelVisible) return null;
            const onOwnSide = context.priceScaleId === 'left'
                ? point.x <= plot.x
                : point.x >= plot.x + plot.width;
            if (!onOwnSide) return null;
            role = this.model.draggable ? PrimitiveHitTestRole.Handle : PrimitiveHitTestRole.Label;
        } else {
            return null;
        }

        return {
            id: this.stableId,
            role,
            cursor: this.model.draggable ? 'ns-resize' : 'pointer',
            zOrder: this.model.zOrder,
            data: Object.freeze({ kind: 'horizontal-line', line: this }),
            interaction: {
                selectable: true,
                draggable: this.model.draggable,
                consumePointer: true,
            },
        };
    }

    onPointerDown(): void {
        if (!this.model.draggable || this.drag !== null) return;
        this.drag = { startPrice: this.model.price };
    }

    onPointerMove(event: PrimitiveInteractionEvent): void {
        if (this.drag === null || this.context === null) return;
        const next = this.context.coordinateToPrice(event.point.y);
        if (next === null || !Number.isFinite(next)) return;
        this.assignPrice(next);
    }

    onPointerUp(): void { this.finishDrag(false); }
    onPointerCancel(): void { this.finishDrag(true); }

    private finishDrag(cancelled: boolean): void {
        const drag = this.drag;
        if (drag === null) return;
        this.drag = null;
        const finalPrice = this.model.price;
        if (cancelled) {
            this.assignPrice(drag.startPrice);
            return;
        }
        if (samePrice(drag.startPrice, finalPrice) || this.context === null) return;

        // Preview writes are not history. Rewind synchronously, then let one
        // command own the complete gesture so undo/redo remain deterministic.
        this.assignPrice(drag.startPrice, false);
        this.context.commandStack.execute({
            label: 'Move horizontal line',
            execute: () => this.assignPrice(finalPrice),
            undo: () => this.assignPrice(drag.startPrice),
            redo: () => this.assignPrice(finalPrice),
        });
    }

    private assignPrice(price: number, invalidate = true): void {
        this.model.price = price;
        this.refreshCoordinate();
        if (invalidate) this.context?.requestUpdate();
    }

    private refreshCoordinate(): void {
        this.coordinate = this.context?.priceToCoordinate(this.model.price) ?? null;
    }

    private lineCoordinate(): number | null {
        this.refreshCoordinate();
        return this.coordinate;
    }

    private axisBackground(): string { return this.model.axisLabelColor ?? this.model.color; }
    private axisTextColor(): string {
        return this.model.axisLabelTextColor ?? readableTextColor(this.axisBackground());
    }
    private axisText(): string {
        const price = this.model.priceFormatter(this.model.price);
        return this.model.title.length === 0 ? price : `${this.model.title} ${price}`;
    }

    private draw(target: Parameters<IPrimitiveRenderer['draw']>[0]): void {
        this.plot = target.pane.plot;
        const coordinate = this.lineCoordinate();
        if (coordinate === null || !Number.isFinite(coordinate)) return;
        target.useMediaCoordinateSpace(({ context }) => {
            const drawWidth = this.model.lineWidth + (this.selected ? 1 : 0);
            const y = alignStroke(coordinate, drawWidth, this.context?.pixelRatio() ?? 1);
            context.strokeStyle = this.model.color;
            context.lineWidth = drawWidth;
            context.setLineDash([...lineDash(this.model.lineStyle, this.model.lineWidth)]);
            context.beginPath();
            context.moveTo(target.pane.plot.x, y);
            context.lineTo(target.pane.plot.x + target.pane.plot.width, y);
            context.stroke();
            context.setLineDash([]);

            if (this.selected) {
                const x = target.pane.plot.x + target.pane.plot.width / 2;
                context.fillStyle = this.axisTextColor();
                context.strokeStyle = this.model.color;
                context.lineWidth = 2;
                context.beginPath();
                context.arc(x, coordinate, 4, 0, Math.PI * 2);
                context.fill();
                context.stroke();
            }
        });
    }
}

function normalizeId(value: string | undefined): string {
    if (value === undefined) return `horizontal-line-${nextHorizontalLineId++}`;
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new TypeError('sschart: horizontal line id must be a non-empty string');
    return value.trim();
}

function finitePrice(value: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value))
        throw new RangeError('sschart: horizontal line price must be finite');
    return value;
}

function color(value: string | undefined, fallback: string, name: string): string {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new TypeError(`sschart: horizontal line ${name} must be a non-empty string`);
    return value.trim();
}

function optionalColor(value: string | undefined, name: string): string | null {
    return value === undefined ? null : color(value, '', name);
}

function width(value: number | undefined, fallback: number): number {
    if (value === undefined) return fallback;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 20)
        throw new RangeError('sschart: horizontal line width must be in the (0, 20] range');
    return value;
}

function style(value: LineStyleValue | undefined, fallback: LineStyleValue): LineStyleValue {
    if (value === undefined) return fallback;
    if (!Number.isInteger(value) || value < 0 || value > 4)
        throw new RangeError('sschart: horizontal line style is invalid');
    return value;
}

function layer(
    value: PrimitiveZOrderValue | undefined,
    fallback: PrimitiveZOrderValue,
): PrimitiveZOrderValue {
    if (value === undefined) return fallback;
    if (!Object.values(PrimitiveZOrder).includes(value))
        throw new RangeError('sschart: horizontal line z-order is invalid');
    return value;
}

function text(value: string | undefined, fallback: string): string {
    if (value === undefined) return fallback;
    if (typeof value !== 'string')
        throw new TypeError('sschart: horizontal line title must be a string');
    return value;
}

function boolean(value: boolean, name: string): boolean {
    if (typeof value !== 'boolean')
        throw new TypeError(`sschart: horizontal line ${name} must be boolean`);
    return value;
}

function formatter(value: ((price: number) => string) | undefined): (price: number) => string {
    if (value === undefined) return concisePrice;
    if (typeof value !== 'function')
        throw new TypeError('sschart: horizontal line priceFormatter must be a function');
    return value;
}

function samePrice(left: number, right: number): boolean {
    return Math.abs(left - right) <= Number.EPSILON * Math.max(1, Math.abs(left), Math.abs(right));
}
