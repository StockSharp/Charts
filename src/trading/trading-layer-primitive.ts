import type {
    AutoscaleInfo,
    HitTestContext,
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
    PrimitivePaneViewClip,
    PrimitiveZOrder,
} from '../core/chart-api.js';
import { alignStroke, concisePrice, lineDash, readableTextColor } from '../primitives/drawing-utils.js';
import {
    ChartBracketRole,
    ChartOrderStatus,
    ChartOrderType,
    ChartPositionSide,
    TradingSide,
    chartOrderRemainingQuantity,
    chartPnlTotal,
    quantizeTradingPrice,
    type ChartExecution,
    type ChartOrder,
    type ChartPosition,
    type ChartQuote,
} from './model.js';
import type {
    ITradingLayer,
    TradingLayerChange,
    TradingLayerSnapshot,
    TradingIntentOutcome,
} from './trading-layer.js';
import { TradingIntentOutcomeStatus } from './trading-layer.js';

export const TradingPrimitiveEntityKind = Object.freeze({
    Order: 'order',
    Position: 'position',
    Execution: 'execution',
    Quote: 'quote',
} as const);
export type TradingPrimitiveEntityKind = typeof TradingPrimitiveEntityKind[
    keyof typeof TradingPrimitiveEntityKind
];

export const TradingQuoteKind = Object.freeze({
    Bid: 'bid',
    Ask: 'ask',
    Last: 'last',
} as const);
export type TradingQuoteKind = typeof TradingQuoteKind[keyof typeof TradingQuoteKind];

export interface TradingLayerPrimitiveOptions {
    readonly id?: string;
    readonly showOrders?: boolean;
    readonly showInactiveOrders?: boolean;
    readonly showPositions?: boolean;
    readonly showExecutions?: boolean;
    readonly showExecutionLabels?: boolean;
    readonly showQuote?: boolean;
    readonly showPnl?: boolean;
    readonly showBrackets?: boolean;
    readonly autoscale?: boolean;
    readonly orderBuyColor?: string;
    readonly orderSellColor?: string;
    readonly inactiveOrderColor?: string;
    readonly longPositionColor?: string;
    readonly shortPositionColor?: string;
    readonly executionBuyColor?: string;
    readonly executionSellColor?: string;
    readonly bidColor?: string;
    readonly askColor?: string;
    readonly lastColor?: string;
    readonly bracketColor?: string;
    readonly lineWidth?: number;
    readonly fontSize?: number;
    /** Vertical media-coordinate distance between adjacent order labels. */
    readonly orderLabelSpacing?: number;
    readonly zOrder?: PrimitiveZOrderValue;
    readonly priceFormatter?: (price: number) => string;
    readonly quantityFormatter?: (quantity: number) => string;
    readonly pnlFormatter?: (pnl: number, currency?: string) => string;
}

export type TradingLayerPrimitiveOptionsPatch = Partial<
    Omit<TradingLayerPrimitiveOptions, 'id'>
>;

export interface ResolvedTradingLayerPrimitiveOptions {
    readonly id: string;
    readonly showOrders: boolean;
    readonly showInactiveOrders: boolean;
    readonly showPositions: boolean;
    readonly showExecutions: boolean;
    readonly showExecutionLabels: boolean;
    readonly showQuote: boolean;
    readonly showPnl: boolean;
    readonly showBrackets: boolean;
    readonly autoscale: boolean;
    readonly orderBuyColor: string;
    readonly orderSellColor: string;
    readonly inactiveOrderColor: string;
    readonly longPositionColor: string;
    readonly shortPositionColor: string;
    readonly executionBuyColor: string;
    readonly executionSellColor: string;
    readonly bidColor: string;
    readonly askColor: string;
    readonly lastColor: string;
    readonly bracketColor: string;
    readonly lineWidth: number;
    readonly fontSize: number;
    readonly orderLabelSpacing: number;
    readonly zOrder: PrimitiveZOrderValue;
    readonly priceFormatter: (price: number) => string;
    readonly quantityFormatter: (quantity: number) => string;
    readonly pnlFormatter: (pnl: number, currency?: string) => string;
}

export interface TradingOrderHitData {
    readonly kind: 'trading';
    readonly entityKind: typeof TradingPrimitiveEntityKind.Order;
    readonly part: 'line' | 'label';
    readonly id: string;
    readonly order: ChartOrder;
}

export interface TradingPositionHitData {
    readonly kind: 'trading';
    readonly entityKind: typeof TradingPrimitiveEntityKind.Position;
    readonly part: 'line' | 'label';
    readonly id: string;
    readonly position: ChartPosition;
}

export interface TradingExecutionHitData {
    readonly kind: 'trading';
    readonly entityKind: typeof TradingPrimitiveEntityKind.Execution;
    readonly part: 'marker' | 'label';
    readonly id: string;
    readonly execution: ChartExecution;
}

export interface TradingQuoteHitData {
    readonly kind: 'trading';
    readonly entityKind: typeof TradingPrimitiveEntityKind.Quote;
    readonly part: 'line';
    readonly id: TradingQuoteKind;
    readonly quoteKind: TradingQuoteKind;
    readonly quote: ChartQuote;
    readonly price: number;
}

export type TradingPrimitiveHitData =
    | TradingOrderHitData
    | TradingPositionHitData
    | TradingExecutionHitData
    | TradingQuoteHitData;

interface TradingPrimitiveModel extends Omit<ResolvedTradingLayerPrimitiveOptions, 'id'> {}
interface Rect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

interface RenderedOrder {
    readonly entityKind: typeof TradingPrimitiveEntityKind.Order;
    readonly order: ChartOrder;
    readonly y: number;
    readonly label: Rect;
}

