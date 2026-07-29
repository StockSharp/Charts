// Volume Weighted Average Price (VWAP) —
// JS port of D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\VolumeWeightedAveragePrice.cs.
// vwap[i] = cumsum(typicalPrice[0..i] * volume[0..i]) / cumsum(volume[0..i])
// where typicalPrice = (high + low + close) / 3 (StockSharp GetTypicalPrice).
// The .cs treats the indicator as a single running accumulator that never
// resets — i.e. cumulative from the first input candle. If cumulative
// volume so far is 0 the .cs returns empty; we emit null.
//
// Deviations from .cs: none.

import type { CandlePoint, IndicatorParams } from './types.js';

/**
 * @returns {IndicatorPoint[]}
 */
export function calcVWAP(candles: CandlePoint[], _params?: IndicatorParams) {
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    let cumPv = 0;
    let cumV = 0;
    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const h = c && c.high, l = c && c.low, cl = c && c.close, v = c && c.volume;
        if (typeof h === 'number' && Number.isFinite(h) &&
            typeof l === 'number' && Number.isFinite(l) &&
            typeof cl === 'number' && Number.isFinite(cl) &&
            typeof v === 'number' && Number.isFinite(v)) {
            const tp = (h + l + cl) / 3;
            cumPv += tp * v;
            cumV += v;
        }
        out[i] = {
            time: c.time,
            value: cumV > 0 ? cumPv / cumV : null,
        };
    }
    return out;
}
