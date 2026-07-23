import type { CandlestickData, Time } from '../core/chart-api.js';

export const OrderFlowDataMode = Object.freeze({
    Exact: 'exact',
    Approximate: 'approximate',
} as const);
export type OrderFlowDataMode = typeof OrderFlowDataMode[keyof typeof OrderFlowDataMode];

export const TradeAggressorSide = Object.freeze({
    /** Aggressive buyer: the trade executed against resting liquidity at the ask. */
    Buy: 'buy',
    /** Aggressive seller: the trade executed against resting liquidity at the bid. */
    Sell: 'sell',
} as const);
export type TradeAggressorSide = typeof TradeAggressorSide[keyof typeof TradeAggressorSide];

export const FootprintApproximation = Object.freeze({
    /** Candle volume distributed over its low/high range. Never treated as exact order flow. */
    UniformCandleRange: 'uniform-candle-range',
    /** Venue/vendor supplied estimates without aggressor-side executions. */
    VendorEstimated: 'vendor-estimated',
    /** Real trades whose aggressor side could not be classified. */
    UnclassifiedTrades: 'unclassified-trades',
} as const);
export type FootprintApproximation = typeof FootprintApproximation[
    keyof typeof FootprintApproximation
];

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
export function normalizeTickAlignedCandle(
    value: CandlestickData,
    options: FootprintNormalizationOptions,
): CandlestickData {
    if (!plainObject(value)) throw new TypeError('sschart: tick-aligned candle must be an object');
    return normalizeCandle(value, normalizeGrid(options), 'tick-aligned candle');
}

export function normalizeOrderFlowTrade(
    value: OrderFlowTrade,
    options: FootprintNormalizationOptions,
): OrderFlowTrade {
    const grid = normalizeGrid(options);
    if (!plainObject(value)) throw new TypeError('sschart: order-flow trade must be an object');
    const side = value.aggressorSide;
    if (!Object.values(TradeAggressorSide).includes(side))
        throw new TypeError('sschart: order-flow trade aggressorSide is invalid');
    const id = value.id === undefined ? undefined : identifier(value.id, 'order-flow trade id');
    const sequence = value.sequence === undefined
        ? undefined : nonNegativeInteger(value.sequence, 'order-flow trade sequence');
    return Object.freeze({
        time: finite(value.time, 'order-flow trade time'),
        price: tickPrice(value.price, grid, 'order-flow trade price'),
        volume: positive(value.volume, 'order-flow trade volume'),
        aggressorSide: side,
        ...(id === undefined ? {} : { id }),
        ...(sequence === undefined ? {} : { sequence }),
    });
}

export function normalizeOrderFlowTrades(
    values: readonly OrderFlowTrade[],
    options: FootprintNormalizationOptions,
): readonly OrderFlowTrade[] {
    if (!Array.isArray(values))
        throw new TypeError('sschart: order-flow trades must be an array');
    normalizeGrid(options);
    const result: OrderFlowTrade[] = [];
    const ids = new Set<string>();
    let previousTime = -Infinity;
    let previousSequence = -Infinity;
    for (let index = 0; index < values.length; index++) {
        const trade = normalizeOrderFlowTrade(values[index], options);
        if (trade.time < previousTime) {
            throw new RangeError(
                `sschart: order-flow trades must be ordered by time (index ${index})`,
            );
        }
        if (trade.time === previousTime && trade.sequence !== undefined
            && trade.sequence < previousSequence) {
            throw new RangeError(
                `sschart: order-flow trade sequence must be ordered at index ${index}`,
            );
        }
        if (trade.id !== undefined) {
            if (ids.has(trade.id))
                throw new RangeError(`sschart: duplicate order-flow trade id '${trade.id}'`);
            ids.add(trade.id);
        }
        previousSequence = trade.time === previousTime
            ? (trade.sequence ?? previousSequence) : (trade.sequence ?? -Infinity);
        previousTime = trade.time;
        result.push(trade);
    }
    return Object.freeze(result);
}

export function normalizeFootprintLevel(
    value: FootprintLevel,
    options: FootprintNormalizationOptions,
): FootprintLevel {
    return normalizeExactLevel(value, normalizeGrid(options), 'footprint level');
}