interface OrderRenderCandidate {
    readonly order: ChartOrder;
    readonly price: number;
    readonly y: number;
    readonly color: string;
    readonly style: LineStyleValue;
    readonly text: string;
}

interface OrderPricePreview {
    readonly price: number;
    readonly canonicalOrder: ChartOrder;
    readonly state: 'dragging' | 'pending' | 'accepted';
    readonly intentId?: string;
}

interface OrderDrag {
    readonly orderId: string;
}

interface RenderedPosition {
    readonly entityKind: typeof TradingPrimitiveEntityKind.Position;
    readonly position: ChartPosition;
    readonly y: number;
    readonly label: Rect;
}

interface RenderedExecution {
    readonly entityKind: typeof TradingPrimitiveEntityKind.Execution;
    readonly execution: ChartExecution;
    readonly x: number;
    readonly y: number;
    readonly radius: number;
    readonly label: Rect | null;
}

interface RenderedQuote {
    readonly entityKind: typeof TradingPrimitiveEntityKind.Quote;
    readonly quote: ChartQuote;
    readonly quoteKind: TradingQuoteKind;
    readonly price: number;
    readonly y: number;
}

type RenderedEntity = RenderedOrder | RenderedPosition | RenderedExecution | RenderedQuote;

const ACTIVE_ORDER_STATUSES: ReadonlySet<string> = new Set([
    ChartOrderStatus.Pending,
    ChartOrderStatus.Working,
    ChartOrderStatus.PartiallyFilled,
]);

let nextTradingPrimitiveId = 1;

/** Read-only renderer for canonical TradingLayer state. Interaction emits intents in a separate layer. */
export class TradingLayerPrimitive implements IChartPrimitive {
    private readonly stableId: string;
    private readonly model: TradingPrimitiveModel;
    private context: PrimitiveAttachedContext | null = null;
    private snapshot: TradingLayerSnapshot;
    private plot: PrimitiveRect | null = null;
    private rendered: readonly RenderedEntity[] = Object.freeze([]);
    private axisViews: readonly PrimitiveAxisView[] = Object.freeze([]);
    private readonly orderLabelOffsets = new Map<string, number>();
    private readonly orderPreviews = new Map<string, OrderPricePreview>();
    private drag: OrderDrag | null = null;
    private readonly renderer: IPrimitiveRenderer = { draw: target => this.draw(target) };
    private readonly paneView: PrimitivePaneView = {
        zOrder: () => this.model.zOrder,
        clip: () => PrimitivePaneViewClip.Plot,
        renderer: () => this.renderer,
    };
    private readonly stateListener = (_change: TradingLayerChange): void => {
        const next = this.layer.state();
        for (const [id, preview] of this.orderPreviews) {
            const current = next.orders.find(order => order.id === id);
            if (preview.state === 'dragging') {
                if (current === undefined || current !== preview.canonicalOrder) {
                    this.orderPreviews.delete(id);
                    if (this.drag?.orderId === id) this.drag = null;
                }
                continue;
            }
            if (current === undefined || current !== preview.canonicalOrder)
                this.orderPreviews.delete(id);
        }
        this.snapshot = next;
        this.pruneOrderLayout();
        this.rebuildAxisViews();
        this.context?.requestUpdate();
    };
    private readonly outcomeListener = (outcome: TradingIntentOutcome): void => {
        for (const [id, preview] of this.orderPreviews) {
            if (preview.intentId !== outcome.intentId) continue;
            if (outcome.status === TradingIntentOutcomeStatus.Rejected) {
                this.orderPreviews.delete(id);
            } else {
                this.orderPreviews.set(id, Object.freeze({ ...preview, state: 'accepted' }));
            }
            this.context?.requestUpdate();
            return;
        }
    };

    constructor(
        private readonly layer: ITradingLayer,
        options: TradingLayerPrimitiveOptions = {},
    ) {
        if (!tradingLayer(layer))
            throw new TypeError('sschart: trading layer primitive requires ITradingLayer');
        if (!plainObject(options))
            throw new TypeError('sschart: trading layer primitive options must be an object');
        this.stableId = id(options.id);
        this.model = { ...normalizeOptions(options, defaultModel()) };
        this.snapshot = layer.state();
        this.rebuildAxisViews();
    }

    id(): string { return this.stableId; }

    options(): ResolvedTradingLayerPrimitiveOptions {
        return Object.freeze({ id: this.stableId, ...this.model });
    }

    applyOptions(patch: TradingLayerPrimitiveOptionsPatch): void {
        if (!plainObject(patch))
            throw new TypeError('sschart: trading layer primitive options patch must be an object');
        if ('id' in patch)
            throw new TypeError('sschart: trading layer primitive id cannot be changed');
        const next = normalizeOptions(patch, this.model);
        Object.assign(this.model, next);
        this.rebuildAxisViews();
        this.context?.requestUpdate();
    }

    attached(context: PrimitiveAttachedContext): void {
        this.context = context;
        this.snapshot = this.layer.state();
        this.rebuildAxisViews();
        const unsubscribe = this.layer.subscribeChanges(this.stateListener);
        context.addDisposable(unsubscribe);
        const unsubscribeOutcomes = this.layer.subscribeIntentOutcomes(this.outcomeListener);
        context.addDisposable(unsubscribeOutcomes);
    }

    detached(): void {
        this.context = null;
        this.plot = null;
        this.rendered = Object.freeze([]);
        this.axisViews = Object.freeze([]);
        this.orderLabelOffsets.clear();
        this.orderPreviews.clear();
        this.drag = null;
    }

