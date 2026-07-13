// Elliot Wave Oscillator (EWO).
// Port of StockSharp Algo.Indicators ElliotWaveOscillator.cs.
//   EWO[i] = SMA(close, shortPeriod)[i] - SMA(close, longPeriod)[i]
// Defaults: shortPeriod=5, longPeriod=34 (mirrors the .cs constructor).
//
// .cs deviation note: the .cs implementation runs SMA over the raw
// indicator input (`input.ToDecimal(Source)`), which for our chart input
// is the candle close. Some popular implementations of EWO instead use
// the *median price* `(high+low)/2` (this is what AwesomeOscillator uses
// in the same StockSharp codebase). We follow the .cs verbatim: close.
// If you want the median-price variant, use AwesomeOscillator (5/34) —
// the math is otherwise identical.
//
// Forming: the .cs class becomes formed when BOTH the short and long
// SMAs are formed. The long SMA forms last, so the first non-null EWO
// lands at index `longPeriod - 1`. We rely on simpleMA from helpers.js
// for the SMA convention (null until length-1).

import { simpleMA } from './helpers.js';

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
 * @param {CandlePoint[]} candles
 * @param {{shortPeriod?: number, longPeriod?: number}} [params]
 * @returns {IndicatorPoint[]}
 */
export function calcElliotWaveOscillator(candles, params) {
    const shortPeriod = params && Number.isFinite(params.shortPeriod) ? (params.shortPeriod | 0) : 5;
    const longPeriod = params && Number.isFinite(params.longPeriod) ? (params.longPeriod | 0) : 34;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const closes = new Array(n);
    for (let i = 0; i < n; i++) {
        const c = candles[i] && candles[i].close;
        closes[i] = (typeof c === 'number' && Number.isFinite(c)) ? c : NaN;
    }

    const shortSma = simpleMA(closes, shortPeriod);
    const longSma = simpleMA(closes, longPeriod);

    const out = new Array(n);
    for (let i = 0; i < n; i++) {
        const t = candles[i].time;
        const s = shortSma[i];
        const l = longSma[i];
        if (s === null || l === null) {
            out[i] = { time: t, value: null };
        } else {
            out[i] = { time: t, value: s - l };
        }
    }
    return out;
}
