// Bollinger Bands — SMA of close with ±N standard deviations.
// Middle = SMA(close, length). Upper/Lower = middle ± stdDev * σ(close, length).
// σ is the population standard deviation over the same trailing window so
// the band tightness matches what StockSharp's BollingerBands emits server-side.

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
 * @typedef {{upper: IndicatorPoint[], middle: IndicatorPoint[], lower: IndicatorPoint[]}} BollingerSeries
 */

/**
 * @param {CandlePoint[]} candles
 * @param {{length?: number, stdDev?: number}} [params]
 * @returns {BollingerSeries}
 */
export function calcBollingerBands(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 20;
    const stdDev = params && Number.isFinite(params.stdDev) ? +params.stdDev : 2;

    if (!Array.isArray(candles) || candles.length === 0) {
        return { upper: [], middle: [], lower: [] };
    }

    const n = candles.length;
    const closes = new Array(n);
    for (let i = 0; i < n; i++) closes[i] = candles[i] && candles[i].close;

    const mid = simpleMA(closes, length);
    const upper = new Array(n);
    const middle = new Array(n);
    const lower = new Array(n);

    for (let i = 0; i < n; i++) {
        const t = candles[i].time;
        const m = mid[i];
        if (m === null || length <= 0 || i < length - 1) {
            upper[i] = { time: t, value: null };
            middle[i] = { time: t, value: null };
            lower[i] = { time: t, value: null };
            continue;
        }
        // Population variance over the same trailing window.
        let sumSq = 0;
        let bad = false;
        for (let j = i - length + 1; j <= i; j++) {
            const c = closes[j];
            if (typeof c !== 'number' || !Number.isFinite(c)) { bad = true; break; }
            const d = c - m;
            sumSq += d * d;
        }
        if (bad) {
            upper[i] = { time: t, value: null };
            middle[i] = { time: t, value: null };
            lower[i] = { time: t, value: null };
            continue;
        }
        const sigma = Math.sqrt(sumSq / length);
        upper[i] = { time: t, value: m + stdDev * sigma };
        middle[i] = { time: t, value: m };
        lower[i] = { time: t, value: m - stdDev * sigma };
    }

    return { upper, middle, lower };
}