    updateAllViews(): void { this.rebuildAxisViews(); }
    paneViews(): readonly PrimitivePaneView[] { return [this.paneView]; }
    priceAxisViews(): readonly PrimitiveAxisView[] { return this.axisViews; }

    autoscaleInfo(_range: LogicalRange): AutoscaleInfo | null {
        if (!this.model.autoscale) return null;
        const prices: number[] = [];
        if (this.model.showOrders) {
            for (const order of this.visibleOrders()) {
                const value = this.orderPreviews.get(order.id)?.price ?? orderDisplayPrice(order);
                if (value !== null) prices.push(value);
            }
        }
        if (this.model.showPositions) {
            for (const position of this.snapshot.positions) prices.push(position.averagePrice);
        }
        if (this.model.showQuote && this.snapshot.quote !== null) {
            for (const value of quotePrices(this.snapshot.quote).map(item => item.price))
                prices.push(value);
        }
        if (prices.length === 0) return null;
        return Object.freeze({
            priceRange: Object.freeze({ min: Math.min(...prices), max: Math.max(...prices) }),
            margins: Object.freeze({ above: 8, below: 8 }),
        });
    }

    hitTest(point: Readonly<{ x: number; y: number }>, context: HitTestContext): PrimitiveHit | null {
        if (context.location !== PrimitiveHitTestLocation.Pane || this.plot === null) return null;
        if (!contains(this.plot, point)) return null;
        for (const item of [...this.rendered].reverse()) {
            const hit = this.hitRendered(item, point, 'label');
            if (hit !== null) return hit;
        }
        for (const item of [...this.rendered].reverse()) {
            const hit = this.hitRendered(item, point, 'body');
            if (hit !== null) return hit;
        }
        return null;
    }

    onPointerDown(event: PrimitiveInteractionEvent): void {
        const data = event.hit.data;
        if (!isTradingPrimitiveHitData(data)
            || data.entityKind !== TradingPrimitiveEntityKind.Order) return;
        const order = this.snapshot.orders.find(item => item.id === data.id);
        if (!this.orderDraggable(order)) return;
        const currentPrice = orderDisplayPrice(order as ChartOrder);
        if (currentPrice === null) return;
        this.drag = Object.freeze({ orderId: (order as ChartOrder).id });
        this.orderPreviews.set((order as ChartOrder).id, Object.freeze({
            price: currentPrice,
            canonicalOrder: order as ChartOrder,
            state: 'dragging',
        }));
        this.context?.requestUpdate();
    }

    onPointerMove(event: PrimitiveInteractionEvent): void {
        const drag = this.drag;
        const context = this.context;
        const plot = this.plot;
        if (drag === null || context === null || plot === null) return;
        const y = Math.max(plot.y, Math.min(plot.y + plot.height, event.point.y));
        const raw = context.coordinateToPrice(y);
        if (raw === null || !Number.isFinite(raw)) return;
        const current = this.orderPreviews.get(drag.orderId);
        if (current === undefined) return;
        const price = quantizeTradingPrice(raw, this.layer.normalizationOptions());
        if (price === current.price) return;
        this.orderPreviews.set(drag.orderId, Object.freeze({ ...current, price }));
        context.requestUpdate();
    }

    onPointerUp(): void {
        const drag = this.drag;
        if (drag === null) return;
        this.drag = null;
        const preview = this.orderPreviews.get(drag.orderId);
        const order = this.snapshot.orders.find(item => item.id === drag.orderId);
        const canonicalPrice = order === undefined ? null : orderDisplayPrice(order);
        if (preview === undefined || order === undefined || canonicalPrice === null
            || preview.price === canonicalPrice) {
            this.orderPreviews.delete(drag.orderId);
            this.context?.requestUpdate();
            return;
        }
        try {
            const intent = this.layer.requestModifyOrder(
                order.id,
                order.type === ChartOrderType.Limit
                    ? { price: preview.price }
                    : { stopPrice: preview.price },
            );
            const remainsPending = this.layer.pendingIntents()
                .some(item => item.intentId === intent.intentId);
            if (remainsPending) {
                this.orderPreviews.set(order.id, Object.freeze({
                    price: preview.price,
                    canonicalOrder: order,
                    state: 'pending',
                    intentId: intent.intentId,
                }));
            } else {
                this.orderPreviews.delete(order.id);
            }
            this.context?.requestUpdate();
        } catch (error) {
            this.orderPreviews.delete(order.id);
            this.context?.requestUpdate();
            throw error;
        }
    }

    onPointerCancel(): void {
        const drag = this.drag;
        if (drag === null) return;
        this.drag = null;
        this.orderPreviews.delete(drag.orderId);
        this.context?.requestUpdate();
    }

