// Pretty Good Oscillator (PGO) — Mark Johnson.
// Port of StockSharp Algo.Indicators PrettyGoodOscillator.cs.
//
// Definition:
//   sma      = SMA(close, length)
//   highest  = max(high) over last `length` bars
//   lowest   = min(low)  over last `length` bars
//   diff     = highest - lowest
//   pgo[i]   = (close[i] - sma[i]) / diff[i] * 100      (diff != 0)
//            = null                                      (diff == 0)
//   null     until all three (sma, highest, lowest) are formed.
//
// Default length: 14 (per .cs ctor).
//
// .cs deviation notes:
//   (a) The .cs uses three component indicators (SMA, Highest, Lowest);
//       IsFormed gates output until all three are formed. SMA and Lowest
//       become formed at index length-1; Highest in StockSharp emits from
//       bar 0 (running max), but its `IsFormed` flag also flips at
//       length-1. So the effective first valid bar is length-1.
//   (b) When highest == lowest (perfectly flat range over the window),
//       .cs returns null. We do the same.

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
export function calcPrettyGoodOscillator(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 14;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    if (length <= 0) return out;

    // SMA of close.
    const closes = new Array(n);
    for (let i = 0; i < n; i++) closes[i] = candles[i] && candles[i].close;
    const sma = simpleMA(closes, length);

    // Rolling highest(high) and lowest(low) over `length` bars.
    // O(n*length) is fine at the magnitudes this code runs at; we mirror
    // the same scan strategy used elsewhere in this calc layer.
    for (let i = length - 1; i < n; i++) {
        const s = sma[i];
        if (s === null) continue;

        let hi = -Infinity, lo = +Infinity, bad = false;
        for (let k = i - length + 1; k <= i; k++) {
            const h = candles[k] && candles[k].high;
            const l = candles[k] && candles[k].low;
            if (typeof h !== 'number' || !Number.isFinite(h) ||
                typeof l !== 'number' || !Number.isFinite(l)) {
                bad = true; break;
            }
            if (h > hi) hi = h;
            if (l < lo) lo = l;
        }
        if (bad) continue;

        const cl = candles[i] && candles[i].close;
        if (typeof cl !== 'number' || !Number.isFinite(cl)) continue;

        const diff = hi - lo;
        if (diff === 0) continue;

        out[i] = { time: candles[i].time, value: (cl - s) / diff * 100 };
    }

    return out;
}
