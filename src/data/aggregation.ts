import type { OhlcvBar } from './data-source.js';
import type {
    ChartDataViewBuilder,
    ChartDataViewUpdater,
} from './chart-data-store.js';
import { normalizeBars } from './bar-normalization.js';

export interface OhlcvAggregationOptions {
    readonly intervalSeconds: number;
    readonly originTime?: number;
}

/** Converts common trading resolutions to a fixed duration. Calendar months are intentionally excluded. */
export function resolutionToSeconds(resolution: string): number {
    if (typeof resolution !== 'string' || resolution.trim().length === 0)
        throw new TypeError('sschart: resolution must be a non-empty string');
    const match = /^(\d+)([smhdwSMHDW]?)$/.exec(resolution.trim());
    if (match === null || match[2] === 'M')
        throw new RangeError(`sschart: unsupported fixed resolution "${resolution}"`);
    const amount = Number(match[1]);
    if (!Number.isSafeInteger(amount) || amount < 1)
        throw new RangeError('sschart: resolution amount must be a positive safe integer');
    const unit = match[2].toLowerCase();
    const multiplier = unit === 's' ? 1
        : unit === 'h' ? 60 * 60
            : unit === 'd' ? 24 * 60 * 60
                : unit === 'w' ? 7 * 24 * 60 * 60
                    : 60;
    const seconds = amount * multiplier;
    if (!Number.isSafeInteger(seconds))
        throw new RangeError('sschart: resolution is too large');
    return seconds;
}

/** Stable time-bucket OHLCV reduction. Empty market gaps do not create synthetic bars. */
export function aggregateOhlcvBars(
    bars: readonly OhlcvBar[],
    options: OhlcvAggregationOptions,
): readonly OhlcvBar[] {
    if (!Array.isArray(bars)) throw new TypeError('sschart: OHLCV bars must be an array');
    const interval = positive(options?.intervalSeconds, 'aggregation intervalSeconds');
    const origin = options.originTime ?? 0;
    if (!Number.isFinite(origin))
        throw new RangeError('sschart: aggregation originTime must be finite');

    const normalized = normalizeBars(bars);
    const output: OhlcvBar[] = [];
    let previousTime = Number.NEGATIVE_INFINITY;
    let bucket = Number.NaN;
    let current: MutableOhlcv | null = null;
    for (const bar of normalized) {
        validateBar(bar, previousTime);
        previousTime = bar.time;
        const nextBucket = Math.floor((bar.time - origin) / interval);
        if (current === null || nextBucket !== bucket) {
            if (current !== null) output.push(finish(current));
            bucket = nextBucket;
            current = {
                time: bar.time,
                open: bar.open,
                high: bar.high,
                low: bar.low,
                close: bar.close,
                volume: bar.volume ?? 0,
                hasVolume: bar.volume !== undefined,
            };
            continue;
        }
        current.high = Math.max(current.high, bar.high);
        current.low = Math.min(current.low, bar.low);
        current.close = bar.close;
        if (bar.volume !== undefined) {
            current.volume += bar.volume;
            current.hasVolume = true;
        }
    }
    if (current !== null) output.push(finish(current));
    return Object.freeze(output);
}

/** Ready-to-use ChartDataController view builder for fixed-duration OHLCV feeds. */
export const ohlcvDataViewBuilder: ChartDataViewBuilder<OhlcvBar> = (bars, context) => {
    const intervalSeconds = groupedInterval(context.resolution, context.groupingLevel);
    return aggregateOhlcvBars(bars, { intervalSeconds });
};

/** Rebuilds only the final time bucket after a replace-last or append update. */
export const ohlcvDataViewUpdater: ChartDataViewUpdater<OhlcvBar> = (bars, context) => {
    const last = bars[bars.length - 1];
    if (last === undefined) return null;
    const intervalSeconds = groupedInterval(context.resolution, context.groupingLevel);
    const bucket = Math.floor(last.time / intervalSeconds);
    let from = bars.length - 1;
    while (from > 0 && Math.floor(bars[from - 1].time / intervalSeconds) === bucket) from--;
    const aggregated = aggregateOhlcvBars(bars.slice(from), { intervalSeconds });
    return aggregated[aggregated.length - 1] ?? null;
};

interface MutableOhlcv {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    hasVolume: boolean;
}

function finish(value: MutableOhlcv): OhlcvBar {
    const result: OhlcvBar = value.hasVolume
        ? {
            time: value.time,
            open: value.open,
            high: value.high,
            low: value.low,
            close: value.close,
            volume: value.volume,
        }
        : {
            time: value.time,
            open: value.open,
            high: value.high,
            low: value.low,
            close: value.close,
        };
    return Object.freeze(result);
}

function validateBar(bar: OhlcvBar, previousTime: number): void {
    if (bar === null || typeof bar !== 'object' || !Number.isFinite(bar.time)
        || !Number.isFinite(bar.open) || !Number.isFinite(bar.high)
        || !Number.isFinite(bar.low) || !Number.isFinite(bar.close)) {
        throw new TypeError('sschart: OHLCV bar contains a non-finite field');
    }
    if (bar.time < previousTime)
        throw new RangeError('sschart: OHLCV bars must be ordered by ascending time');
    if (bar.volume !== undefined && (!Number.isFinite(bar.volume) || bar.volume < 0))
        throw new TypeError('sschart: OHLCV volume must be finite and non-negative when provided');
}

function positive(value: number | undefined, name: string): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
        throw new RangeError(`sschart: ${name} must be a positive safe integer`);
    return value;
}

function groupedInterval(resolution: string, groupingLevel: number): number {
    const interval = resolutionToSeconds(resolution) * groupingLevel;
    if (!Number.isSafeInteger(interval) || interval < 1)
        throw new RangeError('sschart: grouped OHLCV resolution is too large');
    return interval;
}
