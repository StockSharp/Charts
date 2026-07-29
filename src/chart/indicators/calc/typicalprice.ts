// Typical Price — JS port of D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\TypicalPrice.cs.
// Deviations from .cs: none. Per bar: (high + low + close) / 3.

import type { CandlePoint, IndicatorParams } from './types.js';

/**
 * @returns {IndicatorPoint[]}
 */
export function calcTypicalPrice(candles: CandlePoint[], _params?: IndicatorParams) {
    if (!Array.isArray(candles) || candles.length === 0) return [];
    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const t = c && c.time;
        const h = c && c.high;
        const l = c && c.low;
        const cl = c && c.close;
        const ok = typeof h === 'number' && Number.isFinite(h)
            && typeof l === 'number' && Number.isFinite(l)
            && typeof cl === 'number' && Number.isFinite(cl);
        out[i] = { time: t, value: ok ? (h + l + cl) / 3 : null };
    }
    return out;
}
