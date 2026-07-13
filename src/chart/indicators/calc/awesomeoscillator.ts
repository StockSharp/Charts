// Awesome Oscillator (Bill Williams).
//   AO[i] = SMA(median, 5)[i] - SMA(median, 34)[i]
//   median = (high + low) / 2
// Histogram colour hint: `up = AO[i] >= AO[i-1]` (rising → green bar).
// Bar 0 has no prior reference; we default `up:true` to mirror the volume
// indicator's neutral colour fallback.

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
 * @typedef {{time: string|number, value: number|null, up: boolean}} AOPoint
 */

/**
 * @param {CandlePoint[]} candles
 * @param {{shortLength?: number, longLength?: number}} [params]
 * @returns {AOPoint[]}
 */
export function calcAwesomeOscillator(candles, params) {
    const shortLen = params && Number.isFinite(params.shortLength) ? (params.shortLength | 0) : 5;
    const longLen = params && Number.isFinite(params.longLength) ? (params.longLength | 0) : 34;

    if (!Array.isArray(candles) || candles.length === 0) return [];

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

    const shortSma = simpleMA(medians, shortLen);
    const longSma = simpleMA(medians, longLen);

    const out = new Array(n);
    let prev: number | null = null;
    for (let i = 0; i < n; i++) {
        const t = candles[i].time;
        const s = shortSma[i];
        const l = longSma[i];
        let v: number | null = null;
        if (s !== null && l !== null) v = s - l;
        let up = true;
        if (v !== null && prev !== null) up = v >= prev;
        out[i] = { time: t, value: v, up };
        if (v !== null) prev = v;
    }
    return out;
}
