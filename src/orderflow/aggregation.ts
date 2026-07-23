import type { Time } from '../core/chart-api.js';
import {
    OrderFlowDataMode,
    TradeAggressorSide,
    normalizeOrderFlowTrade,
    normalizeOrderFlowTrades,
    type FootprintBar,
    type FootprintLevel,
    type FootprintNormalizationOptions,
    type OrderFlowTrade,
} from './model.js';

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

interface NormalizedAggregationOptions {
    readonly tickSize: number;
    readonly priceOrigin: number;
    readonly barDuration: number;
    readonly timeOrigin: number;
}

interface MutableLevel {
    readonly price: number;
    bidVolume: number;
    askVolume: number;
    tradeCount: number;
}

interface MutableBar {
    readonly time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    readonly levels: Map<number, MutableLevel>;
}

/**
 * Stateful trade-to-footprint aggregation. New trades touch only the current
 * level and replace only the current immutable bar, or append one new bar.
 */
export class FootprintAggregator {
    private readonly config: NormalizedAggregationOptions;
    private readonly normalization: FootprintNormalizationOptions;
    private readonly dataValue: FootprintBar[] = [];
    private readonly ids = new Set<string>();
    private tail: MutableBar | null = null;
    private previousTime = -Infinity;
    private previousSequence = -Infinity;

    constructor(options: FootprintAggregationOptions) {
        this.config = normalizeAggregationOptions(options);
        this.normalization = Object.freeze({
            tickSize: this.config.tickSize,
            priceOrigin: this.config.priceOrigin,
        });
    }

    get size(): number { return this.dataValue.length; }
    get latest(): FootprintBar | null { return this.dataValue[this.dataValue.length - 1] ?? null; }

    /** Returns a stable immutable point-in-time copy. It is never mutated by later pushes. */
    snapshot(): readonly FootprintBar[] {
        return Object.freeze(this.dataValue.slice());
    }

    /** Atomically replaces all state from an ordered trade snapshot. */
    reset(values: readonly OrderFlowTrade[]): readonly FootprintBar[] {
        const trades = normalizeOrderFlowTrades(values, this.normalization);
        this.clear();
        for (const trade of trades) {
            this.ingest(trade);
            this.remember(trade);
        }
        return this.snapshot();
    }

    /** Appends one chronological trade and emits a one-bar tail patch. */
    push(value: OrderFlowTrade): FootprintAggregationPatch {
        const trade = normalizeOrderFlowTrade(value, this.normalization);
        this.validateNext(trade);
        const patch = this.ingest(trade);
        this.remember(trade);
        return patch;
    }

    clear(): void {
        this.dataValue.length = 0;
        this.ids.clear();
        this.tail = null;
        this.previousTime = -Infinity;
        this.previousSequence = -Infinity;
    }

    private validateNext(trade: OrderFlowTrade): void {
        if (trade.time < this.previousTime)
            throw new RangeError('sschart: appended order-flow trade time cannot move backwards');
        if (trade.time === this.previousTime && trade.sequence !== undefined
            && trade.sequence < this.previousSequence) {
            throw new RangeError('sschart: appended order-flow trade sequence cannot move backwards');
        }
        if (trade.id !== undefined && this.ids.has(trade.id))
            throw new RangeError(`sschart: duplicate order-flow trade id '${trade.id}'`);
    }

    private remember(trade: OrderFlowTrade): void {
        if (trade.id !== undefined) this.ids.add(trade.id);
        this.previousSequence = trade.time === this.previousTime
            ? (trade.sequence ?? this.previousSequence) : (trade.sequence ?? -Infinity);
        this.previousTime = trade.time;
    }