    private hitRendered(
        item: RenderedEntity,
        point: Readonly<{ x: number; y: number }>,
        phase: 'label' | 'body',
    ): PrimitiveHit | null {
        if (item.entityKind === TradingPrimitiveEntityKind.Execution) {
            const inLabel = item.label !== null && contains(item.label, point);
            if (phase === 'label' ? !inLabel
                : inLabel || Math.hypot(point.x - item.x, point.y - item.y) > item.radius + 4) {
                return null;
            }
            const data: TradingExecutionHitData = Object.freeze({
                kind: 'trading',
                entityKind: TradingPrimitiveEntityKind.Execution,
                part: inLabel ? 'label' : 'marker',
                id: item.execution.id,
                execution: item.execution,
            });
            return hoverHit(`${this.stableId}:execution:${item.execution.id}`, data, this.model.zOrder);
        }
        if (item.entityKind === TradingPrimitiveEntityKind.Order) {
            const inLabel = contains(item.label, point);
            if (phase === 'label' ? !inLabel : inLabel || Math.abs(point.y - item.y) > 6)
                return null;
            const data: TradingOrderHitData = Object.freeze({
                kind: 'trading',
                entityKind: TradingPrimitiveEntityKind.Order,
                part: inLabel ? 'label' : 'line',
                id: item.order.id,
                order: item.order,
            });
            const draggable = this.orderDraggable(item.order);
            return hoverHit(
                `${this.stableId}:order:${item.order.id}`,
                data,
                this.model.zOrder,
                draggable ? 'ns-resize' : 'default',
                draggable,
            );
        }
        if (item.entityKind === TradingPrimitiveEntityKind.Position) {
            const inLabel = contains(item.label, point);
            if (phase === 'label' ? !inLabel : inLabel || Math.abs(point.y - item.y) > 6)
                return null;
            const data: TradingPositionHitData = Object.freeze({
                kind: 'trading',
                entityKind: TradingPrimitiveEntityKind.Position,
                part: inLabel ? 'label' : 'line',
                id: item.position.id,
                position: item.position,
            });
            return hoverHit(`${this.stableId}:position:${item.position.id}`, data, this.model.zOrder);
        }
        if (phase === 'label' || Math.abs(point.y - item.y) > 5) return null;
        const data: TradingQuoteHitData = Object.freeze({
            kind: 'trading',
            entityKind: TradingPrimitiveEntityKind.Quote,
            part: 'line',
            id: item.quoteKind,
            quoteKind: item.quoteKind,
            quote: item.quote,
            price: item.price,
        });
        return hoverHit(`${this.stableId}:quote:${item.quoteKind}`, data, this.model.zOrder);
    }

    private draw(target: Parameters<IPrimitiveRenderer['draw']>[0]): void {
        this.plot = target.pane.plot;
        target.useMediaCoordinateSpace(({ context }) => this.drawMedia(context, target.pane.plot));
    }

    private drawMedia(canvas: CanvasRenderingContext2D, plot: PrimitiveRect): void {
        const context = this.context;
        if (context === null) {
            this.rendered = Object.freeze([]);
            return;
        }
        const rendered: RenderedEntity[] = [];
        canvas.font = `${this.model.fontSize}px ${context.theme().fontFamily}`;
        canvas.textBaseline = 'middle';
        canvas.textAlign = 'left';

        if (this.model.showQuote && this.snapshot.quote !== null)
            this.drawQuote(canvas, plot, this.snapshot.quote, rendered);
        if (this.model.showPositions)
            this.drawPositions(canvas, plot, rendered);
        if (this.model.showOrders)
            this.drawOrders(canvas, plot, rendered);
        if (this.model.showExecutions)
            this.drawExecutions(canvas, plot, rendered);
        this.rendered = Object.freeze(rendered);
    }

    private drawQuote(
        canvas: CanvasRenderingContext2D,
        plot: PrimitiveRect,
        quote: ChartQuote,
        rendered: RenderedEntity[],
    ): void {
        for (const item of quotePrices(quote)) {
            const y = this.coordinate(item.price);
            if (y === null || y < plot.y || y > plot.y + plot.height) continue;
            const color = quoteColor(item.kind, this.model);
            drawLine(
                canvas,
                plot,
                y,
                color,
                1,
                item.kind === TradingQuoteKind.Last ? 0 : 2,
                this.context?.pixelRatio() ?? 1,
            );
            rendered.push(Object.freeze({
                entityKind: TradingPrimitiveEntityKind.Quote,
                quote,
                quoteKind: item.kind,
                price: item.price,
                y,
            }));
        }
    }

    private drawPositions(
        canvas: CanvasRenderingContext2D,
        plot: PrimitiveRect,
        rendered: RenderedEntity[],
    ): void {
        for (const position of this.snapshot.positions) {
            const y = this.coordinate(position.averagePrice);
            if (y === null || y < plot.y || y > plot.y + plot.height) continue;
            const color = position.side === ChartPositionSide.Long
                ? this.model.longPositionColor : this.model.shortPositionColor;
            drawLine(
                canvas,
                plot,
                y,
                color,
                this.model.lineWidth,
                2,
                this.context?.pixelRatio() ?? 1,
            );
            const label = drawLabel(
                canvas,
                plot,
                y,
                this.positionLabel(position),
                color,
                'left',
            );
            rendered.push(Object.freeze({
                entityKind: TradingPrimitiveEntityKind.Position,
                position,
                y,
                label,
            }));
        }
    }

    private drawOrders(
        canvas: CanvasRenderingContext2D,
        plot: PrimitiveRect,
        rendered: RenderedEntity[],
    ): void {
        const candidates: OrderRenderCandidate[] = [];
        for (const order of this.visibleOrders()) {
            const displayPrice = this.orderPreviews.get(order.id)?.price ?? orderDisplayPrice(order);
            if (displayPrice === null) continue;
            const y = this.coordinate(displayPrice);
            if (y === null || y < plot.y || y > plot.y + plot.height) continue;
            const active = ACTIVE_ORDER_STATUSES.has(order.status);
            const color = active
                ? order.side === TradingSide.Buy
                    ? this.model.orderBuyColor : this.model.orderSellColor
                : this.model.inactiveOrderColor;
            const style: LineStyleValue = order.type === ChartOrderType.Stop
                || order.type === ChartOrderType.StopLimit ? 2 : 0;
            candidates.push(Object.freeze({
                order,
                price: displayPrice,
                y,
                color,
                style,
                text: this.orderLabel(order, displayPrice, this.orderPreviews.get(order.id)),
            }));
        }
        const displayCoordinates = layoutOrderLabels(
            candidates,
            plot,
            this.model.orderLabelSpacing,
            this.orderLabelOffsets,
        );
        for (const candidate of candidates) {
            const { order, y, color, style } = candidate;
            drawLine(
                canvas,
                plot,
                y,
                color,
                this.model.lineWidth,
                style,
                this.context?.pixelRatio() ?? 1,
            );
            const displayY = displayCoordinates.get(order.id) ?? y;
            this.orderLabelOffsets.set(order.id, displayY - y);
            if (Math.abs(displayY - y) > 3)
                drawLabelConnector(canvas, plot, y, displayY, color);
            const label = drawLabel(
                canvas,
                plot,
                displayY,
                candidate.text,
                color,
                'right',
            );
            rendered.push(Object.freeze({
                entityKind: TradingPrimitiveEntityKind.Order,
                order,
                y,
                label,
            }));
        }
        if (this.model.showBrackets) this.drawBracketGroups(canvas, plot, candidates);
    }

