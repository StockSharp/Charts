// Moving Average Crossover signal.
// Port of StockSharp Algo.Indicators MovingAverageCrossover.cs.
//
// Two SimpleMovingAverages over close (fast `ShortPeriod` default 25, slow
// `LongPeriod` default 50). The .cs returns
//   fast.CompareTo(slow) ∈ { -1, 0, +1 }
// once both MAs are formed (`IsFormed = fast.IsFormed && slow.IsFormed`),
// otherwise empty. We expose:
//   { fast: IndicatorPoint[], slow: IndicatorPoint[], signal: IndicatorPoint[] }
//   signal[i].value: -1 / 0 / +1 once both MAs are warm, otherwise null.
// Fast and slow series are emitted alongside the signal because the chart
// likes to overlay the two MAs on price and plot the signal separately.
// `Measure = MinusOnePlusOne` on the .cs is just metadata for the axis
// scaler; the raw integer sign value is what the .cs emits.

import { simpleMA } from './helpers.js';

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
 * @typedef {{fast: IndicatorPoint[], slow: IndicatorPoint[], signal: IndicatorPoint[]}} MACrossSeries
 */

/**
 * @param {CandlePoint[]} candles
 * @param {{shortPeriod?: number, longPeriod?: number}} [params]
 * @returns {MACrossSeries}
 */
export function calcMovingAverageCrossover(candles, params) {
    const shortPeriod = params && Number.isFinite(params.shortPeriod) ? (params.shortPeriod | 0) : 25;
    const longPeriod = params && Number.isFinite(params.longPeriod) ? (params.longPeriod | 0) : 50;

    if (!Array.isArray(candles) || candles.length === 0) {
        return { fast: [], slow: [], signal: [] };
    }

    const n = candles.length;
    const closes = new Array(n);
    for (let i = 0; i < n; i++) closes[i] = candles[i] && candles[i].close;

    const fastArr = simpleMA(closes, shortPeriod);
    const slowArr = simpleMA(closes, longPeriod);

    const fast = new Array(n);
    const slow = new Array(n);
    const signal = new Array(n);
    for (let i = 0; i < n; i++) {
        const t = candles[i].time;
        const f = fastArr[i];
        const s = slowArr[i];
        fast[i] = { time: t, value: f };
        slow[i] = { time: t, value: s };
        if (f === null || s === null) {
            signal[i] = { time: t, value: null };
        } else if (f > s) {
            signal[i] = { time: t, value: 1 };
        } else if (f < s) {
            signal[i] = { time: t, value: -1 };
        } else {
            signal[i] = { time: t, value: 0 };
        }
    }
    return { fast, slow, signal };
}