    private ingest(trade: OrderFlowTrade): FootprintAggregationPatch {
        const bucket = bucketTime(trade.time, this.config);
        let append: boolean;
        let tail: MutableBar;
        if (this.tail === null || bucket > this.tail.time) {
            append = true;
            tail = createBar(bucket, trade);
            this.tail = tail;
        } else {
            append = false;
            tail = this.tail;
            addTrade(tail, trade);
        }

        const bar = snapshotBar(tail);
        if (append) {
            const fromIndex = this.dataValue.length;
            this.dataValue.push(bar);
            return Object.freeze({
                kind: 'append' as const,
                fromIndex,
                removed: 0 as const,
                data: Object.freeze([bar]),
            });
        }

        const fromIndex = this.dataValue.length - 1;
        this.dataValue[fromIndex] = bar;
        return Object.freeze({
            kind: 'update' as const,
            fromIndex,
            removed: 1 as const,
            data: Object.freeze([bar]),
        });
    }
}

export function aggregateFootprintBars(
    trades: readonly OrderFlowTrade[],
    options: FootprintAggregationOptions,
): readonly FootprintBar[] {
    return new FootprintAggregator(options).reset(trades);
}

function createBar(time: number, trade: OrderFlowTrade): MutableBar {
    const level = createLevel(trade);
    return {
        time,
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        levels: new Map([[trade.price, level]]),
    };
}

function addTrade(bar: MutableBar, trade: OrderFlowTrade): void {
    bar.high = Math.max(bar.high, trade.price);
    bar.low = Math.min(bar.low, trade.price);
    bar.close = trade.price;
    const level = bar.levels.get(trade.price);
    if (level === undefined) {
        bar.levels.set(trade.price, createLevel(trade));
        return;
    }
    if (trade.aggressorSide === TradeAggressorSide.Buy) level.askVolume += trade.volume;
    else level.bidVolume += trade.volume;
    level.tradeCount++;
}

function createLevel(trade: OrderFlowTrade): MutableLevel {
    return {
        price: trade.price,
        bidVolume: trade.aggressorSide === TradeAggressorSide.Sell ? trade.volume : 0,
        askVolume: trade.aggressorSide === TradeAggressorSide.Buy ? trade.volume : 0,
        tradeCount: 1,
    };
}

function snapshotBar(value: MutableBar): FootprintBar {
    const levels: FootprintLevel[] = Array.from(value.levels.values())
        .sort((left, right) => left.price - right.price)
        .map(level => Object.freeze({
            price: level.price,
            bidVolume: level.bidVolume,
            askVolume: level.askVolume,
            tradeCount: level.tradeCount,
        }));
    return Object.freeze({
        dataMode: OrderFlowDataMode.Exact,
        time: value.time,
        open: value.open,
        high: value.high,
        low: value.low,
        close: value.close,
        levels: Object.freeze(levels),
    });
}

function bucketTime(time: number, options: NormalizedAggregationOptions): number {
    const index = Math.floor((time - options.timeOrigin) / options.barDuration);
    const result = options.timeOrigin + index * options.barDuration;
    return Object.is(result, -0) ? 0 : result;
}

function normalizeAggregationOptions(
    value: FootprintAggregationOptions,
): NormalizedAggregationOptions {
    if (!plainObject(value))
        throw new TypeError('sschart: footprint aggregation options are required');
    const tickSize = positive(value.tickSize, 'footprint tickSize');
    const priceOrigin = value.priceOrigin === undefined
        ? 0 : finite(value.priceOrigin, 'footprint priceOrigin');
    const barDuration = positive(value.barDuration, 'footprint barDuration');
    const timeOrigin = value.timeOrigin === undefined
        ? 0 : finite(value.timeOrigin, 'footprint timeOrigin');
    return Object.freeze({ tickSize, priceOrigin, barDuration, timeOrigin });
}

function finite(value: unknown, name: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value))
        throw new TypeError(`sschart: ${name} must be finite`);
    return value;
}

function positive(value: unknown, name: string): number {
    const result = finite(value, name);
    if (!(result > 0)) throw new RangeError(`sschart: ${name} must be positive`);
    return result;
}

function plainObject(value: unknown): value is Readonly<Record<string, any>> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