    private drawBracketGroups(
        canvas: CanvasRenderingContext2D,
        plot: PrimitiveRect,
        candidates: readonly OrderRenderCandidate[],
    ): void {
        const groups = new Map<string, OrderRenderCandidate[]>();
        for (const candidate of candidates) {
            const groupId = candidate.order.bracket?.groupId;
            if (groupId === undefined) continue;
            const group = groups.get(groupId) ?? [];
            group.push(candidate);
            groups.set(groupId, group);
        }
        const ratio = this.context?.pixelRatio() ?? 1;
        const x = alignStroke(plot.x + 9, 1, ratio);
        for (const group of groups.values()) {
            if (group.length < 2) continue;
            const coordinates = group.map(item => item.y).sort((left, right) => left - right);
            const top = Math.max(plot.y, coordinates[0]);
            const bottom = Math.min(plot.y + plot.height, coordinates[coordinates.length - 1]);
            canvas.strokeStyle = this.model.bracketColor;
            canvas.lineWidth = 1;
            canvas.setLineDash([]);
            canvas.beginPath();
            canvas.moveTo(x, top);
            canvas.lineTo(x, bottom);
            for (const y of coordinates) {
                canvas.moveTo(x, y);
                canvas.lineTo(x + 7, y);
            }
            canvas.stroke();
        }
    }

    private drawExecutions(
        canvas: CanvasRenderingContext2D,
        plot: PrimitiveRect,
        rendered: RenderedEntity[],
    ): void {
        const context = this.context as PrimitiveAttachedContext;
        for (const execution of this.snapshot.executions) {
            const x = context.timeToCoordinate(execution.time);
            const y = this.coordinate(execution.price);
            if (x === null || y === null || x < plot.x || x > plot.x + plot.width
                || y < plot.y || y > plot.y + plot.height) continue;
            const color = execution.side === TradingSide.Buy
                ? this.model.executionBuyColor : this.model.executionSellColor;
            const radius = 5;
            drawExecutionMarker(canvas, x, y, radius, color, execution.side);
            let label: Rect | null = null;
            if (this.model.showExecutionLabels) {
                const text = `${sideText(execution.side)} ${this.model.quantityFormatter(execution.quantity)}`
                    + ` @ ${this.model.priceFormatter(execution.price)}`;
                label = drawFloatingLabel(canvas, plot, x + 7, y, text, color);
            }
            rendered.push(Object.freeze({
                entityKind: TradingPrimitiveEntityKind.Execution,
                execution,
                x,
                y,
                radius,
                label,
            }));
        }
    }

    private orderLabel(
        order: ChartOrder,
        displayPrice: number,
        preview?: OrderPricePreview,
    ): string {
        const remaining = chartOrderRemainingQuantity(order);
        const quantity = order.filledQuantity > 0
            ? `${this.model.quantityFormatter(remaining)}/${this.model.quantityFormatter(order.quantity)}`
            : this.model.quantityFormatter(order.quantity);
        let priceText = this.model.priceFormatter(displayPrice);
        if (order.type === ChartOrderType.StopLimit && order.price !== undefined)
            priceText += ` → ${this.model.priceFormatter(order.price)}`;
        const bracket = order.bracket === undefined ? '' : `${bracketRoleText(order.bracket.role)} `;
        const prefix = order.label === undefined || order.label.length === 0 ? '' : `${order.label} `;
        const state = preview === undefined ? order.status : preview.state.toUpperCase();
        return `${prefix}${bracket}${sideText(order.side)} ${quantity} @ ${priceText} ${state}`;
    }

    private positionLabel(position: ChartPosition): string {
        const side = position.side === ChartPositionSide.Long ? 'LONG' : 'SHORT';
        const prefix = position.label === undefined || position.label.length === 0
            ? '' : `${position.label} `;
        let result = `${prefix}${side} ${this.model.quantityFormatter(position.quantity)}`
            + ` @ ${this.model.priceFormatter(position.averagePrice)}`;
        if (this.model.showPnl && position.pnl !== undefined) {
            result += ` P&L ${this.model.pnlFormatter(
                chartPnlTotal(position.pnl),
                position.pnl.currency,
            )}`;
        }
        return result;
    }

    private visibleOrders(): readonly ChartOrder[] {
        return this.model.showInactiveOrders
            ? this.snapshot.orders
            : this.snapshot.orders.filter(order => ACTIVE_ORDER_STATUSES.has(order.status));
    }

    private orderDraggable(order: ChartOrder | undefined): boolean {
        return this.canonicalOrderDraggable(order)
            && !this.orderPreviews.has((order as ChartOrder).id);
    }

