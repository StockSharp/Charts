// Smoothed Moving Average (SMMA).
// Port of StockSharp Algo.Indicators SmoothedMovingAverage.cs. Mathematically
// identical to Wilder's smoothing already used by RSI / ADX / ATR:
//   seed:        SMMA[length-1] = mean(close[0..length-1])
//   subsequent:  SMMA[i] = (SMMA[i-1] * (length-1) + close[i]) / length
// First (length-1) outputs are null.
//
// SMMA is exposed as a standalone indicator (and as the smoothing kernel of
// Alligator / RSI). We just delegate to helpers.wilderMA on closes.

import { wilderMA } from './helpers.js';

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
export function calcSMMA(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 32;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };
    if (length <= 0) return out;

    const closes = new Array(n);
    for (let i = 0; i < n; i++) closes[i] = candles[i] && candles[i].close;

    const smoothed = wilderMA(closes, length);
    for (let i = 0; i < n; i++) {
        if (smoothed[i] !== null && smoothed[i] !== undefined) {
            out[i] = { time: candles[i].time, value: smoothed[i] };
        }
    }
    return out;
}
