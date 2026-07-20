// Stochastic Oscillator (Lane).
// fastK[i]  = 100 * (close[i] − lowestLow(kPeriod)) / (highestHigh(kPeriod) − lowestLow(kPeriod))
// %K[i]     = SMA(fastK, smooth)           (smooth = 1 → raw %K, matching C#)
// %D[i]     = SMA(%K,    dPeriod)
//
// C# parity: StockSharp's StochasticOscillator.K is a raw StochasticK (no %K
// smoothing) and %D = SMA(3) of that raw %K, so the default `smooth` is 1.
// StochasticK.cs also returns 0 (not 100) when the high==low range is zero.
//
// Param keys match indicator-settings.js's Stochastic entry: kPeriod / dPeriod
// / smooth. The renderer (case 'Stochastic' in indicator-renderer.js)
// consumes `data.k` and `data.d`.

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
 * @typedef {{k: IndicatorPoint[], d: IndicatorPoint[]}} StochasticSeries
 */

/**
 * @param {CandlePoint[]} candles
 * @param {{kPeriod?: number, dPeriod?: number, smooth?: number}} [params]
 * @returns {StochasticSeries}
 */
export function calcStochastic(candles, params) {
    const kPeriod = params && Number.isFinite(params.kPeriod) ? (params.kPeriod | 0) : 14;
    const dPeriod = params && Number.isFinite(params.dPeriod) ? (params.dPeriod | 0) : 3;
    const smooth = params && Number.isFinite(params.smooth) ? (params.smooth | 0) : 1;

    if (!Array.isArray(candles) || candles.length === 0) {
        return { k: [], d: [] };
    }

    const n = candles.length;

    // 1) fast %K = 100 * (close - lowestLow) / (highestHigh - lowestLow)
    const fastK = new Array(n);
    for (let i = 0; i < n; i++) {
        if (kPeriod <= 0 || i < kPeriod - 1) { fastK[i] = null; continue; }
        let lo = +Infinity;
        let hi = -Infinity;
        let bad = false;
        for (let j = i - kPeriod + 1; j <= i; j++) {
            const c = candles[j];
            const h = c && c.high;
            const l = c && c.low;
            if (typeof h !== 'number' || !Number.isFinite(h) ||
                typeof l !== 'number' || !Number.isFinite(l)) { bad = true; break; }
            if (l < lo) lo = l;
            if (h > hi) hi = h;
        }
        const close = candles[i] && candles[i].close;
        if (bad || typeof close !== 'number' || !Number.isFinite(close)) {
            fastK[i] = null; continue;
        }
        const range = hi - lo;
        if (range === 0) {
            // StochasticK.cs returns 0 when high == low over the window.
            fastK[i] = 0;
        } else {
            fastK[i] = 100 * (close - lo) / range;
        }
    }

    // 2) smoothed %K = SMA(fastK, smooth)
    const kArr = smooth > 1 ? simpleMA(fastK, smooth) : fastK.slice();
    // 3) %D = SMA(smoothed %K, dPeriod)
    const dArr = simpleMA(kArr, dPeriod);

    const k = new Array(n);
    const d = new Array(n);
    for (let i = 0; i < n; i++) {
        const t = candles[i].time;
        k[i] = { time: t, value: kArr[i] };
        d[i] = { time: t, value: dArr[i] };
    }
    return { k, d };
}