    private canonicalOrderDraggable(order: ChartOrder | undefined): order is ChartOrder {
        return order !== undefined
            && ACTIVE_ORDER_STATUSES.has(order.status)
            && order.permissions?.canModify === true
            && order.type !== ChartOrderType.Market;
    }

    private coordinate(price: number): number | null {
        const result = this.context?.priceToCoordinate(price) ?? null;
        return result !== null && Number.isFinite(result) ? result : null;
    }

    private rebuildAxisViews(): void {
        const quote = this.model.showQuote ? this.snapshot.quote : null;
        if (quote === null) {
            this.axisViews = Object.freeze([]);
            return;
        }
        this.axisViews = Object.freeze(quotePrices(quote).map(item => Object.freeze({
            coordinate: (): number | null => this.coordinate(item.price),
            text: (): string => `${item.kind.toUpperCase()} ${this.model.priceFormatter(item.price)}`
                + (item.size === undefined ? '' : ` × ${this.model.quantityFormatter(item.size)}`),
            backgroundColor: (): string => quoteColor(item.kind, this.model),
            textColor: (): string => readableTextColor(quoteColor(item.kind, this.model)),
            visible: (): boolean => this.model.showQuote,
            tickVisible: (): boolean => true,
        })));
    }

    private pruneOrderLayout(): void {
        const ids = new Set(this.snapshot.orders.map(order => order.id));
        for (const id of this.orderLabelOffsets.keys()) {
            if (!ids.has(id)) this.orderLabelOffsets.delete(id);
        }
        for (const id of this.orderPreviews.keys()) {
            if (!ids.has(id)) this.orderPreviews.delete(id);
        }
        if (this.drag !== null && !ids.has(this.drag.orderId)) this.drag = null;
    }
}

export function isTradingPrimitiveHitData(value: unknown): value is TradingPrimitiveHitData {
    return value !== null && typeof value === 'object'
        && (value as { kind?: unknown }).kind === 'trading'
        && Object.values(TradingPrimitiveEntityKind).includes(
            (value as { entityKind?: TradingPrimitiveEntityKind }).entityKind as TradingPrimitiveEntityKind,
        );
}

function defaultModel(): TradingPrimitiveModel {
    return Object.freeze({
        showOrders: true,
        showInactiveOrders: false,
        showPositions: true,
        showExecutions: true,
        showExecutionLabels: true,
        showQuote: true,
        showPnl: true,
        showBrackets: true,
        autoscale: false,
        orderBuyColor: '#2962ff',
        orderSellColor: '#ef5350',
        inactiveOrderColor: '#78909c',
        longPositionColor: '#00a97f',
        shortPositionColor: '#f23645',
        executionBuyColor: '#26a69a',
        executionSellColor: '#ef5350',
        bidColor: '#2962ff',
        askColor: '#ef5350',
        lastColor: '#ab47bc',
        bracketColor: '#7e57c2',
        lineWidth: 1.5,
        fontSize: 11,
        orderLabelSpacing: 19,
        zOrder: PrimitiveZOrder.Top,
        priceFormatter: concisePrice,
        quantityFormatter: conciseNumber,
        pnlFormatter: signedPnl,
    });
}

function normalizeOptions(
    value: TradingLayerPrimitiveOptionsPatch | TradingLayerPrimitiveOptions,
    base: TradingPrimitiveModel,
): TradingPrimitiveModel {
    return Object.freeze({
        showOrders: bool(value.showOrders, base.showOrders, 'showOrders'),
        showInactiveOrders: bool(
            value.showInactiveOrders,
            base.showInactiveOrders,
            'showInactiveOrders',
        ),
        showPositions: bool(value.showPositions, base.showPositions, 'showPositions'),
        showExecutions: bool(value.showExecutions, base.showExecutions, 'showExecutions'),
        showExecutionLabels: bool(
            value.showExecutionLabels,
            base.showExecutionLabels,
            'showExecutionLabels',
        ),
        showQuote: bool(value.showQuote, base.showQuote, 'showQuote'),
        showPnl: bool(value.showPnl, base.showPnl, 'showPnl'),
        showBrackets: bool(value.showBrackets, base.showBrackets, 'showBrackets'),
        autoscale: bool(value.autoscale, base.autoscale, 'autoscale'),
        orderBuyColor: color(value.orderBuyColor, base.orderBuyColor, 'orderBuyColor'),
        orderSellColor: color(value.orderSellColor, base.orderSellColor, 'orderSellColor'),
        inactiveOrderColor: color(
            value.inactiveOrderColor,
            base.inactiveOrderColor,
            'inactiveOrderColor',
        ),
        longPositionColor: color(
            value.longPositionColor,
            base.longPositionColor,
            'longPositionColor',
        ),
        shortPositionColor: color(
            value.shortPositionColor,
            base.shortPositionColor,
            'shortPositionColor',
        ),
        executionBuyColor: color(
            value.executionBuyColor,
            base.executionBuyColor,
            'executionBuyColor',
        ),
        executionSellColor: color(
            value.executionSellColor,
            base.executionSellColor,
            'executionSellColor',
        ),
        bidColor: color(value.bidColor, base.bidColor, 'bidColor'),
        askColor: color(value.askColor, base.askColor, 'askColor'),
        lastColor: color(value.lastColor, base.lastColor, 'lastColor'),
        bracketColor: color(value.bracketColor, base.bracketColor, 'bracketColor'),
        lineWidth: numberInRange(value.lineWidth, base.lineWidth, 0.5, 8, 'lineWidth'),
        fontSize: numberInRange(value.fontSize, base.fontSize, 8, 32, 'fontSize'),
        orderLabelSpacing: numberInRange(
            value.orderLabelSpacing,
            base.orderLabelSpacing,
            12,
            48,
            'orderLabelSpacing',
        ),
        zOrder: zOrder(value.zOrder, base.zOrder),
        priceFormatter: formatter(value.priceFormatter, base.priceFormatter, 'priceFormatter'),
        quantityFormatter: formatter(
            value.quantityFormatter,
            base.quantityFormatter,
            'quantityFormatter',
        ),
        pnlFormatter: pnlFormatter(value.pnlFormatter, base.pnlFormatter),
    });
}

