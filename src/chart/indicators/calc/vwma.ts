// Volume Weighted Moving Average —
// JS port of D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\VolumeWeightedMovingAverage.cs.
// vwma[i] = sum(close*volume, N) / sum(volume, N) over the trailing N bars.
// First usable bar at index N-1 (need a full window of N samples). .cs
// default Length = 32.
//
// If the rolling volume sum is 0 the .cs returns null — we mirror that.
//
// Deviations from .cs: none.
//
// @typedef {{time:number|string,open:number,high:number,low:number,close:number,volume:number}} Candle
// @typedef {{time:number|string,value:number|null}} Point

/**
 * @param {Candle[]} candles
 * @param {{length?: number}} [params]
 * @returns {Point[]}
 */
export function calcVWMA(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 32;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    if (length <= 0 || n < length) return out;

    for (let i = length - 1; i < n; i++) {
        let num = 0, den = 0, bad = false;
        for (let j = i - length + 1; j <= i; j++) {
            const c = candles[j];
            const cl = c && c.close, v = c && c.volume;
            if (typeof cl !== 'number' || !Number.isFinite(cl) ||
                typeof v !== 'number' || !Number.isFinite(v)) { bad = true; break; }
            num += cl * v;
            den += v;
        }
        if (bad) continue;
        out[i] = { time: candles[i].time, value: den !== 0 ? num / den : null };
    }
    return out;
}
