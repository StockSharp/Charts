// Mean Deviation (Average Absolute Deviation).
// Port of StockSharp Algo.Indicators MeanDeviation.cs.
//
// For each fully-formed window of `length` final closes:
//   sma  = (1/length) * Σ close[i-length+1 .. i]
//   md   = (1/length) * Σ |close[k] - sma|     // same window
// The .cs uses the running SMA from an inner SimpleMovingAverage, plus a
// circular `Buffer` of the last `length` closes; `IsFormed` flips on once
// the SMA is formed, i.e. when `length` final samples have arrived.
//
// .cs note: the non-final branch (`input.IsFinal == false`) replaces the
// oldest sample in the abs-sum with the in-progress value. We're a batch
// closed-bar calculator (the chart re-feeds the whole array on each tick),
// so we treat every input bar as final — matches what the .cs would emit
// once that bar closes.
// Default length: 5 (matches the .cs ctor).

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
export function calcMeanDeviation(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 5;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };
    if (length <= 0) return out;

    const closes = new Array(n);
    for (let i = 0; i < n; i++) closes[i] = candles[i] && candles[i].close;
    const sma = simpleMA(closes, length);

    for (let i = length - 1; i < n; i++) {
        const m = sma[i];
        if (m === null) continue;
        let sum = 0;
        let ok = true;
        for (let k = 0; k < length; k++) {
            const c = closes[i - length + 1 + k];
            if (typeof c !== 'number' || !Number.isFinite(c)) { ok = false; break; }
            const d = c - m;
            sum += d < 0 ? -d : d;
        }
        if (!ok) continue;
        out[i] = { time: candles[i].time, value: sum / length };
    }
    return out;
}