export function normalizeFootprintBar(
    value: FootprintBar,
    options: FootprintNormalizationOptions,
): FootprintBar {
    const grid = normalizeGrid(options);
    if (!plainObject(value)) throw new TypeError('sschart: footprint bar must be an object');
    if (value.dataMode !== OrderFlowDataMode.Exact) {
        throw new TypeError(
            "sschart: exact footprint bar dataMode must be 'exact'; approximate data is a separate contract",
        );
    }
    const candle = normalizeCandle(value, grid, 'footprint bar');
    if (!Array.isArray(value.levels) || value.levels.length === 0)
        throw new TypeError('sschart: exact footprint bar levels must be a non-empty array');
    const levels = normalizeLevels(
        value.levels,
        item => normalizeExactLevel(item, grid, 'footprint level'),
        candle.low,
        candle.high,
        'footprint',
    );
    return Object.freeze({ ...candle, dataMode: OrderFlowDataMode.Exact, levels });
}

export function normalizeFootprintBars(
    values: readonly FootprintBar[],
    options: FootprintNormalizationOptions,
): readonly FootprintBar[] {
    if (!Array.isArray(values)) throw new TypeError('sschart: footprint bars must be an array');
    normalizeGrid(options);
    const result: FootprintBar[] = [];
    let previousTime = -Infinity;
    for (let index = 0; index < values.length; index++) {
        const bar = normalizeFootprintBar(values[index], options);
        if (!(bar.time > previousTime)) {
            throw new RangeError(
                `sschart: footprint bar times must be strictly increasing (index ${index})`,
            );
        }
        previousTime = bar.time;
        result.push(bar);
    }
    return Object.freeze(result);
}

export function normalizeApproximateFootprintBar(
    value: ApproximateFootprintBar,
    options: FootprintNormalizationOptions,
): ApproximateFootprintBar {
    const grid = normalizeGrid(options);
    if (!plainObject(value))
        throw new TypeError('sschart: approximate footprint bar must be an object');
    if (value.dataMode !== OrderFlowDataMode.Approximate)
        throw new TypeError("sschart: approximate footprint bar dataMode must be 'approximate'");
    if (!Object.values(FootprintApproximation).includes(value.approximation))
        throw new TypeError('sschart: footprint approximation reason is invalid');
    const candle = normalizeCandle(value, grid, 'approximate footprint bar');
    if (!Array.isArray(value.levels) || value.levels.length === 0) {
        throw new TypeError(
            'sschart: approximate footprint bar levels must be a non-empty array',
        );
    }
    const levels = normalizeLevels(
        value.levels,
        item => normalizeApproximateLevel(item, grid),
        candle.low,
        candle.high,
        'approximate footprint',
    );
    return Object.freeze({
        ...candle,
        dataMode: OrderFlowDataMode.Approximate,
        approximation: value.approximation,
        levels,
    });
}

export function normalizeApproximateFootprintBars(
    values: readonly ApproximateFootprintBar[],
    options: FootprintNormalizationOptions,
): readonly ApproximateFootprintBar[] {
    if (!Array.isArray(values))
        throw new TypeError('sschart: approximate footprint bars must be an array');
    normalizeGrid(options);
    const result: ApproximateFootprintBar[] = [];
    let previousTime = -Infinity;
    for (let index = 0; index < values.length; index++) {
        const bar = normalizeApproximateFootprintBar(values[index], options);
        if (!(bar.time > previousTime)) {
            throw new RangeError(
                `sschart: approximate footprint bar times must be strictly increasing (index ${index})`,
            );
        }
        previousTime = bar.time;
        result.push(bar);
    }
    return Object.freeze(result);
}

export function isExactFootprintBar(value: OrderFlowBar): value is FootprintBar {
    return value?.dataMode === OrderFlowDataMode.Exact;
}

export function isApproximateFootprintBar(
    value: OrderFlowBar,
): value is ApproximateFootprintBar {
    return value?.dataMode === OrderFlowDataMode.Approximate;
}

export function footprintLevelVolume(level: FootprintLevel): number {
    if (!plainObject(level)) throw new TypeError('sschart: footprint level must be an object');
    return nonNegative(level.bidVolume, 'footprint bidVolume')
        + nonNegative(level.askVolume, 'footprint askVolume');
}

export function footprintBarVolume(bar: FootprintBar): number {
    if (!plainObject(bar) || bar.dataMode !== OrderFlowDataMode.Exact
        || !Array.isArray(bar.levels)) {
        throw new TypeError('sschart: exact footprint bar is required');
    }
    return bar.levels.reduce((sum, level) => sum + footprintLevelVolume(level), 0);
}

interface PriceGrid {
    readonly tickSize: number;
    readonly origin: number;
}

function normalizeGrid(value: FootprintNormalizationOptions): PriceGrid {
    if (!plainObject(value))
        throw new TypeError('sschart: footprint normalization options are required');
    const tickSize = positive(value.tickSize, 'footprint tickSize');
    const origin = value.priceOrigin === undefined
        ? 0 : finite(value.priceOrigin, 'footprint priceOrigin');
    return Object.freeze({ tickSize, origin });
}

