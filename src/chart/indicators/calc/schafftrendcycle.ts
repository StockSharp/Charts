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

    // Faithful port of the .cs OnProcessDecimal state machine:
    //   _buffer          : last `length` CLOSES (min/max used to normalise macdHist)
    //   StochasticK(5)   : 100 * (raw - Lowest) / (Highest - Lowest) over its own window
    //   base EMA(length) : final smoothing of the StochasticK output
    const closeBuf = [];       // last `length` closes
    const stochBuf = [];       // StochasticK window of raw values (cap cycleLength)
    let stochKFormed = false;
    let prevStochK = 0;

    const kEma = 2 / (length + 1);
    let seedSum = 0;
    let seedCount = 0;
    let seedDone = false;
    let emaPrev = 0;

    for (let i = 0; i < n; i++) {
        // The .cs pushes the close every final bar, before anything else.
        const close = candles[i] && candles[i].close;
        if (typeof close === 'number' && Number.isFinite(close)) {
            closeBuf.push(close);
            if (closeBuf.length > length) closeBuf.shift();
        }

        const macdHist = hist[i];
        if (macdHist === null) continue; // Macd not formed -> STC null

        let minC = +Infinity;
        let maxC = -Infinity;
        for (const c of closeBuf) { if (c < minC) minC = c; if (c > maxC) maxC = c; }
        const den = maxC - minC;

        let stochK;
        if (den === 0) {
            // .cs: reuse _prevStochK and DO NOT advance StochasticK.
            stochK = prevStochK;
        } else {
            const raw = (macdHist - minC) / den;
            stochBuf.push(raw);
            if (stochBuf.length > cycleLength) stochBuf.shift();
            let minS = +Infinity;
            let maxS = -Infinity;
            for (const s of stochBuf) { if (s < minS) minS = s; if (s > maxS) maxS = s; }
            const diffS = maxS - minS;
            stochK = diffS === 0 ? 0 : 100 * (raw - minS) / diffS;
            if (stochBuf.length >= cycleLength) stochKFormed = true;
        }

        if (!stochKFormed) continue; // StochasticK not formed -> STC null
        prevStochK = stochK;

        // base EMA(length) of the StochasticK output, SMA-seeded.
        if (!seedDone) {
            seedSum += stochK;
            seedCount++;
            if (seedCount === length) {
                emaPrev = seedSum / length;
                seedDone = true;
                out[i] = { time: candles[i].time, value: emaPrev };
            }
            continue;
        }
        emaPrev = stochK * kEma + emaPrev * (1 - kEma);
        out[i] = { time: candles[i].time, value: emaPrev };
    }

    return out;
}