function orderDisplayPrice(order: ChartOrder): number | null {
    switch (order.type) {
        case ChartOrderType.Market:
            return order.averageFillPrice ?? null;
        case ChartOrderType.Limit:
            return order.price ?? null;
        case ChartOrderType.Stop:
        case ChartOrderType.StopLimit:
            return order.stopPrice ?? null;
    }
}

function quotePrices(quote: ChartQuote): readonly {
    readonly kind: TradingQuoteKind;
    readonly price: number;
    readonly size?: number;
}[] {
    const values: { kind: TradingQuoteKind; price: number; size?: number }[] = [];
    if (quote.bidPrice !== undefined)
        values.push(Object.freeze({
            kind: TradingQuoteKind.Bid,
            price: quote.bidPrice,
            ...(quote.bidSize === undefined ? {} : { size: quote.bidSize }),
        }));
    if (quote.askPrice !== undefined)
        values.push(Object.freeze({
            kind: TradingQuoteKind.Ask,
            price: quote.askPrice,
            ...(quote.askSize === undefined ? {} : { size: quote.askSize }),
        }));
    if (quote.lastPrice !== undefined)
        values.push(Object.freeze({
            kind: TradingQuoteKind.Last,
            price: quote.lastPrice,
            ...(quote.lastSize === undefined ? {} : { size: quote.lastSize }),
        }));
    return Object.freeze(values);
}

function quoteColor(kind: TradingQuoteKind, model: TradingPrimitiveModel): string {
    switch (kind) {
        case TradingQuoteKind.Bid: return model.bidColor;
        case TradingQuoteKind.Ask: return model.askColor;
        case TradingQuoteKind.Last: return model.lastColor;
    }
}

function layoutOrderLabels(
    candidates: readonly OrderRenderCandidate[],
    plot: PrimitiveRect,
    requestedSpacing: number,
    previousOffsets: ReadonlyMap<string, number>,
): ReadonlyMap<string, number> {
    if (candidates.length === 0) return new Map();
    const halfHeight = 9;
    const min = plot.y + halfHeight;
    const max = plot.y + plot.height - halfHeight;
    const spacing = candidates.length < 2
        ? requestedSpacing
        : Math.min(requestedSpacing, Math.max(2, (max - min) / (candidates.length - 1)));
    const ordered = [...candidates].sort((left, right) => {
        if (left.y !== right.y) return left.y - right.y;
        const previousLeft = left.y + (previousOffsets.get(left.order.id) ?? 0);
        const previousRight = right.y + (previousOffsets.get(right.order.id) ?? 0);
        if (previousLeft !== previousRight) return previousLeft - previousRight;
        return left.order.id < right.order.id ? -1 : left.order.id > right.order.id ? 1 : 0;
    });
    const targets = ordered.map(candidate => Math.max(min, Math.min(max, candidate.y)));
    for (let pass = 0; pass < Math.max(4, candidates.length * 2); pass++) {
        let moved = false;
        for (let index = 0; index < targets.length - 1; index++) {
            const gap = targets[index + 1] - targets[index];
            if (gap >= spacing - 1e-9) continue;
            const half = (spacing - gap) / 2;
            targets[index] -= half;
            targets[index + 1] += half;
            moved = true;
        }
        if (targets[0] < min) {
            const shift = min - targets[0];
            for (let index = 0; index < targets.length; index++) targets[index] += shift;
            moved = true;
        }
        const last = targets.length - 1;
        if (targets[last] > max) {
            const shift = targets[last] - max;
            for (let index = 0; index < targets.length; index++) targets[index] -= shift;
            moved = true;
        }
        if (!moved) break;
    }
    const result = new Map<string, number>();
    for (let index = 0; index < ordered.length; index++)
        result.set(ordered[index].order.id, targets[index]);
    return result;
}

function drawLabelConnector(
    context: CanvasRenderingContext2D,
    plot: PrimitiveRect,
    lineY: number,
    labelY: number,
    color: string,
): void {
    const x = plot.x + plot.width - 2;
    context.strokeStyle = color;
    context.lineWidth = 1;
    context.setLineDash([2, 2]);
    context.beginPath();
    context.moveTo(x - 7, lineY);
    context.lineTo(x, lineY);
    context.lineTo(x, labelY);
    context.stroke();
    context.setLineDash([]);
}

function drawLine(
    context: CanvasRenderingContext2D,
    plot: PrimitiveRect,
    coordinate: number,
    color: string,
    width: number,
    style: LineStyleValue,
    pixelRatio: number,
): void {
    const y = alignStroke(coordinate, width, pixelRatio);
    context.strokeStyle = color;
    context.lineWidth = width;
    context.setLineDash([...lineDash(style, width)]);
    context.beginPath();
    context.moveTo(plot.x, y);
    context.lineTo(plot.x + plot.width, y);
    context.stroke();
    context.setLineDash([]);
}

