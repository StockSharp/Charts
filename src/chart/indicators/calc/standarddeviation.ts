// Standard Deviation — JS port of
// D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\StandardDeviation.cs.
//
// Population standard deviation (divides by Length, not Length-1, per .cs
// `std / Length`):
//   mean[i] = SMA(close, Length)[i]
//   std[i]  = sqrt( sum_{k=i-Length+1..i} (close[k] - mean[i])^2 / Length )
// Warm-up: first (length-1) values null.
// Deviations from .cs: none — formula 1:1.
//
// @typedef {{time:number|string,open:number,high:number,low:number,close:number,volume:number}} Candle
// @typedef {{time:number|string,value:number|null}} Point

import { simpleMA as simpleMA_SD } from './helpers.js';

/**
 * @param {Candle[]} candles
 * @param {{length?: number}} [params]
 * @returns {Point[]}
 */
export function calcStandardDeviation(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 10;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i] && candles[i].time, value: null };

    if (length <= 0) return out;

    const closes = new Array(n);
    for (let i = 0; i < n; i++) closes[i] = candles[i] && candles[i].close;
    const sma = simpleMA_SD(closes, length);

    for (let i = length - 1; i < n; i++) {
        const m = sma[i];
        if (m === null) continue;
        let acc = 0;
        let bad = false;
        for (let k = i - length + 1; k <= i; k++) {
            const v = closes[k];
            if (typeof v !== 'number' || !Number.isFinite(v)) { bad = true; break; }
            const d = v - m;
            acc += d * d;
        }
        if (bad) continue;
        out[i] = { time: candles[i].time, value: Math.sqrt(acc / length) };
    }
    return out;
}
