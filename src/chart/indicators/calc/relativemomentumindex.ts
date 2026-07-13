// Relative Momentum Index — JS port of D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\RelativeMomentumIndex.cs.
// Variant of RSI: instead of comparing consecutive closes, compares each close
// to the close `MomentumPeriod` bars earlier, then takes SMA over `Length`
// of up/down momentums:
//   upMom[i]   = max(close[i] - close[i-M], 0)
//   downMom[i] = max(close[i-M] - close[i], 0)
//   rmi[i]     = 100 * SMA(upMom, Length) / (SMA(upMom, Length) + SMA(downMom, Length))
// Warm-up: first MomentumPeriod bars produce no momentum value (need M+1
// closes), then SMA needs `Length` momentum values, so first non-null lands
// at index M + Length - 1.
// Deviations from .cs: none — formula is straight 1:1.
//
// @typedef {{time:number|string,open:number,high:number,low:number,close:number,volume:number}} Candle
// @typedef {{time:number|string,value:number|null}} Point

import { simpleMA as simpleMA_RMI } from './helpers.js';

/**
 * @param {Candle[]} candles
 * @param {{length?: number, momentum?: number, momentumPeriod?: number}} [params]
 * @returns {Point[]}
 */
export function calcRelativeMomentumIndex(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 14;
    const momentumPeriod = params && Number.isFinite(params.momentum)
        ? (params.momentum | 0)
        : (params && Number.isFinite(params.momentumPeriod) ? (params.momentumPeriod | 0) : 5);

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i] && candles[i].time, value: null };

    if (length <= 0 || momentumPeriod <= 0) return out;

    const up = new Array(n);
    const down = new Array(n);
    for (let i = 0; i < n; i++) {
        if (i < momentumPeriod) { up[i] = null; down[i] = null; continue; }
        const curr = candles[i] && candles[i].close;
        const past = candles[i - momentumPeriod] && candles[i - momentumPeriod].close;
        if (typeof curr !== 'number' || !Number.isFinite(curr) ||
            typeof past !== 'number' || !Number.isFinite(past)) {
            up[i] = null; down[i] = null; continue;
        }
        const diff = curr - past;
        up[i] = diff > 0 ? diff : 0;
        down[i] = diff < 0 ? -diff : 0;
    }

    const upSma = simpleMA_RMI(up, length);
    const downSma = simpleMA_RMI(down, length);

    for (let i = 0; i < n; i++) {
        const u = upSma[i];
        const d = downSma[i];
        if (u === null || d === null) continue;
        const den = u + d;
        if (den === 0) continue;
        out[i] = { time: candles[i].time, value: 100 * u / den };
    }
    return out;
}
