import type {
    IChartApi,
    OrderPlace,
    OrderPlacementOptions,
} from '../core/chart-api.js';
import {
    ChartOrderTimeInForce,
    ChartOrderType,
    TradingSide,
    normalizeChartOrderRequest,
    quantizeTradingPrice,
    type ChartOrderRequest,
    type TradingSide as TradingSideValue,
} from './model.js';
import type { ITradingLayer } from './trading-layer.js';

export type TradingPlacementOrderType =
    | typeof ChartOrderType.Limit
    | typeof ChartOrderType.Stop;

export type TradingPlacementSideResolver = (
    event: Readonly<OrderPlace>,
) => TradingSideValue | null;

export interface TradingOrderPlacementAdapterOptions {
    readonly quantity: number;
    readonly orderType?: TradingPlacementOrderType;
    readonly timeInForce?: ChartOrderTimeInForce;
    readonly modifier?: OrderPlacementOptions['modifier'];
    readonly color?: string;
    readonly title?: string;
    readonly sideResolver?: TradingPlacementSideResolver;
    readonly enabled?: boolean;
}

export type TradingOrderPlacementAdapterOptionsPatch = Partial<
    TradingOrderPlacementAdapterOptions
>;

export interface ResolvedTradingOrderPlacementAdapterOptions {
    readonly quantity: number;
    readonly orderType: TradingPlacementOrderType;
    readonly timeInForce: ChartOrderTimeInForce;
    readonly modifier: NonNullable<OrderPlacementOptions['modifier']>;
    readonly color: string;
    readonly title: string;
    readonly sideResolver: TradingPlacementSideResolver;
    readonly enabled: boolean;
}

/**
 * Compatibility bridge: consumes the existing chart placement signal and emits a TradingLayer
 * intent. It never creates a price line or communicates with a broker by itself.
 */
export class TradingOrderPlacementAdapter {
    private readonly model: ResolvedTradingOrderPlacementAdapterOptions;
    private disposed = false;
    private readonly listener = (event: OrderPlace): void => this.handlePlacement(event);

    constructor(
        private readonly chart: IChartApi,
        private readonly layer: ITradingLayer,
        options: TradingOrderPlacementAdapterOptions,
    ) {
        assertChart(chart);
        assertLayer(layer);
        if (!plainObject(options))
            throw new TypeError('sschart: trading placement adapter options must be an object');
        this.model = { ...normalizeOptions(options, defaultOptions(), layer) };
        chart.subscribeOrderPlace(this.listener);
        try {
            this.applyPlacementMode(this.model);
        } catch (error) {
            chart.unsubscribeOrderPlace(this.listener);
            throw error;
        }
    }

    options(): ResolvedTradingOrderPlacementAdapterOptions {
        this.assertActive();
        return Object.freeze({ ...this.model });
    }

    applyOptions(patch: TradingOrderPlacementAdapterOptionsPatch): void {
        this.assertActive();
        if (!plainObject(patch))
            throw new TypeError('sschart: trading placement adapter options patch must be an object');
        const next = normalizeOptions(patch, this.model, this.layer);
        this.applyPlacementMode(next);
        Object.assign(this.model, next);
    }

    setEnabled(enabled: boolean): void { this.applyOptions({ enabled }); }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.chart.unsubscribeOrderPlace(this.listener);
        if (this.model.enabled) this.chart.setOrderPlacement(null);
    }

    private handlePlacement(event: OrderPlace): void {
        if (this.disposed || !this.model.enabled) return;
        const side = this.model.sideResolver(Object.freeze({ ...event }));
        if (side === null) return;
        if (!Object.values(TradingSide).includes(side))
            throw new TypeError('sschart: trading placement sideResolver returned an invalid side');
        const price = quantizeTradingPrice(event.price, this.layer.normalizationOptions());
        const request: ChartOrderRequest = Object.freeze({
            side,
            type: this.model.orderType,
            timeInForce: this.model.timeInForce,
            quantity: this.model.quantity,
            ...(this.model.orderType === ChartOrderType.Limit ? { price } : { stopPrice: price }),
        });
        this.layer.requestPlaceOrder(request);
    }

    private applyPlacementMode(options: ResolvedTradingOrderPlacementAdapterOptions): void {
        this.chart.setOrderPlacement(options.enabled ? Object.freeze({
            modifier: options.modifier,
            color: options.color,
            title: options.title,
        }) : null);
    }

    private assertActive(): void {
        if (this.disposed) throw new Error('sschart: trading placement adapter is disposed');
    }
}

