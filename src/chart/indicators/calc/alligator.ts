// Alligator (Bill Williams) — three smoothed moving averages of median price,
// each shifted forward by a fixed number of bars.
//   Jaw   = SMMA(median, 13) shifted forward by 8 bars
//   Teeth = SMMA(median, 8)  shifted forward by 5 bars
//   Lips  = SMMA(median, 5)  shifted forward by 3 bars
// median = (high + low) / 2. SMMA = Wilder's smoothing (helpers.wilderMA).
// "Shifted forward by S" means SMMA value computed for bar k is plotted at
// bar k+S, so each series gets `S` leading nulls on top of the SMMA warm-up.
// Matches StockSharp's Alligator + AlligatorLine: first non-null output of a
// line with length L and shift S lands at index (L-1)+S.

import { smoothedMA } from './helpers.js';

// AlligatorLine.cs delegates to SmoothedMovingAverage (NOT WilderMA): the
// warm-up emits Buffer.Sum / Length from bar 0 instead of (prev*(n-1)+x)/n
// (i.e. divisor is fixed at Length, even before the buffer fills). Use the
// matching helper so warm-up values line up with the StockSharp reference.
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
 * @typedef {{jaw: IndicatorPoint[], teeth: IndicatorPoint[], lips: IndicatorPoint[]}} AlligatorSeries
 */

/**
 * Build a single shifted SMMA line over median price.
 * @param {CandlePoint[]} candles
 * @param {number[]} medians
 * @param {number} length
 * @param {number} shift
 * @returns {IndicatorPoint[]}
 */
function buildLine(candles, medians, length, shift) {
    const n = candles.length;
    const out = new Array(n);
    const smma = smoothedMA(medians, length);
    // AlligatorLine.cs gates output on `Buffer.Count > Shift`, i.e. the line
    // only emits once Shift+1 SMMA values have accumulated. SMMA itself emits
    // a value from bar 0 (partial seed); the line then waits `shift` extra
    // bars before exposing the first SMMA value. Net effect: first non-null
    // line output lands at bar (length - 1) + shift, with the value taken
    // from SMMA at bar (length - 1) (shifted forward by `shift` bars).
    for (let i = 0; i < n; i++) {
        const src = i - shift;
        // The .cs only treats the line as formed once SMMA itself has hit
        // its (length-1) seed bar AND `shift` more bars have passed; before
        // that, even though SMMA returns a partial-buffer value, the line
        // hasn't pushed enough into its own Shift-sized buffer yet, so
        // output stays null. Replicate by requiring src >= length-1.
        const v = (src >= length - 1 && src < n) ? smma[src] : null;
        out[i] = { time: candles[i].time, value: (v === null || v === undefined) ? null : v };
    }
    return out;
}

/**
 * @param {CandlePoint[]} candles
 * @param {{jawLength?: number, jawShift?: number, teethLength?: number, teethShift?: number, lipsLength?: number, lipsShift?: number}} [params]
 * @returns {AlligatorSeries}
 */
export function calcAlligator(candles, params) {
    const jawLength = params && Number.isFinite(params.jawLength) ? (params.jawLength | 0) : 13;
    const jawShift = params && Number.isFinite(params.jawShift) ? (params.jawShift | 0) : 8;
    const teethLength = params && Number.isFinite(params.teethLength) ? (params.teethLength | 0) : 8;
    const teethShift = params && Number.isFinite(params.teethShift) ? (params.teethShift | 0) : 5;
    const lipsLength = params && Number.isFinite(params.lipsLength) ? (params.lipsLength | 0) : 5;
    const lipsShift = params && Number.isFinite(params.lipsShift) ? (params.lipsShift | 0) : 3;

    if (!Array.isArray(candles) || candles.length === 0) {
        return { jaw: [], teeth: [], lips: [] };
    }

    const n = candles.length;
    const medians = new Array(n);
    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const h = c && c.high;
        const l = c && c.low;
        if (typeof h === 'number' && Number.isFinite(h) &&
            typeof l === 'number' && Number.isFinite(l)) {
            medians[i] = (h + l) / 2;
        } else {
            medians[i] = NaN;
        }
    }

    return {
        jaw: buildLine(candles, medians, jawLength, jawShift),
        teeth: buildLine(candles, medians, teethLength, teethShift),
        lips: buildLine(candles, medians, lipsLength, lipsShift),
    };
}
