// Positive Volume Index — JS port of D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\PositiveVolumeIndex.cs.
// Deviations from .cs: none.
//   pvi seed = 1000
//   per bar: if prevClose!=0 && prevVolume!=0 && volume>0 && volume>prevVolume:
//                pvi += pvi * (close - prevClose) / prevClose
//            else: pvi unchanged.
// Mirror image of NVI (see nvi.js).

import type { CandlePoint, IndicatorParams, IndicatorPoint } from './types.js';

export function calcPositiveVolumeIndex(candles: CandlePoint[], _params?: IndicatorParams): IndicatorPoint[] {
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);

    let prevClose = 0;
    let prevVolume = 0;
    let pvi = 1000;

    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const t = c && c.time;
        const cl = c && c.close;
        const v = c && c.volume;
        const okClose = typeof cl === 'number' && Number.isFinite(cl);
        const okVol = typeof v === 'number' && Number.isFinite(v);

        if (!okClose || !okVol) {
            // Carry without advancing state.
            out[i] = { time: t, value: pvi };
            continue;
        }

        let nextPvi = pvi;
        if (prevClose !== 0 && prevVolume !== 0 && v > 0) {
            if (v > prevVolume) {
                const pct = (cl - prevClose) / prevClose;
                nextPvi = pvi + pvi * pct;
            }
        }

        prevClose = cl;
        prevVolume = v;
        pvi = nextPvi;

        out[i] = { time: t, value: pvi };
    }

    return out;
}
