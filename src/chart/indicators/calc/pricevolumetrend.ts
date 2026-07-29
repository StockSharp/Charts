// Price Volume Trend (PVT) — JS port of D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\PriceVolumeTrend.cs.
// Deviations from .cs: none.
//   First bar: emit null (no previous close to compute pct change).
//   Subsequent: pvt = prevPvt + volume * (close - prevClose) / prevClose.
//   pvt seed = 0 (per .cs Reset).

import type { CandlePoint, IndicatorParams, IndicatorPoint } from './types.js';

export function calcPriceVolumeTrend(candles: CandlePoint[], _params?: IndicatorParams): IndicatorPoint[] {
    if (!Array.isArray(candles) || candles.length === 0) return [];
    const n = candles.length;
    const out = new Array(n);

    let pvt = 0;
    let prevClose = 0; // .cs: 0 means "not seeded yet"

    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const t = c && c.time;
        const cl = c && c.close;
        const v = c && c.volume;
        const okClose = typeof cl === 'number' && Number.isFinite(cl);
        const okVol = typeof v === 'number' && Number.isFinite(v);

        if (!okClose || !okVol) {
            out[i] = { time: t, value: null };
            continue;
        }

        if (prevClose === 0) {
            // Seed; .cs returns empty DecimalIndicatorValue here.
            out[i] = { time: t, value: null };
            prevClose = cl;
            continue;
        }

        const priceChange = (cl - prevClose) / prevClose;
        pvt += v * priceChange;
        prevClose = cl;
        out[i] = { time: t, value: pvt };
    }

    return out;
}
