// Wilder Moving Average — JS port of D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\WilderMovingAverage.cs.
// Welles Wilder smoothing, same formula as SMMA:
//   seed:        wma[length-1] = mean(close[0..length-1])
//   subsequent:  wma[i] = (wma[i-1] * (length-1) + close[i]) / length
// Default Length = 32 (matches .cs ctor). First (length-1) outputs are null.
//
// Implementation reuses helpers.wilderMA (the same kernel that drives
// smma.js / rsi.js / adx.js).
//
// Deviations from .cs: none.
//
// @typedef {{time:number|string,open:number,high:number,low:number,close:number,volume:number}} Candle
// @typedef {{time:number|string,value:number|null}} Point

import { wilderMA } from './helpers.js';

/**
 * @param {Candle[]} candles
 * @param {{length?: number}} [params]
 * @returns {Point[]}
 */
export function calcWilderMovingAverage(candles, params) {
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
