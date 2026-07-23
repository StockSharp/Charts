import {
    normalizeFootprintBar,
    type FootprintBar,
    type FootprintLevel,
    type FootprintNormalizationOptions,
} from './model.js';

export const FootprintPocTieBreak = Object.freeze({
    ClosestToClose: 'closest-to-close',
    LowerPrice: 'lower-price',
    HigherPrice: 'higher-price',
} as const);
export type FootprintPocTieBreak = typeof FootprintPocTieBreak[
    keyof typeof FootprintPocTieBreak
];

export const FootprintAuctionCompletion = Object.freeze({
    Finished: 'finished',
    Unfinished: 'unfinished',
    Unavailable: 'unavailable',
} as const);
export type FootprintAuctionCompletion = typeof FootprintAuctionCompletion[
    keyof typeof FootprintAuctionCompletion
];

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

interface NormalizedMetricsOptions {
    readonly tickSize: number;
    readonly priceOrigin: number;
    readonly valueAreaPercentage: number;
    readonly imbalanceRatio: number;
    readonly imbalanceMinimumVolume: number;
    readonly stackedImbalanceCount: number;
    readonly pocTieBreak: FootprintPocTieBreak;
}

const POC_TIE_BREAKS = new Set<FootprintPocTieBreak>(Object.values(FootprintPocTieBreak));

/**
 * Computes exact per-bar order-flow metrics. The result depends only on the bar
 * and calculation options; viewport and renderer state never enter this path.
 *
 * Buy imbalance compares ask(P) with bid(P - tick). Sell imbalance compares
 * bid(P) with ask(P + tick). A comparison outside the bar range is unavailable.
 */
export function calculateFootprintMetrics(
    value: FootprintBar,
    options: FootprintMetricsOptions,
): FootprintBarMetrics {
    const config = normalizeMetricsOptions(options);
    const bar = normalizeFootprintBar(value, config);
    const totals = bar.levels.map(level => checkedAdd(
        level.bidVolume,
        level.askVolume,
        'footprint level total volume',
    ));
    const totalBidVolume = checkedSum(
        bar.levels.map(level => level.bidVolume),
        'footprint total bid volume',
    );
    const totalAskVolume = checkedSum(
        bar.levels.map(level => level.askVolume),
        'footprint total ask volume',
    );
    const totalVolume = checkedAdd(
        totalBidVolume,
        totalAskVolume,
        'footprint total volume',
    );
    const tradeCount = bar.levels.every(level => level.tradeCount !== undefined)
        ? checkedSum(
            bar.levels.map(level => level.tradeCount as number),
            'footprint total trade count',
        ) : null;
    const pocIndex = selectPocIndex(bar.levels, totals, bar.close, config.pocTieBreak);
    const valueArea = calculateValueArea(
        bar.levels,
        totals,
        pocIndex,
        totalVolume,
        config.valueAreaPercentage,
    );
    const imbalanceResult = calculateImbalances(bar, config);
    const levels: FootprintLevelMetrics[] = bar.levels.map((level, index) => Object.freeze({
        price: level.price,
        bidVolume: level.bidVolume,
        askVolume: level.askVolume,
        totalVolume: totals[index],
        delta: level.askVolume - level.bidVolume,
        ...(level.tradeCount === undefined ? {} : { tradeCount: level.tradeCount }),
        buyImbalance: imbalanceResult.buyIndexes.has(index),
        sellImbalance: imbalanceResult.sellIndexes.has(index),
    }));
    const stackedImbalances = calculateStacks(
        levels,
        config.tickSize,
        config.stackedImbalanceCount,
    );

    return Object.freeze({
        time: bar.time,
        totalBidVolume,
        totalAskVolume,
        totalVolume,
        delta: totalAskVolume - totalBidVolume,
        tradeCount,
        pocPrice: bar.levels[pocIndex].price,
        pocVolume: totals[pocIndex],
        valueArea,
        imbalances: imbalanceResult.values,
        stackedImbalances,
        auction: calculateAuction(bar, config.tickSize),
        levels: Object.freeze(levels),
    });
}

interface ImbalanceResult {
    readonly values: readonly FootprintImbalance[];
    readonly buyIndexes: ReadonlySet<number>;
    readonly sellIndexes: ReadonlySet<number>;
}

