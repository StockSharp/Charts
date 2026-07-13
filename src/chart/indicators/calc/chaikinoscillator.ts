// Chaikin Oscillator (Marc Chaikin) — momentum view of the ADL line.
//   ChaikinOsc = EMA(ADL, fast) - EMA(ADL, slow)        (defaults fast=3, slow=10)
//
// StockSharp's Algo.Indicators does NOT ship a ChaikinOscillator.cs (only
// ChaikinMoneyFlow and ChaikinVolatility). We follow the canonical Chaikin
// definition used by every other charting package: the difference of two
// EMAs taken over the Accumulation/Distribution Line.
//
// We delegate to the existing adl.js (ADL series with carry-forward on bad
// bars / zero range) and reuse a local EMA-over-array helper matching the
// SMA-seeded EMA convention used everywhere else in this folder (see
// trix.js / chaikinvolatility.js / dema.js for the same pattern). We do
// NOT call require('./ema.js') directly because calcEMA consumes candle
// objects (reads .close) — here we need EMA over a plain (number|null)[]
// of ADL values, so it's a few lines simpler to inline the cascade form.
//
// Warm-up: EMA(slow) seeds at index `slow - 1` (SMA-seed convention).
// EMA(fast) seeds at `fast - 1`. First non-null oscillator lands at
// `max(fast, slow) - 1` (which is `slow - 1` for fast<slow).

import { calcADL } from './adl.js';

/**
 * @typedef {object} CandlePoint
 * @property {string|number} time
 * @property {number} open
 * @property {number} high
 * @property {number} low
 * @property {number} close
 * @property {number} [volume]
 */

/**
 * @typedef {{time: string|number, value: number|null}} IndicatorPoint
 */

/**
 * Local EMA over a (number|null)[] series, SMA-seeded over the first
 * `length` finite values. Same shape as helpers used by trix.js etc.
 * @param {(number|null)[]} values
 * @param {number} length
 * @returns {(number|null)[]}
 */
function emaSeries(values, length) {
    const n = values.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = null;
    if (length <= 0) return out;

    const k = 2 / (length + 1);
    let seedSum = 0;
    let seedCount = 0;
    let seedDone = false;
    let prev = 0;

    for (let i = 0; i < n; i++) {
        const v = values[i];
        const ok = typeof v === 'number' && Number.isFinite(v);
        if (!seedDone) {
            if (!ok) continue;
            seedSum += v;
            seedCount++;
            if (seedCount === length) {
                prev = seedSum / length;
                out[i] = prev;
                seedDone = true;
            }
            continue;
        }
        if (!ok) {
            out[i] = null;
            continue;
        }
        prev = v * k + prev * (1 - k);
        out[i] = prev;
    }
    return out;
}

/**
 * @param {CandlePoint[]} candles
 * @param {{fast?: number, slow?: number}} [params]
 * @returns {IndicatorPoint[]}
 */
export function calcChaikinOscillator(candles, params) {
    const fast = params && Number.isFinite(params.fast) ? (params.fast | 0) : 3;
    const slow = params && Number.isFinite(params.slow) ? (params.slow | 0) : 10;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    if (fast <= 0 || slow <= 0) return out;

    const adl = calcADL(candles, {});
    const adlValues = new Array(n);
    for (let i = 0; i < n; i++) adlValues[i] = adl[i] && typeof adl[i].value === 'number' ? adl[i].value : null;

    const emaFast = emaSeries(adlValues, fast);
    const emaSlow = emaSeries(adlValues, slow);

    for (let i = 0; i < n; i++) {
        const f = emaFast[i];
        const s = emaSlow[i];
        if (f === null || s === null) continue;
        out[i] = { time: candles[i].time, value: f - s };
    }
    return out;
}
