// Chande Kroll Stop — adaptive long/short trailing stops.
// Port of StockSharp Algo.Indicators ChandeKrollStop.cs:
//
//   highest    = rolling max(high) over Period bars
//   lowest     = rolling min(low)  over Period bars
//   stopLong   = highest - (highest - lowest) * Multiplier
//   stopShort  = lowest  + (highest - lowest) * Multiplier
//   longStop   = SMA(stopLong, StopPeriod)
//   shortStop  = SMA(stopShort, StopPeriod)
//
// Defaults: Period=10, Multiplier=1.5, StopPeriod=9.
//
// Warm-up: Highest/Lowest form at bar Period-1, and the .cs Adds (and dumps)
// the SMA lines gated on Highest/Lowest.IsFormed — NOT on the SMA's own formed
// flag. The inner SMA is a SimpleMovingAverage (partial-seed: Buffer.Sum /
// StopPeriod from its first input), so the output is non-null from bar
// Period-1 with a growing partial-seed average, becoming a true windowed SMA at
// bar (Period-1)+(StopPeriod-1). We reproduce that with partialSeedSMA.
//
// Output shape: { longStop, shortStop }, each IndicatorPoint[] aligned
// 1:1 with input candles.
//
// Uses partialSeedSMA (helpers) for the StopPeriod smoothing.
//
// .cs deviation: the .cs labels the result entries as `Highest` and
// `Lowest` (the inner indicator keys), but the VALUES stored there are
// the SMA of stopLong / stopShort respectively. We name them more
// intuitively here (`longStop` / `shortStop`) to match common Chande
// Kroll documentation, while keeping the formula identical.

import { partialSeedSMA } from './helpers.js';

/**
 * @typedef {object} CandlePoint
 * @property {string|number} time
 * @property {number} open
 * @property {number} high
 * @property {number} low
 * @property {number} close
 * @property {number} [volume]
 */

/**
 * @typedef {{time: string|number, value: number|null}} IndicatorPoint
 */

/**
 * @typedef {{longStop: IndicatorPoint[], shortStop: IndicatorPoint[]}} ChandeKrollStopSeries
 */

/**
 * @param {CandlePoint[]} candles
 * @param {{period?: number, multiplier?: number, stopPeriod?: number}} [params]
 * @returns {ChandeKrollStopSeries}
 */
export function calcChandeKrollStop(candles, params) {
    const period = params && Number.isFinite(params.period) ? (params.period | 0) : 10;
    const multiplier = params && Number.isFinite(params.multiplier) ? +params.multiplier : 1.5;
    const stopPeriod = params && Number.isFinite(params.stopPeriod) ? (params.stopPeriod | 0) : 9;

    if (!Array.isArray(candles) || candles.length === 0) {
        return { longStop: [], shortStop: [] };
    }

    const n = candles.length;
    const longStop = new Array(n);
    const shortStop = new Array(n);
    for (let i = 0; i < n; i++) {
        longStop[i] = { time: candles[i].time, value: null };
        shortStop[i] = { time: candles[i].time, value: null };
    }

    if (period <= 0 || stopPeriod <= 0) return { longStop, shortStop };

    // Rolling Highest(high) and Lowest(low) over the trailing `period` bars.
    // Compute stopLong/stopShort series, then SMA-smooth them.
    const stopLongs = new Array(n);
    const stopShorts = new Array(n);
    for (let i = 0; i < n; i++) { stopLongs[i] = NaN; stopShorts[i] = NaN; }

    for (let i = period - 1; i < n; i++) {
        let maxH = -Infinity;
        let minL = +Infinity;
        let bad = false;
        for (let j = i - period + 1; j <= i; j++) {
            const c = candles[j];
            const h = c && c.high;
            const l = c && c.low;
            if (typeof h !== 'number' || !Number.isFinite(h) ||
                typeof l !== 'number' || !Number.isFinite(l)) { bad = true; break; }
            if (h > maxH) maxH = h;
            if (l < minL) minL = l;
        }
        if (bad) continue;
        const diff = maxH - minL;
        stopLongs[i] = maxH - diff * multiplier;
        stopShorts[i] = minL + diff * multiplier;
    }

    // Partial-seed SMA (SimpleMovingAverage.cs: Buffer.Sum / StopPeriod) over
    // the stopLong/stopShort streams. Since these are NaN before bar period-1,
    // partialSeedSMA skips them without advancing the buffer, so the first
    // finite sample is at bar period-1 and the output is non-null (a growing
    // partial-seed average) from there — matching the .cs gate on
    // Highest/Lowest.IsFormed rather than on the SMA's own formed flag.
    const smaLong = partialSeedSMA(stopLongs, stopPeriod);
    const smaShort = partialSeedSMA(stopShorts, stopPeriod);
    for (let i = 0; i < n; i++) {
        const t = candles[i].time;
        if (smaLong[i] !== null) longStop[i] = { time: t, value: smaLong[i] };
        if (smaShort[i] !== null) shortStop[i] = { time: t, value: smaShort[i] };
    }

    return { longStop, shortStop };
}