function defaultOptions(): ResolvedTradingOrderPlacementAdapterOptions {
    return Object.freeze({
        quantity: 1,
        orderType: ChartOrderType.Limit,
        timeInForce: ChartOrderTimeInForce.GoodTillCancelled,
        modifier: 'ctrl',
        color: '#ffb74d',
        title: 'ORDER',
        sideResolver: defaultSideResolver,
        enabled: true,
    });
}

function normalizeOptions(
    value: TradingOrderPlacementAdapterOptionsPatch | TradingOrderPlacementAdapterOptions,
    base: ResolvedTradingOrderPlacementAdapterOptions,
    layer: ITradingLayer,
): ResolvedTradingOrderPlacementAdapterOptions {
    const orderType = value.orderType === undefined ? base.orderType : orderTypeValue(value.orderType);
    const timeInForce = value.timeInForce === undefined
        ? base.timeInForce : timeInForceValue(value.timeInForce);
    const quantity = value.quantity === undefined ? base.quantity : value.quantity;
    const normalization = layer.normalizationOptions();
    const probePrice = quantizeTradingPrice(normalization.priceOrigin ?? 0, normalization);
    const probe = normalizeChartOrderRequest({
        side: TradingSide.Buy,
        type: orderType,
        timeInForce,
        quantity,
        ...(orderType === ChartOrderType.Limit
            ? { price: probePrice } : { stopPrice: probePrice }),
    }, normalization);
    return Object.freeze({
        quantity: probe.quantity,
        orderType,
        timeInForce,
        modifier: modifier(value.modifier, base.modifier),
        color: text(value.color, base.color, 'color'),
        title: text(value.title, base.title, 'title'),
        sideResolver: resolver(value.sideResolver, base.sideResolver),
        enabled: bool(value.enabled, base.enabled, 'enabled'),
    });
}

function defaultSideResolver(event: Readonly<OrderPlace>): TradingSideValue | null {
    if (event.button === 0) return TradingSide.Buy;
    if (event.button === 2) return TradingSide.Sell;
    return null;
}

function orderTypeValue(value: unknown): TradingPlacementOrderType {
    if (value !== ChartOrderType.Limit && value !== ChartOrderType.Stop) {
        throw new TypeError("sschart: placement orderType must be 'limit' or 'stop'");
    }
    return value;
}

function timeInForceValue(value: unknown): ChartOrderTimeInForce {
    if (!Object.values(ChartOrderTimeInForce).includes(value as ChartOrderTimeInForce))
        throw new TypeError('sschart: placement timeInForce is invalid');
    return value as ChartOrderTimeInForce;
}

function modifier(
    value: unknown,
    fallback: NonNullable<OrderPlacementOptions['modifier']>,
): NonNullable<OrderPlacementOptions['modifier']> {
    if (value === undefined) return fallback;
    if (value !== 'ctrl' && value !== 'shift' && value !== 'alt')
        throw new TypeError('sschart: placement modifier is invalid');
    return value;
}

function resolver(
    value: unknown,
    fallback: TradingPlacementSideResolver,
): TradingPlacementSideResolver {
    if (value === undefined) return fallback;
    if (typeof value !== 'function')
        throw new TypeError('sschart: placement sideResolver must be a function');
    return value as TradingPlacementSideResolver;
}

function text(value: unknown, fallback: string, name: string): string {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new TypeError(`sschart: trading placement ${name} must be a non-empty string`);
    return value.trim();
}

function bool(value: unknown, fallback: boolean, name: string): boolean {
    if (value === undefined) return fallback;
    if (typeof value !== 'boolean')
        throw new TypeError(`sschart: trading placement ${name} must be boolean`);
    return value;
}

function assertChart(value: unknown): asserts value is IChartApi {
    if (value === null || typeof value !== 'object'
        || typeof (value as IChartApi).setOrderPlacement !== 'function'
        || typeof (value as IChartApi).subscribeOrderPlace !== 'function'
        || typeof (value as IChartApi).unsubscribeOrderPlace !== 'function') {
        throw new TypeError('sschart: trading placement adapter requires IChartApi');
    }
}

function assertLayer(value: unknown): asserts value is ITradingLayer {
    if (value === null || typeof value !== 'object'
        || typeof (value as ITradingLayer).normalizationOptions !== 'function'
        || typeof (value as ITradingLayer).requestPlaceOrder !== 'function') {
        throw new TypeError('sschart: trading placement adapter requires ITradingLayer');
    }
}

function plainObject(value: unknown): value is Readonly<Record<string, any>> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