function normalizeCandle(
    value: CandlestickData,
    grid: PriceGrid,
    name: string,
): CandlestickData {
    const time = finite(value.time, `${name} time`);
    const open = tickPrice(value.open, grid, `${name} open`);
    const high = tickPrice(value.high, grid, `${name} high`);
    const low = tickPrice(value.low, grid, `${name} low`);
    const close = tickPrice(value.close, grid, `${name} close`);
    if (high < low || open < low || open > high || close < low || close > high)
        throw new RangeError(`sschart: ${name} OHLC range is invalid`);
    return Object.freeze({ time, open, high, low, close });
}

function normalizeExactLevel(value: FootprintLevel, grid: PriceGrid, name: string): FootprintLevel {
    if (!plainObject(value)) throw new TypeError(`sschart: ${name} must be an object`);
    const bidVolume = nonNegative(value.bidVolume, `${name} bidVolume`);
    const askVolume = nonNegative(value.askVolume, `${name} askVolume`);
    if (!(bidVolume + askVolume > 0))
        throw new RangeError(`sschart: ${name} must contain positive executed volume`);
    const tradeCount = value.tradeCount === undefined
        ? undefined : positiveInteger(value.tradeCount, `${name} tradeCount`);
    return Object.freeze({
        price: tickPrice(value.price, grid, `${name} price`),
        bidVolume,
        askVolume,
        ...(tradeCount === undefined ? {} : { tradeCount }),
    });
}

function normalizeApproximateLevel(
    value: ApproximateFootprintLevel,
    grid: PriceGrid,
): ApproximateFootprintLevel {
    if (!plainObject(value))
        throw new TypeError('sschart: approximate footprint level must be an object');
    const tradeCount = value.tradeCount === undefined
        ? undefined : positiveInteger(value.tradeCount, 'approximate footprint tradeCount');
    return Object.freeze({
        price: tickPrice(value.price, grid, 'approximate footprint price'),
        totalVolume: positive(value.totalVolume, 'approximate footprint totalVolume'),
        ...(tradeCount === undefined ? {} : { tradeCount }),
    });
}

function normalizeLevels<TLevel extends { readonly price: number }>(
    values: readonly TLevel[],
    normalize: (value: TLevel) => TLevel,
    low: number,
    high: number,
    name: string,
): readonly TLevel[] {
    const result: TLevel[] = [];
    let previous = -Infinity;
    for (let index = 0; index < values.length; index++) {
        const level = normalize(values[index]);
        if (!(level.price > previous)) {
            throw new RangeError(
                `sschart: ${name} levels must have unique ascending prices (index ${index})`,
            );
        }
        if (level.price < low || level.price > high)
            throw new RangeError(`sschart: ${name} level price must stay inside bar low/high`);
        previous = level.price;
        result.push(level);
    }
    return Object.freeze(result);
}

function tickPrice(value: unknown, grid: PriceGrid, name: string): number {
    const price = finite(value, name);
    const ticks = (price - grid.origin) / grid.tickSize;
    const nearest = Math.round(ticks);
    const normalized = grid.origin + nearest * grid.tickSize;
    const tolerance = Math.max(
        1e-12,
        Math.abs(price) * Number.EPSILON * 16,
        grid.tickSize * 1e-9,
    );
    if (Math.abs(price - normalized) > tolerance)
        throw new RangeError(`sschart: ${name} must align to tickSize ${grid.tickSize}`);
    return Object.is(normalized, -0) ? 0 : normalized;
}

function finite(value: unknown, name: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value))
        throw new TypeError(`sschart: ${name} must be finite`);
    return value;
}

function positive(value: unknown, name: string): number {
    const number = finite(value, name);
    if (!(number > 0)) throw new RangeError(`sschart: ${name} must be positive`);
    return number;
}

function nonNegative(value: unknown, name: string): number {
    const number = finite(value, name);
    if (number < 0) throw new RangeError(`sschart: ${name} must be non-negative`);
    return number;
}

function nonNegativeInteger(value: unknown, name: string): number {
    if (!Number.isSafeInteger(value) || (value as number) < 0)
        throw new RangeError(`sschart: ${name} must be a non-negative integer`);
    return value as number;
}

function positiveInteger(value: unknown, name: string): number {
    if (!Number.isSafeInteger(value) || (value as number) < 1)
        throw new RangeError(`sschart: ${name} must be a positive integer`);
    return value as number;
}

function identifier(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new TypeError(`sschart: ${name} must be a non-empty string`);
    return value.trim();
}

function plainObject(value: unknown): value is Readonly<Record<string, any>> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
