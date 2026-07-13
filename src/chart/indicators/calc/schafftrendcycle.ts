// Schaff Trend Cycle — JS port of
// D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\SchaffTrendCycle.cs.
//
// Pipeline:
//   1. macdHist[i] = MACD(short=23, long=50, signal=3)[i].macd - signal
//   2. Normalize macdHist over a rolling window of `Length` (default 10):
//        norm[i] = (macdHist[i] - min) / (max - min)
//      where min/max come from macdHist[i-Length+1..i]. If max == min, reuse
//      previous stoch-K value (.cs `_prevStochK`).
//   3. Run a StockSharp-style StochasticK with sub-Length=5 on the `norm`
//      series (treating each norm value as a flat-priced candle, so high =
//      low = close = norm). For StochasticK with high == low across the
//      window, .cs returns 0; we keep that.
//        stochK[i] = 100 * (norm[i] - lowestNorm(5)) / (highestNorm(5) - lowestNorm(5))
//   4. Smooth stochK with an EMA of `Length` to get the final STC value
//      (seeded with SMA of first `Length` finite stochK values; matches the
//      EMA in macd.js).
//
// Default Length = 10, ShortLength = 23, LongLength = 50 (MACD short/long),
// CycleLength = 5 (the StochasticK sub-period). Note the user prompt mentions
// CycleLength = 10 but the .cs uses StochasticK { Length = 5 }; the .cs wins.
// SignalLength for the MACD signal EMA is 3 (also per .cs).
// Deviations from .cs: none — direct 1:1 port; only optimisation is a
// linear-scan min/max rather than a CircularBufferStats helper.
//
// @typedef {{time:number|string,open:number,high:number,low:number,close:number,volume:number}} Candle
// @typedef {{time:number|string,value:number|null}} Point

import { calcMACD as calcMACD_STC } from './macd.js';

/**
 * @param {Candle[]} candles
 * @param {{length?: number, shortLength?: number, longLength?: number, cycleLength?: number, signalLength?: number}} [params]
 * @returns {Point[]}
 */
export function calcSchaffTrendCycle(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 10;
    const shortLength = params && Number.isFinite(params.shortLength) ? (params.shortLength | 0) : 23;
    const longLength = params && Number.isFinite(params.longLength) ? (params.longLength | 0) : 50;
    const cycleLength = params && Number.isFinite(params.cycleLength) ? (params.cycleLength | 0) : 5;
    const signalLength = params && Number.isFinite(params.signalLength) ? (params.signalLength | 0) : 3;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i] && candles[i].time, value: null };

    if (length <= 0 || cycleLength <= 0) return out;

    // 1) macd histogram
    const m = calcMACD_STC(candles, {
        fastLength: shortLength,
        slowLength: longLength,
        signalLength,
    });
    const hist = new Array(n);
    for (let i = 0; i < n; i++) {
        const h = m.histogram[i];
        hist[i] = (h && typeof h.value === 'number' && Number.isFinite(h.value)) ? h.value : null;
    }

    // 2) normalise hist over rolling `length` window
    const norm = new Array(n);
    let prevStochK = 0;
    for (let i = 0; i < n; i++) {
        if (i < length - 1 || hist[i] === null) { norm[i] = null; continue; }
        let lo = +Infinity;
        let hi = -Infinity;
        let bad = false;
        for (let k = i - length + 1; k <= i; k++) {
            const v = hist[k];
            if (v === null) { bad = true; break; }
            if (v < lo) lo = v;
            if (v > hi) hi = v;
        }
        if (bad) { norm[i] = null; continue; }
        const den = hi - lo;
        norm[i] = den === 0 ? null : (hist[i] - lo) / den;
    }

    // 3) StochasticK with length = cycleLength over `norm` series (high=low=close=norm)
    const stochK = new Array(n);
    for (let i = 0; i < n; i++) {
        if (i < (length - 1) + (cycleLength - 1)) { stochK[i] = null; continue; }
        let lo = +Infinity;
        let hi = -Infinity;
        let bad = false;
        for (let k = i - cycleLength + 1; k <= i; k++) {
            const v = norm[k];
            if (v === null) { bad = true; break; }
            if (v < lo) lo = v;
            if (v > hi) hi = v;
        }
        if (bad) { stochK[i] = null; continue; }
        const close = norm[i];
        const diff = hi - lo;
        if (diff === 0) {
            // .cs: when buffer max == min in step 2, reuse _prevStochK and
            // skip StochasticK.Process. Approximate by reusing previous K.
            stochK[i] = prevStochK;
        } else {
            stochK[i] = 100 * (close - lo) / diff;
        }
        prevStochK = stochK[i];
    }

    // 4) EMA(stochK, length) — seeded with SMA of first `length` finite values.
    const k = 2 / (length + 1);
    let seedSum = 0;
    let seedCount = 0;
    let seedDone = false;
    let prev = 0;
    for (let i = 0; i < n; i++) {
        const v = stochK[i];
        if (v === null || !Number.isFinite(v)) continue;
        if (!seedDone) {
            seedSum += v;
            seedCount++;
            if (seedCount === length) {
                prev = seedSum / length;
                out[i] = { time: candles[i].time, value: prev };
                seedDone = true;
            }
            continue;
        }
        prev = v * k + prev * (1 - k);
        out[i] = { time: candles[i].time, value: prev };
    }

    return out;
}
