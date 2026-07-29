// PassThrough indicator — JS port of D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\PassThroughIndicator.cs.
// Deviations from .cs: none — formula is straight 1:1, just returns the input
// (close price) verbatim for every candle.

import type { CandlePoint, IndicatorParams, IndicatorPoint } from './types.js';

export function calcPassThrough(candles: CandlePoint[], _params?: IndicatorParams): IndicatorPoint[] {
    if (!Array.isArray(candles) || candles.length === 0) return [];
    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const v = c && c.close;
        out[i] = {
            time: c && c.time,
            value: typeof v === 'number' && Number.isFinite(v) ? v : null,
        };
    }
    return out;
}