function calculateImbalances(
    bar: FootprintBar,
    options: NormalizedMetricsOptions,
): ImbalanceResult {
    const tickIndexes = new Map<number, number>();
    for (let index = 0; index < bar.levels.length; index++) {
        tickIndexes.set(tickIndex(bar.levels[index].price, options), index);
    }
    const lowTick = tickIndex(bar.low, options);
    const highTick = tickIndex(bar.high, options);
    const values: FootprintImbalance[] = [];
    const buyIndexes = new Set<number>();
    const sellIndexes = new Set<number>();

    for (let index = 0; index < bar.levels.length; index++) {
        const level = bar.levels[index];
        const currentTick = tickIndex(level.price, options);
        const buyCompareTick = currentTick - 1;
        if (buyCompareTick >= lowTick) {
            const compared = tickIndexes.get(buyCompareTick);
            const comparedVolume = compared === undefined ? 0 : bar.levels[compared].bidVolume;
            const ratio = volumeRatio(level.askVolume, comparedVolume);
            if (level.askVolume > 0
                && level.askVolume >= options.imbalanceMinimumVolume
                && ratio >= options.imbalanceRatio) {
                buyIndexes.add(index);
                values.push(freezeImbalance(
                    'buy', level.price, level.askVolume,
                    priceAtTick(buyCompareTick, options), comparedVolume, ratio,
                ));
            }
        }

        const sellCompareTick = currentTick + 1;
        if (sellCompareTick <= highTick) {
            const compared = tickIndexes.get(sellCompareTick);
            const comparedVolume = compared === undefined ? 0 : bar.levels[compared].askVolume;
            const ratio = volumeRatio(level.bidVolume, comparedVolume);
            if (level.bidVolume > 0
                && level.bidVolume >= options.imbalanceMinimumVolume
                && ratio >= options.imbalanceRatio) {
                sellIndexes.add(index);
                values.push(freezeImbalance(
                    'sell', level.price, level.bidVolume,
                    priceAtTick(sellCompareTick, options), comparedVolume, ratio,
                ));
            }
        }
    }

    values.sort((left, right) => left.price - right.price
        || (left.side === right.side ? 0 : left.side === 'sell' ? -1 : 1));
    return {
        values: Object.freeze(values),
        buyIndexes,
        sellIndexes,
    };
}

function freezeImbalance(
    side: FootprintImbalanceSide,
    price: number,
    volume: number,
    comparedPrice: number,
    comparedVolume: number,
    ratio: number,
): FootprintImbalance {
    return Object.freeze({ side, price, volume, comparedPrice, comparedVolume, ratio });
}

function calculateStacks(
    levels: readonly FootprintLevelMetrics[],
    tickSize: number,
    required: number,
): readonly FootprintStackedImbalance[] {
    const result: FootprintStackedImbalance[] = [];
    collectStacks('buy', levels, tickSize, required, result);
    collectStacks('sell', levels, tickSize, required, result);
    result.sort((left, right) => left.low - right.low
        || (left.side === right.side ? 0 : left.side === 'sell' ? -1 : 1));
    return Object.freeze(result);
}

function collectStacks(
    side: FootprintImbalanceSide,
    levels: readonly FootprintLevelMetrics[],
    tickSize: number,
    required: number,
    result: FootprintStackedImbalance[],
): void {
    let start = -1;
    for (let index = 0; index <= levels.length; index++) {
        const active = index < levels.length
            && (side === 'buy' ? levels[index].buyImbalance : levels[index].sellImbalance);
        const continues = active && (start < 0 || index === start
            || approximately(
                levels[index].price - levels[index - 1].price,
                tickSize,
                tickSize,
            ));
        if (continues) {
            if (start < 0) start = index;
            continue;
        }
        if (start >= 0 && index - start >= required) {
            result.push(Object.freeze({
                side,
                low: levels[start].price,
                high: levels[index - 1].price,
                levelCount: index - start,
            }));
        }
        start = active ? index : -1;
    }
}

function calculateValueArea(
    levels: readonly FootprintLevel[],
    totals: readonly number[],
    pocIndex: number,
    totalVolume: number,
    percentage: number,
): FootprintValueArea {
    const targetVolume = totalVolume * percentage;
    let lowIndex = pocIndex;
    let highIndex = pocIndex;
    let volume = totals[pocIndex];
    while (volume < targetVolume && (lowIndex > 0 || highIndex < levels.length - 1)) {
        const lower = lowIndex > 0 ? totals[lowIndex - 1] : -1;
        const upper = highIndex < levels.length - 1 ? totals[highIndex + 1] : -1;
        if (lower === upper && lower >= 0) {
            lowIndex--;
            highIndex++;
            volume = checkedAdd(volume, lower, 'footprint value-area volume');
            volume = checkedAdd(volume, upper, 'footprint value-area volume');
        } else if (upper > lower) {
            highIndex++;
            volume = checkedAdd(volume, upper, 'footprint value-area volume');
        } else {
            lowIndex--;
            volume = checkedAdd(volume, lower, 'footprint value-area volume');
        }
    }
    return Object.freeze({
        low: levels[lowIndex].price,
        high: levels[highIndex].price,
        volume,
        targetVolume,
        percentage,
    });
}

function selectPocIndex(
    levels: readonly FootprintLevel[],
    totals: readonly number[],
    close: number,
    tieBreak: FootprintPocTieBreak,
): number {
    let selected = 0;
    for (let index = 1; index < totals.length; index++) {
        if (totals[index] > totals[selected]
            || (totals[index] === totals[selected]
                && preferPoc(levels[index].price, levels[selected].price, close, tieBreak))) {
            selected = index;
        }
    }
    return selected;
}