function drawLabel(
    context: CanvasRenderingContext2D,
    plot: PrimitiveRect,
    y: number,
    text: string,
    background: string,
    side: 'left' | 'right',
): Rect {
    const height = 18;
    const width = Math.ceil(context.measureText(text).width) + 10;
    const x = side === 'left' ? plot.x : Math.max(plot.x, plot.x + plot.width - width);
    const top = Math.max(plot.y, Math.min(plot.y + plot.height - height, y - height / 2));
    context.fillStyle = background;
    context.fillRect(x, top, width, height);
    context.fillStyle = readableTextColor(background);
    context.fillText(text, x + 5, top + height / 2 + 0.5);
    return Object.freeze({ x, y: top, width, height });
}

function drawFloatingLabel(
    context: CanvasRenderingContext2D,
    plot: PrimitiveRect,
    desiredX: number,
    y: number,
    text: string,
    background: string,
): Rect {
    const height = 17;
    const width = Math.ceil(context.measureText(text).width) + 8;
    const x = Math.max(plot.x, Math.min(plot.x + plot.width - width, desiredX));
    const top = Math.max(plot.y, Math.min(plot.y + plot.height - height, y - height / 2));
    context.fillStyle = background;
    context.fillRect(x, top, width, height);
    context.fillStyle = readableTextColor(background);
    context.fillText(text, x + 4, top + height / 2 + 0.5);
    return Object.freeze({ x, y: top, width, height });
}

function drawExecutionMarker(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    color: string,
    side: TradingSide,
): void {
    context.fillStyle = color;
    context.beginPath();
    if (side === TradingSide.Buy) {
        context.moveTo(x, y - radius);
        context.lineTo(x + radius, y + radius);
        context.lineTo(x - radius, y + radius);
    } else {
        context.moveTo(x, y + radius);
        context.lineTo(x + radius, y - radius);
        context.lineTo(x - radius, y - radius);
    }
    context.closePath();
    context.fill();
}

function hoverHit(
    id: string,
    data: TradingPrimitiveHitData,
    zOrderValue: PrimitiveZOrderValue,
    cursor = 'default',
    draggable = false,
): PrimitiveHit {
    return Object.freeze({
        id,
        role: data.part === 'label' ? PrimitiveHitTestRole.Label : PrimitiveHitTestRole.Body,
        cursor,
        zOrder: zOrderValue,
        data,
        interaction: Object.freeze({
            selectable: false,
            draggable,
            consumePointer: draggable,
        }),
    });
}

function contains(rect: Rect | PrimitiveRect, point: Readonly<{ x: number; y: number }>): boolean {
    return point.x >= rect.x && point.x <= rect.x + rect.width
        && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function sideText(side: TradingSide): string {
    return side === TradingSide.Buy ? 'BUY' : 'SELL';
}

function bracketRoleText(role: ChartBracketRole): string {
    switch (role) {
        case ChartBracketRole.Entry: return 'ENTRY';
        case ChartBracketRole.StopLoss: return 'SL';
        case ChartBracketRole.TakeProfit: return 'TP';
    }
}

function conciseNumber(value: number): string {
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
}

function signedPnl(value: number, currency?: string): string {
    const formatted = `${value > 0 ? '+' : ''}${conciseNumber(value)}`;
    return currency === undefined ? formatted : `${formatted} ${currency}`;
}

function id(value: unknown): string {
    if (value === undefined) return `trading-layer-${nextTradingPrimitiveId++}`;
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new TypeError('sschart: trading layer primitive id must be a non-empty string');
    return value.trim();
}

function bool(value: unknown, fallback: boolean, name: string): boolean {
    if (value === undefined) return fallback;
    if (typeof value !== 'boolean')
        throw new TypeError(`sschart: trading layer primitive ${name} must be boolean`);
    return value;
}

function color(value: unknown, fallback: string, name: string): string {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new TypeError(`sschart: trading layer primitive ${name} must be a color string`);
    return value.trim();
}

function numberInRange(
    value: unknown,
    fallback: number,
    min: number,
    max: number,
    name: string,
): number {
    if (value === undefined) return fallback;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
        throw new RangeError(
            `sschart: trading layer primitive ${name} must be between ${min} and ${max}`,
        );
    }
    return value;
}

function zOrder(
    value: unknown,
    fallback: PrimitiveZOrderValue,
): PrimitiveZOrderValue {
    if (value === undefined) return fallback;
    if (!Object.values(PrimitiveZOrder).includes(value as PrimitiveZOrderValue))
        throw new TypeError('sschart: trading layer primitive zOrder is invalid');
    return value as PrimitiveZOrderValue;
}

function formatter(
    value: unknown,
    fallback: (value: number) => string,
    name: string,
): (value: number) => string {
    if (value === undefined) return fallback;
    if (typeof value !== 'function')
        throw new TypeError(`sschart: trading layer primitive ${name} must be a function`);
    return value as (value: number) => string;
}

function pnlFormatter(
    value: unknown,
    fallback: (value: number, currency?: string) => string,
): (value: number, currency?: string) => string {
    if (value === undefined) return fallback;
    if (typeof value !== 'function')
        throw new TypeError('sschart: trading layer primitive pnlFormatter must be a function');
    return value as (value: number, currency?: string) => string;
}

function tradingLayer(value: unknown): value is ITradingLayer {
    return value !== null && typeof value === 'object'
        && typeof (value as ITradingLayer).state === 'function'
        && typeof (value as ITradingLayer).normalizationOptions === 'function'
        && typeof (value as ITradingLayer).subscribeChanges === 'function'
        && typeof (value as ITradingLayer).subscribeIntents === 'function'
        && typeof (value as ITradingLayer).subscribeIntentOutcomes === 'function';
}

function plainObject(value: unknown): value is Readonly<Record<string, any>> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
