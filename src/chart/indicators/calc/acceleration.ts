// Acceleration / Deceleration (Bill Williams).
//   AO[i] = SMA(median, 5)[i] - SMA(median, 34)[i]      (Awesome Oscillator)
//   AC[i] = AO[i] - SMA(AO, 5)[i]
// Port of StockSharp Algo.Indicators Acceleration.cs: it composes the
// AwesomeOscillator indicator with an SMA(5) of AO values. We do the same:
// reuse the already-ported calcAwesomeOscillator and feed its output through
// the simpleMA helper.
//
// Warm-up: AO with default 5/34 lands its first non-null at index 33. Then
// SMA-5 over AO needs 5 more non-null AO points → first non-null AC at
// index 37 with defaults. NumValuesToInitialize in .cs is AO+SMA-1.

import { simpleMA } from './helpers.js';
import { calcAwesomeOscillator } from './awesomeoscillator.js';

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
 * @param {{shortLength?: number, longLength?: number, smaLength?: number}} [params]
 * @returns {IndicatorPoint[]}
 */
export function calcAcceleration(candles, params) {
    const shortLength = params && Number.isFinite(params.shortLength) ? (params.shortLength | 0) : 5;
    const longLength = params && Number.isFinite(params.longLength) ? (params.longLength | 0) : 34;
    const smaLength = params && Number.isFinite(params.smaLength) ? (params.smaLength | 0) : 5;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const ao = calcAwesomeOscillator(candles, { shortLength, longLength });

    // Extract AO numeric series (null → NaN so simpleMA's invalid-counter trips).
    const aoVals = new Array(n);
    for (let i = 0; i < n; i++) {
        const v = ao[i] && ao[i].value;
        aoVals[i] = (typeof v === 'number' && Number.isFinite(v)) ? v : NaN;
    }

    const aoSma = simpleMA(aoVals, smaLength);

    const out = new Array(n);
    for (let i = 0; i < n; i++) {
        const t = candles[i].time;
        const a = ao[i] && ao[i].value;
        const s = aoSma[i];
        if (typeof a !== 'number' || !Number.isFinite(a) || s === null) {
            out[i] = { time: t, value: null };
        } else {
            out[i] = { time: t, value: a - s };
        }
    }
    return out;
}
