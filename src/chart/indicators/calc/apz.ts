// Adaptive Price Zone (APZ).
// Port of StockSharp Algo.Indicators AdaptivePriceZone.cs:
//
//   MA    = EMA(close, Period)
//   sigma = StandardDeviation(close, Period)            // population, ÷N
//   upper = MA + BandPercentage * sigma
//   lower = MA - BandPercentage * sigma
//
// Defaults: Period=5, BandPercentage=2. The .cs uses an
// ExponentialMovingAverage by default; StandardDeviation internally uses
// its own SMA, so we recompute it locally rather than depend on the EMA
// for the deviation centre.
//
// Output shape: { ma, upper, lower }, each IndicatorPoint[] aligned 1:1
// with input candles. All three lines emit null until index Period-1
// (both EMA and StandardDeviation finish their warm-up window).
//
// .cs deviation: none. StandardDeviation.cs uses sqrt(sum((x-sma)^2) / N)
// (population, not sample), so we do the same. Matches BollingerBands /
// bb.js convention already in this repo.

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
 * @typedef {{ma: IndicatorPoint[], upper: IndicatorPoint[], lower: IndicatorPoint[]}} APZSeries
 */

/**
 * @param {CandlePoint[]} candles
 * @param {{period?: number, bandPercentage?: number}} [params]
 * @returns {APZSeries}
 */
export function calcAdaptivePriceZone(candles, params) {
    const period = params && Number.isFinite(params.period) ? (params.period | 0) : 5;
    const bandPercentage = params && Number.isFinite(params.bandPercentage)
        ? +params.bandPercentage : 2;

    if (!Array.isArray(candles) || candles.length === 0) {
        return { ma: [], upper: [], lower: [] };
    }

    const n = candles.length;
    const ma = new Array(n);
    const upper = new Array(n);
    const lower = new Array(n);
    for (let i = 0; i < n; i++) {
        ma[i] = { time: candles[i].time, value: null };
        upper[i] = { time: candles[i].time, value: null };
        lower[i] = { time: candles[i].time, value: null };
    }

    if (period <= 0) return { ma, upper, lower };

    const closes = new Array(n);
    for (let i = 0; i < n; i++) {
        const c = candles[i] && candles[i].close;
        closes[i] = typeof c === 'number' && Number.isFinite(c) ? c : null;
    }

    // EMA seeded by SMA over the first `period` closes — matches ema.js.
    const k = 2 / (period + 1);
    const ema = new Array(n);
    let seedSum = 0;
    let seedOk = true;
    for (let i = 0; i < n && i < period; i++) {
        const v = closes[i];
        if (v === null) seedOk = false;
        else seedSum += v;
        ema[i] = null;
    }
    if (n >= period && seedOk) {
        let previous = seedSum / period;
        ema[period - 1] = previous;
        for (let i = period; i < n; i++) {
            const v = closes[i];
            if (v === null) { ema[i] = null; continue; }
            previous = v * k + previous * (1 - k);
            ema[i] = previous;
        }
    } else {
        for (let i = 0; i < n; i++) ema[i] = null;
    }

    // SMA of close over the same window — used as the centre for stddev.
    const sma = simpleMA(closes, period);

    for (let i = 0; i < n; i++) {
        const t = candles[i].time;
        const m = ema[i];
        const s = sma[i];
        if (m === null || s === null || i < period - 1) continue;

        // Population stddev over the trailing `period` closes.
        let sumSq = 0;
        let bad = false;
        for (let j = i - period + 1; j <= i; j++) {
            const v = closes[j];
            if (v === null) { bad = true; break; }
            const d = v - s;
            sumSq += d * d;
        }
        if (bad) continue;
        const sigma = Math.sqrt(sumSq / period);

        ma[i] = { time: t, value: m };
        upper[i] = { time: t, value: m + bandPercentage * sigma };
        lower[i] = { time: t, value: m - bandPercentage * sigma };
    }

    return { ma, upper, lower };
}
