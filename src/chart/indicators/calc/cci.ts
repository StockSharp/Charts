// Commodity Channel Index (Donald Lambert, 1980).
// typical[i]   = (high + low + close) / 3
// smaTP[i]     = SMA(typical, length)
// meanDev[i]   = (1/length) * Σ_{j=i-length+1..i} |typical[j] - smaTP[i]|
// CCI[i]       = (typical[i] - smaTP[i]) / (0.015 * meanDev[i])
//
// Null until index `length-1`. When meanDeviation is exactly zero (flat
// typical-price window) the formula divides by zero; we emit 0 — same
// convention StockSharp's CCI uses, and it keeps the line continuous on
// the chart instead of dropping out into nulls.

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
 * @param {{length?: number}} [params]
 * @returns {IndicatorPoint[]}
 */
export function calcCCI(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 20;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    if (length <= 0) return out;

    // Typical price per candle.
    const tp = new Array(n);
    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const h = c && c.high;
        const l = c && c.low;
        const cl = c && c.close;
        if (typeof h !== 'number' || !Number.isFinite(h) ||
            typeof l !== 'number' || !Number.isFinite(l) ||
            typeof cl !== 'number' || !Number.isFinite(cl)) {
            tp[i] = null;
            continue;
        }
        tp[i] = (h + l + cl) / 3;
    }

    const smaTP = simpleMA(tp, length);

    for (let i = length - 1; i < n; i++) {
        const mean = smaTP[i];
        const tpi = tp[i];
        if (mean === null || tpi === null) {
            out[i] = { time: candles[i].time, value: null };
            continue;
        }
        let devSum = 0;
        let bad = false;
        for (let j = i - length + 1; j <= i; j++) {
            const v = tp[j];
            if (v === null) { bad = true; break; }
            devSum += Math.abs(v - mean);
        }
        if (bad) {
            out[i] = { time: candles[i].time, value: null };
            continue;
        }
        const meanDev = devSum / length;
        let value;
        if (meanDev === 0) {
            // Flat window — formula divides by zero. Emit 0 (numerator
            // is also 0 in any reasonable flat case) and let the chart
            // keep the line continuous.
            value = 0;
        } else {
            value = (tpi - mean) / (0.015 * meanDev);
        }
        out[i] = { time: candles[i].time, value };
    }
    return out;
}
