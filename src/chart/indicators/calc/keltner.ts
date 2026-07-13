// Keltner Channels.
// Port of StockSharp Algo.Indicators KeltnerChannels.cs.
//
// middle = EMA(close, length)
// upper  = middle + multiplier * ATR(length)
// lower  = middle - multiplier * ATR(length)
//
// Defaults (from .cs): length=20, multiplier=2.
//
// Output: { middle, upper, lower } — each IndicatorPoint[] aligned 1:1
// with input candles. Slots before both EMA and ATR are formed stay null.
//
// .cs deviation notes: none. Uses partialSeedEMA (which matches the C#
// `ExponentialMovingAverage` warm-up emission `Buffer.Sum/Length` from bar
// 0) plus csATR (which matches the C# `AverageTrueRange` over a TR series
// where TR[0]=high-low, then growing-count cumulative average up to
// length, then Wilder steady-state recursion). Outer indicator IsFormed
// at bar length-1, so we emit middle/upper/lower from bar length-1 onward.

import { partialSeedEMA, csATR } from './helpers.js';

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
 * @typedef {{middle: IndicatorPoint[], upper: IndicatorPoint[], lower: IndicatorPoint[]}} KeltnerSeries
 */

/**
 * @param {CandlePoint[]} candles
 * @param {{length?: number, multiplier?: number}} [params]
 * @returns {KeltnerSeries}
 */
export function calcKeltnerChannels(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 20;
    const multiplier = params && Number.isFinite(params.multiplier) ? +params.multiplier : 2;

    if (!Array.isArray(candles) || candles.length === 0) {
        return { middle: [], upper: [], lower: [] };
    }

    const n = candles.length;
    const middle = new Array(n);
    const upper = new Array(n);
    const lower = new Array(n);
    for (let i = 0; i < n; i++) {
        const t = candles[i].time;
        middle[i] = { time: t, value: null };
        upper[i] = { time: t, value: null };
        lower[i] = { time: t, value: null };
    }

    if (length <= 0) return { middle, upper, lower };

    const closes = new Array(n);
    for (let i = 0; i < n; i++) closes[i] = candles[i] && candles[i].close;
    const ema = partialSeedEMA(closes, length);
    const atrPoints = csATR(candles, length);

    // Outer KeltnerChannels.IsFormed = Middle.IsFormed && ATR.IsFormed. Both
    // form at bar length-1 (when each respective buffer has `length`
    // entries). Emit only from that bar onward.
    const formedFrom = length - 1;
    for (let i = formedFrom; i < n; i++) {
        const m = ema[i];
        const a = atrPoints[i] && atrPoints[i].value;
        if (typeof m !== 'number' || !Number.isFinite(m) ||
            typeof a !== 'number' || !Number.isFinite(a)) continue;
        const offset = multiplier * a;
        middle[i] = { time: candles[i].time, value: m };
        upper[i] = { time: candles[i].time, value: m + offset };
        lower[i] = { time: candles[i].time, value: m - offset };
    }

    return { middle, upper, lower };
}
