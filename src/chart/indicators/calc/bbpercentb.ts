// Bollinger %b — position of price within the Bollinger band envelope.
// Port of StockSharp Algo.Indicators BollingerPercentB.cs:
//
//   bb     = BollingerBands(close, Length, StdDevMultiplier)
//   %b     = (close - bb.lower) / (bb.upper - bb.lower) * 100
//
// Defaults: Length=20, StdDevMultiplier=2. Standard deviation in the
// underlying BollingerBands is population (÷N) — same as bb.js in this
// repo. First non-null at index Length-1. Returns null when band width
// collapses to 0 (constant series within the window).
//
// .cs deviation: none. Note the .cs multiplies by 100 → output is in
// percent units; a price sitting on the lower band is 0, on the upper
// band is 100. The textbook variant returns 0..1 — we follow the .cs.

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
 * @param {{length?: number, stdDevMultiplier?: number}} [params]
 * @returns {IndicatorPoint[]}
 */
export function calcBollingerPercentB(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 20;
    const k = params && Number.isFinite(params.stdDevMultiplier)
        ? +params.stdDevMultiplier : 2;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    if (length <= 0) return out;

    const closes = new Array(n);
    for (let i = 0; i < n; i++) {
        const c = candles[i] && candles[i].close;
        closes[i] = typeof c === 'number' && Number.isFinite(c) ? c : null;
    }

    const sma = simpleMA(closes, length);

    for (let i = length - 1; i < n; i++) {
        const m = sma[i];
        const price = closes[i];
        if (m === null || price === null) continue;

        let sumSq = 0;
        let bad = false;
        for (let j = i - length + 1; j <= i; j++) {
            const v = closes[j];
            if (v === null) { bad = true; break; }
            const d = v - m;
            sumSq += d * d;
        }
        if (bad) continue;
        const sigma = Math.sqrt(sumSq / length);
        const upper = m + k * sigma;
        const lower = m - k * sigma;
        const width = upper - lower;
        if (width === 0) continue; // .cs returns empty value
        out[i] = { time: candles[i].time, value: (price - lower) / width * 100 };
    }

    return out;
}
