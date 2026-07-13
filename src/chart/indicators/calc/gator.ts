// Gator Oscillator (Bill Williams).
// Port of StockSharp Algo.Indicators GatorOscillator.cs + GatorHistogram.cs.
//
// Composes the Alligator's three shifted SMMA lines (Jaw, Teeth, Lips) and
// emits two histograms:
//   Histogram1 (upper, drawn above zero)  =  |Jaw - Lips|
//   Histogram2 (lower, drawn below zero)  = -|Lips - Teeth|
// The negative sign on Histogram2 is hard-coded in the .cs constructor
// (`new(_alligator.Lips, _alligator.Teeth, true)` — the third arg is
// `isNegative`). So Histogram2 is intentionally non-positive on output;
// chart renderers flip it across the x-axis to form the classic two-
// sided "gator jaws" histogram.
//
// Defaults mirror Alligator.cs: jaw=13/shift8, teeth=8/shift5, lips=5/shift3.
//
// .cs deviation notes:
// (a) The .cs class is a BaseComplexIndicator yielding two scalar values
//     per bar. We expose them as two parallel IndicatorPoint[] series
//     ({upper, lower}) so each value stays paired with the candle time.
// (b) The .cs reads each Alligator line via `Line.GetNullableCurrentValue()`
//     and returns null whenever either side is null. Our calcAlligator
//     already encodes the same null-propagation rule, so we just reuse it.

import { calcAlligator } from './alligator.js';

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
 * @typedef {{upper: IndicatorPoint[], lower: IndicatorPoint[]}} GatorSeries
 */

/**
 * @param {CandlePoint[]} candles
 * @param {{jawLength?: number, jawShift?: number, teethLength?: number, teethShift?: number, lipsLength?: number, lipsShift?: number}} [params]
 * @returns {GatorSeries}
 */
export function calcGatorOscillator(candles, params) {
    if (!Array.isArray(candles) || candles.length === 0) {
        return { upper: [], lower: [] };
    }

    const n = candles.length;
    const all = calcAlligator(candles, params || {});

    const upper = new Array(n);
    const lower = new Array(n);
    for (let i = 0; i < n; i++) {
        const t = candles[i].time;
        const jaw = all.jaw[i] && all.jaw[i].value;
        const teeth = all.teeth[i] && all.teeth[i].value;
        const lips = all.lips[i] && all.lips[i].value;

        const okJaw = typeof jaw === 'number' && Number.isFinite(jaw);
        const okTeeth = typeof teeth === 'number' && Number.isFinite(teeth);
        const okLips = typeof lips === 'number' && Number.isFinite(lips);

        upper[i] = { time: t, value: (okJaw && okLips) ? Math.abs(jaw - lips) : null };
        lower[i] = { time: t, value: (okLips && okTeeth) ? -Math.abs(lips - teeth) : null };
    }
    return { upper, lower };
}
