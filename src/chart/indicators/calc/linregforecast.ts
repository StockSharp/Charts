// Linear Regression Forecast (Algo.Indicators/LinearRegressionForecast.cs).
// Fits a least-squares line over the last `length` closes (x = 0..Length-1)
// and forecasts the value at x = Length (one bar past the last close).
//
// .cs algorithm (verbatim):
//   sumX, sumY, sumXY, sumX2 over buff (size Length)
//   divisor = Length * sumX2 - sumX * sumX
//   if (divisor != 0):
//       slope     = (Length * sumXY - sumX * sumY) / divisor
//       intercept = (sumY - slope * sumX) / Length
//       forecast  = slope * Length + intercept   // one step beyond Length-1
//
// The .cs gates with `IsFormed` (Buffer.Count >= Length) and returns an
// empty DecimalIndicatorValue (= null) otherwise, so our null-warm-up
// matches exactly.
//
// Default length: 14 (matches .cs).
//
// Note on the user's "projects N bars forward" wording: the .cs actually
// projects ONE bar forward (x = Length, i.e. the next bar after the
// window). We honour the .cs exactly — see line `slope * Length + intercept`
// in LinearRegressionForecast.cs.

import type { CandlePoint, IndicatorParams, IndicatorPoint } from './types.js';

/** Compute the one-bar-forward forecast over `length` closes ending at `endIdx`. */
function lrForecast(closes: ReadonlyArray<number | null | undefined>, endIdx: number, length: number): number | null {
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let k = 0; k < length; k++) {
        const y = closes[endIdx - length + 1 + k];
        if (typeof y !== 'number' || !Number.isFinite(y)) return null;
        sumX += k;
        sumY += y;
        sumXY += k * y;
        sumX2 += k * k;
    }
    const divisor = length * sumX2 - sumX * sumX;
    if (divisor === 0) return null;
    const slope = (length * sumXY - sumX * sumY) / divisor;
    const intercept = (sumY - slope * sumX) / length;
    return slope * length + intercept;
}

export function calcLinearRegForecast(candles: CandlePoint[], params?: IndicatorParams): IndicatorPoint[] {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 14;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const closes = new Array(n);
    for (let i = 0; i < n; i++) closes[i] = candles[i] && candles[i].close;

    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };
    if (length <= 0) return out;

    for (let i = length - 1; i < n; i++) {
        const v = lrForecast(closes, i, length);
        if (v !== null) out[i] = { time: candles[i].time, value: v };
    }
    return out;
}
