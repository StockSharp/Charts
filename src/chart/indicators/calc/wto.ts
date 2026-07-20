// Wave Trend Oscillator —
// JS port of D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\WaveTrendOscillator.cs.
// Pipeline (over typical price tp = (H+L+C)/3):
//   esa = EMA(tp, EsaPeriod)                                      (def 10)
//   d   = EMA(|tp - esa|, DPeriod)                                (def 14)
//   ci  = (tp - esa) / (0.015 * d)
//   wt1 = ci
//   wt2 = SMA(ci, AveragePeriod)                                  (def 3)
// First wt1 emit: once `d` is formed; that's at the (EsaPeriod-1)+(DPeriod-1)
// = EsaPeriod + DPeriod - 1 boundary. EMA seeding here follows StockSharp:
// seed with SMA of first N finite samples (same as ema.js/macd.js helper).
//
// wt2 is a SimpleMovingAverage (partial-seed: Buffer.Sum / AveragePeriod) and
// its WaveTrendLine wrapper is formed the moment it is first fed (once `d` is
// formed), so wt2 is non-null from the SAME bar as wt1 with a growing
// partial-seed average — NOT a windowed SMA that only starts AveragePeriod-1
// bars later. Use partialSeedSMA for it.
//
// Deviations from .cs: none.
//
// @typedef {{time:number|string,open:number,high:number,low:number,close:number,volume:number}} Candle
// @typedef {{time:number|string,value:number|null}} Point

import { partialSeedSMA } from './helpers.js';

function emaArr(values, length) {
    const n = values.length;
    const out = new Array(n);
    if (n === 0 || length <= 0) { for (let i = 0; i < n; i++) out[i] = null; return out; }
    let seedSum = 0, seedCnt = 0, seedDone = false, prev = 0;
    const k = 2 / (length + 1);
    for (let i = 0; i < n; i++) {
        const v = values[i];
        const ok = typeof v === 'number' && Number.isFinite(v);
        if (!seedDone) {
            if (!ok) { out[i] = null; continue; }
            seedSum += v; seedCnt++;
            if (seedCnt === length) {
                prev = seedSum / length;
                out[i] = prev;
                seedDone = true;
            } else out[i] = null;
            continue;
        }
        if (!ok) { out[i] = null; continue; }
        prev = v * k + prev * (1 - k);
        out[i] = prev;
    }
    return out;
}

/**
 * @param {Candle[]} candles
 * @param {{esaPeriod?: number, dPeriod?: number, averagePeriod?: number}} [params]
 * @returns {{wt1: Point[], wt2: Point[]}}
 */
export function calcWaveTrend(candles, params) {
    const esaPeriod = params && Number.isFinite(params.esaPeriod) ? (params.esaPeriod | 0) : 10;
    const dPeriod = params && Number.isFinite(params.dPeriod) ? (params.dPeriod | 0) : 14;
    const averagePeriod = params && Number.isFinite(params.averagePeriod) ? (params.averagePeriod | 0) : 3;

    if (!Array.isArray(candles) || candles.length === 0) {
        return { wt1: [], wt2: [] };
    }
    const n = candles.length;
    const wt1 = new Array(n);
    const wt2 = new Array(n);
    for (let i = 0; i < n; i++) {
        wt1[i] = { time: candles[i].time, value: null };
        wt2[i] = { time: candles[i].time, value: null };
    }

    const tp = new Array(n);
    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const h = c && c.high, l = c && c.low, cl = c && c.close;
        if (typeof h !== 'number' || !Number.isFinite(h) ||
            typeof l !== 'number' || !Number.isFinite(l) ||
            typeof cl !== 'number' || !Number.isFinite(cl)) tp[i] = null;
        else tp[i] = (h + l + cl) / 3;
    }

    const esa = emaArr(tp, esaPeriod);
    const absDiff = new Array(n);
    for (let i = 0; i < n; i++) {
        if (tp[i] === null || esa[i] === null) absDiff[i] = null;
        else absDiff[i] = Math.abs(tp[i] - esa[i]);
    }
    const d = emaArr(absDiff, dPeriod);

    const ci = new Array(n);
    for (let i = 0; i < n; i++) {
        if (tp[i] === null || esa[i] === null || d[i] === null || d[i] === 0) ci[i] = null;
        else ci[i] = (tp[i] - esa[i]) / (0.015 * d[i]);
    }
    const ciSma = partialSeedSMA(ci, averagePeriod);

    for (let i = 0; i < n; i++) {
        if (ci[i] !== null) wt1[i] = { time: candles[i].time, value: ci[i] };
        if (ciSma[i] !== null) wt2[i] = { time: candles[i].time, value: ciSma[i] };
    }
    return { wt1, wt2 };
}