function preferPoc(
    candidate: number,
    selected: number,
    close: number,
    tieBreak: FootprintPocTieBreak,
): boolean {
    if (tieBreak === FootprintPocTieBreak.HigherPrice) return candidate > selected;
    if (tieBreak === FootprintPocTieBreak.LowerPrice) return candidate < selected;
    const candidateDistance = Math.abs(candidate - close);
    const selectedDistance = Math.abs(selected - close);
    return candidateDistance < selectedDistance
        || (candidateDistance === selectedDistance && candidate < selected);
}

function calculateAuction(bar: FootprintBar, tickSize: number): FootprintAuctionMetrics {
    const low = bar.levels[0];
    const high = bar.levels[bar.levels.length - 1];
    return Object.freeze({
        low: approximately(low.price, bar.low, tickSize)
            ? (low.askVolume > 0
                ? FootprintAuctionCompletion.Unfinished
                : FootprintAuctionCompletion.Finished)
            : FootprintAuctionCompletion.Unavailable,
        high: approximately(high.price, bar.high, tickSize)
            ? (high.bidVolume > 0
                ? FootprintAuctionCompletion.Unfinished
                : FootprintAuctionCompletion.Finished)
            : FootprintAuctionCompletion.Unavailable,
    });
}

function volumeRatio(dominant: number, opposing: number): number {
    return opposing === 0 ? (dominant > 0 ? Infinity : 0) : dominant / opposing;
}

function tickIndex(price: number, options: Pick<NormalizedMetricsOptions, 'tickSize' | 'priceOrigin'>): number {
    return Math.round((price - options.priceOrigin) / options.tickSize);
}

function priceAtTick(
    index: number,
    options: Pick<NormalizedMetricsOptions, 'tickSize' | 'priceOrigin'>,
): number {
    const result = options.priceOrigin + index * options.tickSize;
    return Object.is(result, -0) ? 0 : result;
}

function approximately(left: number, right: number, scale = 1): boolean {
    const tolerance = Math.max(1e-12, Math.abs(left) * Number.EPSILON * 16, scale * 1e-9);
    return Math.abs(left - right) <= tolerance;
}

function checkedSum(values: readonly number[], name: string): number {
    let result = 0;
    for (const value of values) result = checkedAdd(result, value, name);
    return result;
}

function checkedAdd(left: number, right: number, name: string): number {
    const result = left + right;
    if (!Number.isFinite(result)) throw new RangeError(`sschart: ${name} overflow`);
    return result;
}

function normalizeMetricsOptions(value: FootprintMetricsOptions): NormalizedMetricsOptions {
    if (!plainObject(value)) throw new TypeError('sschart: footprint metrics options are required');
    const tickSize = positive(value.tickSize, 'footprint tickSize');
    const priceOrigin = value.priceOrigin === undefined
        ? 0 : finite(value.priceOrigin, 'footprint priceOrigin');
    const valueAreaPercentage = value.valueAreaPercentage === undefined
        ? 0.7 : finite(value.valueAreaPercentage, 'footprint valueAreaPercentage');
    if (!(valueAreaPercentage > 0 && valueAreaPercentage <= 1)) {
        throw new RangeError('sschart: footprint valueAreaPercentage must be in (0, 1]');
    }
    const imbalanceRatio = value.imbalanceRatio === undefined
        ? 3 : finite(value.imbalanceRatio, 'footprint imbalanceRatio');
    if (imbalanceRatio < 1)
        throw new RangeError('sschart: footprint imbalanceRatio must be at least 1');
    const imbalanceMinimumVolume = value.imbalanceMinimumVolume === undefined
        ? 0 : finite(value.imbalanceMinimumVolume, 'footprint imbalanceMinimumVolume');
    if (imbalanceMinimumVolume < 0) {
        throw new RangeError('sschart: footprint imbalanceMinimumVolume must be non-negative');
    }
    const stackedImbalanceCount = value.stackedImbalanceCount === undefined
        ? 3 : positiveInteger(value.stackedImbalanceCount, 'footprint stackedImbalanceCount');
    const pocTieBreak = value.pocTieBreak ?? FootprintPocTieBreak.ClosestToClose;
    if (!POC_TIE_BREAKS.has(pocTieBreak))
        throw new TypeError('sschart: footprint pocTieBreak is invalid');
    return Object.freeze({
        tickSize,
        priceOrigin,
        valueAreaPercentage,
        imbalanceRatio,
        imbalanceMinimumVolume,
        stackedImbalanceCount,
        pocTieBreak,
    });
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

function positiveInteger(value: unknown, name: string): number {
    if (!Number.isSafeInteger(value) || (value as number) < 1)
        throw new RangeError(`sschart: ${name} must be a positive integer`);
    return value as number;
}

function plainObject(value: unknown): value is Readonly<Record<string, any>> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
