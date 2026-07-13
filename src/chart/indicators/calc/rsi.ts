// Relative Strength Index (Wilder, 1978) — matches StockSharp
// RelativeStrengthIndex.cs which uses SmoothedMovingAverage (SMMA) for the
// average gain / average loss. SMMA is NOT the textbook "SMA seed then
// Wilder recursion" — during the warm-up window (the first `length` calls)
// it returns `Buffer.Sum / length` (i.e. the partial sum divided by the
// FULL length, not by the running count). Once `length` values have been
// buffered, it switches to Wilder recursion
// `prev * (length - 1) / length + new / length`.
//
// Per-candle flow (mirrors C# OnProcessDecimal):
//   * candle[0]: consumed as `_last`, indicator returns null.
//   * candle[i] for i >= 1:
//        delta = close[i] - close[i-1]
//        avgGain = smma_gain.process(delta > 0 ? delta : 0)
//        avgLoss = smma_loss.process(delta > 0 ? 0 : -delta)
//        rsi = 100 * avgGain / (avgGain + avgLoss)  (or 50 if both zero)
//
// Output is per-candle aligned: out[i] is the RSI value computed for
// candle[i] using closes[0..i] (no lookahead). out[0] is always null
// because there is no prior close to take a delta against.

import { smoothedMA } from './helpers.js';

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
export function calcRSI(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 14;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    if (length <= 0 || n < 2) return out;

    // Build the gain/loss series indexed by SMMA call number (1-based in
    // C# terms; here 0-based: gains[k] corresponds to processing candle[k+1]).
    const gains = new Array(n - 1);
    const losses = new Array(n - 1);
    for (let i = 1; i < n; i++) {
        const prev = candles[i - 1] && candles[i - 1].close;
        const curr = candles[i] && candles[i].close;
        if (typeof prev !== 'number' || !Number.isFinite(prev) ||
            typeof curr !== 'number' || !Number.isFinite(curr)) {
            gains[i - 1] = null;
            losses[i - 1] = null;
            continue;
        }
        const d = curr - prev;
        gains[i - 1] = d > 0 ? d : 0;
        losses[i - 1] = d < 0 ? -d : 0;
    }

    const avgG = smoothedMA(gains, length);
    const avgL = smoothedMA(losses, length);

    // Per-candle output: SMMA call #k corresponds to candle[k] (1-indexed),
    // so the result of avgG[k-1] / avgL[k-1] is placed at out[k]. Out[0]
    // remains null (no delta for the first candle).
    for (let k = 0; k < n - 1; k++) {
        const g = avgG[k];
        const l = avgL[k];
        if (g === null || l === null) continue;
        const sum = g + l;
        const rsi = sum === 0 ? 50 : 100 * g / sum;
        out[k + 1] = { time: candles[k + 1].time, value: rsi };
    }
    return out;
}
