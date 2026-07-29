// Weighted Close Price —
// JS port of D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\WeightedClosePrice.cs.
// wcp[i] = (high + low + 2*close) / 4. Per-candle, no warm-up.
//
// Deviations from .cs: none.

import type { CandlePoint, IndicatorParams } from './types.js';

/**
 * @returns {IndicatorPoint[]}
 */
export function calcWeightedClosePrice(candles: CandlePoint[], _params?: IndicatorParams) {
    if (!Array.isArray(candles) || candles.length === 0) return [];
    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const h = c && c.high, l = c && c.low, cl = c && c.close;
        if (typeof h !== 'number' || !Number.isFinite(h) ||
            typeof l !== 'number' || !Number.isFinite(l) ||
            typeof cl !== 'number' || !Number.isFinite(cl)) {
            out[i] = { time: c.time, value: null };
        } else {
            out[i] = { time: c.time, value: (h + l + 2 * cl) / 4 };
        }
    }
    return out;
}
