// Shift indicator — JS port of D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\Shift.cs.
//
// .cs only delays the FIRST emitted value by `Length` bars; once formed it
// returns the current close (not a shifted-back close). Implementation
// matches: first `length` outputs are null, subsequent outputs are
// close[i] verbatim. Default Length = 1.
// Deviations from .cs: none — .cs really just gates output by counting down
// `_left` and emits the current input once `_left <= 0`.

import type { CandlePoint, IndicatorParams } from './types.js';

export function calcShift(candles: CandlePoint[], params?: IndicatorParams) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 1;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const t = c && c.time;
        if (i < length) {
            out[i] = { time: t, value: null };
            continue;
        }
        const v = c && c.close;
        out[i] = {
            time: t,
            value: typeof v === 'number' && Number.isFinite(v) ? v : null,
        };
    }
    return out;
}
