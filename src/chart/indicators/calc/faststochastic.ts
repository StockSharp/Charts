// Fast Stochastic Oscillator.
// StockSharp doesn't ship a FastStochastic.cs file — the closest analogue
// is StochasticOscillator.cs (StockSharp.Algo.Indicators), which is
// composed of:
//   * K = StochasticK (raw %K, NO smoothing)
//   * D = SimpleMovingAverage over K, Length = 3
// That IS the "Fast Stochastic" of Lane's original 1950s definition. The
// distinction from our existing stochastic.js is that the latter accepts a
// `smooth` parameter ("Slow Stochastic" / "Full Stochastic" — first an
// SMA-smoothing of fast %K, then %D = SMA of smoothed %K).
//
// Formulas (from StochasticK.cs / StochasticOscillator.cs):
//   fastK[i] = 100 * (close[i] - lowestLow(kPeriod)) / (highestHigh(kPeriod) - lowestLow(kPeriod))
//   %K       = fastK                       (no slowing)
//   %D       = SMA(%K, dPeriod)            (default dPeriod = 3)
//
// When highestHigh == lowestLow over the window, StochasticK.cs returns
// 0 (not 100 / 50 / null) — see the .cs `if (diff == 0) return 0`. That
// differs from our existing stochastic.js range-zero fallback (100). The
// .cs has the StochasticK choose its own behaviour; we follow the .cs
// here exactly.
//
// Default kPeriod = 14 (StochasticK constructor sets Length = 14),
// default dPeriod = 3 (StochasticOscillator constructor sets D.Length = 3).
//
// Output shape: `{ k, d }`, each an IndicatorPoint[] aligned to candles.

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
 * @typedef {{k: IndicatorPoint[], d: IndicatorPoint[]}} FastStochasticSeries
 */

/**
 * @param {CandlePoint[]} candles
 * @param {{kPeriod?: number, dPeriod?: number}} [params]
 * @returns {FastStochasticSeries}
 */
export function calcFastStochastic(candles, params) {
    const kPeriod = params && Number.isFinite(params.kPeriod) ? (params.kPeriod | 0) : 14;
    const dPeriod = params && Number.isFinite(params.dPeriod) ? (params.dPeriod | 0) : 3;

    if (!Array.isArray(candles) || candles.length === 0) return { k: [], d: [] };

    const n = candles.length;
    const fastK = new Array(n);
    for (let i = 0; i < n; i++) fastK[i] = null;
    if (kPeriod <= 0 || dPeriod <= 0) {
        const k = new Array(n);
        const d = new Array(n);
        for (let i = 0; i < n; i++) {
            k[i] = { time: candles[i].time, value: null };
            d[i] = { time: candles[i].time, value: null };
        }
        return { k, d };
    }

    for (let i = kPeriod - 1; i < n; i++) {
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
        if (bad || typeof close !== 'number' || !Number.isFinite(close)) continue;
        const range = hi - lo;
        // StochasticK.cs: `if (diff == 0) return 0;`
        fastK[i] = range === 0 ? 0 : 100 * (close - lo) / range;
    }

    const dArr = simpleMA(fastK, dPeriod);

    const k = new Array(n);
    const d = new Array(n);
    for (let i = 0; i < n; i++) {
        const t = candles[i].time;
        k[i] = { time: t, value: fastK[i] };
        d[i] = { time: t, value: dArr[i] };
    }
    return { k, d };
}
