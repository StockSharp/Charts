// McGinley Dynamic — adaptive moving average (Algo.Indicators/McGinleyDynamic.cs).
//
// Seed: SMA over the first `length` closes (Buffer.PushBack until Buffer.Count==Length,
// then Buffer.Average()). After seed:
//   md[i] = md[i-1] + (price - md[i-1]) / (0.6 * length * (price / md[i-1])^4)
// First (length-1) outputs are null; output[length-1] is the SMA seed.
//
// Deviation vs .cs: none in math. The .cs distinguishes IsFinal vs non-final
// (intra-candle updates) — for our batch recompute path we treat every input
// as final, which matches what the C# does on closed-candle replays.

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
export function calcMcGinleyDynamic(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 14;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);

    if (length <= 0) {
        for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };
        return out;
    }

    // Seed via SMA over the first `length` finite closes — same warm-up shape
    // as helpers.simpleMA, but we only need the value at index `length-1`.
    const closes = new Array(n);
    for (let i = 0; i < n; i++) closes[i] = candles[i] && candles[i].close;
    const seedSma = simpleMA(closes, length);

    let prev: number | null = null;
    for (let i = 0; i < n; i++) {
        if (i < length - 1) {
            out[i] = { time: candles[i].time, value: null };
            continue;
        }
        if (i === length - 1) {
            const s = seedSma[i];
            if (s === null) {
                out[i] = { time: candles[i].time, value: null };
                continue;
            }
            prev = s;
            out[i] = { time: candles[i].time, value: prev };
            continue;
        }
        const price = closes[i];
        if (prev === null || typeof price !== 'number' || !Number.isFinite(price) || prev === 0) {
            out[i] = { time: candles[i].time, value: null };
            continue;
        }
        const ratio = price / prev;
        const denom = 0.6 * length * Math.pow(ratio, 4);
        if (!Number.isFinite(denom) || denom === 0) {
            out[i] = { time: candles[i].time, value: null };
            continue;
        }
        const md = prev + (price - prev) / denom;
        out[i] = { time: candles[i].time, value: md };
        prev = md;
    }
    return out;
}
