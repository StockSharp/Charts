// Disparity Index indicator (Algo.Indicators/DisparityIndex.cs).
// Single-output. Percentage difference between the close and its own
// trailing SMA:
//
//   DPI[i] = (close[i] - SMA(close, length)[i]) / SMA × 100
//
// .cs extends SimpleMovingAverage directly — `base.OnProcessDecimal` is
// the SMA and the override only fires after `IsFormed` is true. So warm-up
// is identical to SMA: first non-null output at index `length - 1`.
//
// Notes:
//   * If SMA is zero we'd divide by zero — .cs doesn't guard this case
//     and would emit ±Infinity. We mirror that and emit `null` only when
//     SMA itself is null (warm-up); a literal SMA == 0 falls through and
//     produces Infinity. In practice closes are positive, so this is a
//     theoretical edge case but worth documenting.

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
 * @param {CandlePoint[]} candles
 * @param {{length?: number}} [params]
 * @returns {IndicatorPoint[]}
 */
export function calcDisparityIndex(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 14;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };
    if (length <= 0) return out;

    const closes = new Array(n);
    for (let i = 0; i < n; i++) closes[i] = candles[i] && candles[i].close;

    const sma = simpleMA(closes, length);
    for (let i = 0; i < n; i++) {
        const s = sma[i];
        const c = closes[i];
        if (s === null || s === undefined) continue;
        if (typeof c !== 'number' || !Number.isFinite(c)) continue;
        out[i] = { time: candles[i].time, value: (c - s) / s * 100 };
    }
    return out;
}
