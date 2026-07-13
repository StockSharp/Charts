// Range Action Verification Index — JS port of
// D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\RangeActionVerificationIndex.cs.
//
//   ravi[i] = | 100 * (SMA(close, short)[i] - SMA(close, long)[i]) / SMA(close, long)[i] |
//
// Returns absolute value (per .cs `(... ).Abs()`). When long-SMA is zero,
// output is null (.cs emits empty value).
// Deviations from .cs: none — formula is straight 1:1.
//
// @typedef {{time:number|string,open:number,high:number,low:number,close:number,volume:number}} Candle
// @typedef {{time:number|string,value:number|null}} Point

import { simpleMA as simpleMA_RAVI } from './helpers.js';

/**
 * @param {Candle[]} candles
 * @param {{shortLength?: number, longLength?: number}} [params]
 * @returns {Point[]}
 */
export function calcRangeActionVerificationIndex(candles, params) {
    const shortLen = params && Number.isFinite(params.shortLength) ? (params.shortLength | 0) : 7;
    const longLen = params && Number.isFinite(params.longLength) ? (params.longLength | 0) : 65;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i] && candles[i].time, value: null };

    if (shortLen <= 0 || longLen <= 0) return out;

    const closes = new Array(n);
    for (let i = 0; i < n; i++) closes[i] = candles[i] && candles[i].close;

    const shortSma = simpleMA_RAVI(closes, shortLen);
    const longSma = simpleMA_RAVI(closes, longLen);

    for (let i = 0; i < n; i++) {
        const s = shortSma[i];
        const l = longSma[i];
        if (s === null || l === null || l === 0) continue;
        out[i] = { time: candles[i].time, value: Math.abs(100 * (s - l) / l) };
    }
    return out;
}
