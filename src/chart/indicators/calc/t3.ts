// T3 Moving Average (Tillson) — JS port of D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\T3MovingAverage.cs.
// Deviations from .cs: none.
//
// Chain of six EMAs of identical length applied recursively:
//   e1 = EMA(close, length)
//   e2 = EMA(e1,    length)
//   e3 = EMA(e2,    length)
//   e4 = EMA(e3,    length)
//   e5 = EMA(e4,    length)
//   e6 = EMA(e5,    length)
// Coefficients (vf = VolumeFactor):
//   c1 = -vf³
//   c2 = 3*vf² + 3*vf³
//   c3 = -6*vf² - 3*vf - 3*vf³
//   c4 = 1 + 3*vf + vf³ + 3*vf²
// T3 = c1*e6 + c2*e5 + c3*e4 + c4*e3.
//
// Warm-up: C# EMA emits `Buffer.Sum / Length` (partial seed) from bar 0
// even before the buffer fills, so every EMA in the cascade has a non-null
// value from bar 0. All six EMAs become IsFormed at bar (length-1). The
// .cs then delays the outer IsFormed by `_defaultWarmUpPeriod = 10` bars
// after all EMAs are formed.
//
// Defaults: length = 5, volumeFactor = 0.7 per the .cs constructor.
//
// @typedef {{time:number|string,open:number,high:number,low:number,close:number,volume:number}} Candle
// @typedef {{time:number|string,value:number|null}} Point

import { partialSeedEMA } from './helpers.js';

/**
 * Track when each EMA in the cascade first reaches IsFormed (Buffer.Count
 * >= length). Returns array of 0-based bar indices for [e1.formedAt,
 * e2.formedAt, ..., e6.formedAt]. Each subsequent EMA forms at the same
 * bar as the previous (since C# EMA emits non-null from bar 0). All form
 * at bar length-1.
 *
 * @param {(number|null)[]} values
 * @param {number} length
 * @returns {{out:(number|null)[], formedAt:number}}
 */
function emaCascadePartial(values, length) {
    const out = partialSeedEMA(values, length);
    // C# EMA's IsFormed becomes true at the bar where Buffer.Count >= Length.
    // Find the first index where out is non-null and we've seen `length`
    // finite samples in values.
    let count = 0;
    let formedAt = -1;
    for (let i = 0; i < values.length; i++) {
        const v = values[i];
        if (typeof v === 'number' && Number.isFinite(v)) {
            count++;
            if (count >= length) { formedAt = i; break; }
        }
    }
    return { out, formedAt };
}

/**
 * @param {Candle[]} candles
 * @param {{length?: number, volumeFactor?: number}} [params]
 * @returns {Point[]}
 */
export function calcT3(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 5;
    const vf = params && Number.isFinite(params.volumeFactor) ? +params.volumeFactor : 0.7;
    if (!Array.isArray(candles) || candles.length === 0) return [];
    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };
    if (length <= 0 || !(vf > 0 && vf < 1)) return out;

    const closes = new Array(n);
    for (let i = 0; i < n; i++) closes[i] = candles[i] && candles[i].close;

    // C# EMA emits Buffer.Sum/Length (partial seed) from bar 0 even before
    // IsFormed; each subsequent cascade level therefore also receives
    // non-null inputs from bar 0. All six EMAs reach IsFormed simultaneously
    // at bar length-1.
    const c1stage = emaCascadePartial(closes, length);
    const c2stage = emaCascadePartial(c1stage.out, length);
    const c3stage = emaCascadePartial(c2stage.out, length);
    const c4stage = emaCascadePartial(c3stage.out, length);
    const c5stage = emaCascadePartial(c4stage.out, length);
    const c6stage = emaCascadePartial(c5stage.out, length);
    const e1 = c1stage.out;
    const e2 = c2stage.out;
    const e3 = c3stage.out;
    const e4 = c4stage.out;
    const e5 = c5stage.out;
    const e6 = c6stage.out;

    // Bar at which all six EMAs report IsFormed (max of their formedAt).
    const formedBar = Math.max(c1stage.formedAt, c2stage.formedAt, c3stage.formedAt,
                               c4stage.formedAt, c5stage.formedAt, c6stage.formedAt);

    const v2 = vf * vf;
    const v3 = v2 * vf;
    const c1 = -v3;
    const c2 = 3 * v2 + 3 * v3;
    const c3 = -6 * v2 - 3 * vf - 3 * v3;
    const c4 = 1 + 3 * vf + v3 + 3 * v2;

    const defaultWarmUpPeriod = 10;
    let warmUp = defaultWarmUpPeriod;

    for (let i = 0; i < n; i++) {
        const allFormed = formedBar >= 0 && i >= formedBar
            && e1[i] !== null && e2[i] !== null && e3[i] !== null
            && e4[i] !== null && e5[i] !== null && e6[i] !== null;
        // Mirror the .cs order: decrement the warm-up counter first, then test
        // IsFormed (allFormed && warmUp == 0) on the SAME bar — so the bar where
        // warmUp reaches 0 already emits (previously it was one bar too late).
        if (warmUp > 0 && allFormed) warmUp--;
        if (!(allFormed && warmUp === 0)) continue;
        out[i] = {
            time: candles[i].time,
            value: c1 * e6[i]! + c2 * e5[i]! + c3 * e4[i]! + c4 * e3[i]!,
        };
    }

    return out;
}
