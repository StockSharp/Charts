// Lowest indicator (Algo.Indicators/Lowest.cs).
// Trailing minimum of the candle CLOSE over `length` bars. Mirror of Highest.
// Aligned 1:1 with input candles.
//
// Lowest.cs reads `input.ToCandle().LowPrice`, but the class inherits
// [IndicatorIn(typeof(DecimalIndicatorValue))] from BaseIndicator and does not
// override it, so the platform feeds it a decimal that ToCandle() expands into
// a candle with open == high == low == close — the close on a candle feed. See
// highest.ts for the full mechanism.
//
// DecimalLengthIndicator: IsFormed only once `length` values are buffered, so
// nothing is emitted before index `length - 1`.
//
// Default length: 5 (matches the .cs default).

import type { CandlePoint, IndicatorParams, IndicatorPoint } from './types.js';

/** Trailing min of candle.close over `length` bars. */
export function calcLowest(candles: CandlePoint[], params?: IndicatorParams): IndicatorPoint[] {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 5;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };
    if (length <= 0) return out;

    for (let i = length - 1; i < n; i++) {
        let lo = +Infinity;
        let bad = false;
        for (let j = i - length + 1; j <= i; j++) {
            const c = candles[j];
            const cl = c && c.close;
            if (typeof cl !== 'number' || !Number.isFinite(cl)) { bad = true; break; }
            if (cl < lo) lo = cl;
        }
        if (bad) continue;
        out[i] = { time: candles[i].time, value: lo };
    }
    return out;
}
