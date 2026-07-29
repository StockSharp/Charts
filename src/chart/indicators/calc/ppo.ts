// Percentage Price Oscillator (PPO) — JS port of D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\PercentagePriceOscillator.cs.
// Deviations from .cs: signal/histogram are extensions (StockSharp .cs emits
// only the main line; we additionally compute Signal = EMA(ppo, signalLength)
// and Histogram = ppo - signal for parity with MACD's three-series output —
// same convention this codebase uses for MACD.
//
//   shortEma = EMA(close, shortLength)
//   longEma  = EMA(close, longLength)
//   ppo      = (shortEma - longEma) / longEma * 100
//   signal   = EMA(ppo, signalLength)
//   histogram= ppo - signal
//
// Defaults: shortLength=12, longLength=26, signalLength=9.

import type { CandlePoint, IndicatorParams, IndicatorPoint } from './types.js';

export interface PPOSeries {
    ppo: IndicatorPoint[];
    signal: IndicatorPoint[];
    histogram: IndicatorPoint[];
}

/**
 * EMA-of-(number|null)[] returning same-length (number|null)[]. Seed with SMA
 * of first `length` valid values (matches macd.js / ema.js convention).
 */
function emaArray(values: (number | null)[], length: number): (number | null)[] {
    const n = values.length;
    const out = new Array(n);
    if (n === 0 || length <= 0) {
        for (let i = 0; i < n; i++) out[i] = null;
        return out;
    }
    let seedSum = 0, seedCount = 0, seedDone = false, prev = 0;
    const k = 2 / (length + 1);
    for (let i = 0; i < n; i++) {
        const v = values[i];
        const ok = typeof v === 'number' && Number.isFinite(v);
        if (!seedDone) {
            if (!ok) { out[i] = null; continue; }
            seedSum += v;
            seedCount++;
            if (seedCount === length) {
                prev = seedSum / length;
                out[i] = prev;
                seedDone = true;
            } else {
                out[i] = null;
            }
            continue;
        }
        if (!ok) { out[i] = null; continue; }
        prev = v * k + prev * (1 - k);
        out[i] = prev;
    }
    return out;
}

export function calcPPO(candles: CandlePoint[], params?: IndicatorParams): PPOSeries {
    const shortLength  = params && Number.isFinite(params.shortLength)  ? (params.shortLength  | 0) : 12;
    const longLength   = params && Number.isFinite(params.longLength)   ? (params.longLength   | 0) : 26;
    const signalLength = params && Number.isFinite(params.signalLength) ? (params.signalLength | 0) : 9;

    if (!Array.isArray(candles) || candles.length === 0) {
        return { ppo: [], signal: [], histogram: [] };
    }

    const n = candles.length;
    const closes = new Array(n);
    for (let i = 0; i < n; i++) closes[i] = candles[i] && candles[i].close;

    const sh = emaArray(closes, shortLength);
    const lg = emaArray(closes, longLength);

    const ppoRaw = new Array(n);
    for (let i = 0; i < n; i++) {
        const a = sh[i], b = lg[i];
        if (a === null || b === null) ppoRaw[i] = null;
        else ppoRaw[i] = b === 0 ? 0 : ((a - b) / b) * 100;
    }

    const signalRaw = emaArray(ppoRaw, signalLength);

    const ppo = new Array(n);
    const signal = new Array(n);
    const histogram = new Array(n);
    for (let i = 0; i < n; i++) {
        const t = candles[i].time;
        ppo[i] = { time: t, value: ppoRaw[i] };
        signal[i] = { time: t, value: signalRaw[i] };
        histogram[i] = {
            time: t,
            value: (ppoRaw[i] === null || signalRaw[i] === null) ? null : ppoRaw[i] - signalRaw[i]!,
        };
    }

    return { ppo, signal, histogram };
}
