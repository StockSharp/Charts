import type { TimedSeriesData } from '../core/chart-api.js';
import type { BarsPage } from './data-source.js';

/** Validates ascending source order and keeps the last value for duplicate timestamps. */
export function normalizeBars<TBar extends TimedSeriesData>(
    bars: readonly TBar[],
): readonly TBar[] {
    if (!Array.isArray(bars)) throw new TypeError('sschart: data source bars must be an array');
    const normalized: TBar[] = [];
    let previousTime = Number.NEGATIVE_INFINITY;
    for (const sourceBar of bars) {
        if (sourceBar === null || typeof sourceBar !== 'object'
            || typeof sourceBar.time !== 'number' || !Number.isFinite(sourceBar.time)) {
            throw new TypeError('sschart: data source returned a bar with invalid time');
        }
        if (sourceBar.time < previousTime)
            throw new RangeError('sschart: data source bars must be ordered by ascending time');
        const bar = Object.freeze({ ...sourceBar }) as TBar;
        if (sourceBar.time === previousTime) normalized[normalized.length - 1] = bar;
        else normalized.push(bar);
        previousTime = sourceBar.time;
    }
    return Object.freeze(normalized);
}

export function normalizeBarsPage<TBar extends TimedSeriesData>(
    value: BarsPage<TBar>,
): BarsPage<TBar> {
    if (value === null || typeof value !== 'object' || !Array.isArray(value.bars)
        || typeof value.hasMoreBefore !== 'boolean'
        || (value.hasMoreAfter !== undefined && typeof value.hasMoreAfter !== 'boolean')) {
        throw new TypeError('sschart: data source returned an invalid bars page');
    }
    return Object.freeze({
        bars: normalizeBars(value.bars),
        hasMoreBefore: value.hasMoreBefore,
        hasMoreAfter: value.hasMoreAfter === true,
    });
}
