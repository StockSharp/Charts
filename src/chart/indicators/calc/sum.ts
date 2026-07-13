// Sum of N — JS port of D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\Sum.cs.
//
// Rolling sum of the last `Length` close prices. Default Length=15.
//   sum[i] = close[i-Length+1] + ... + close[i]
// Warm-up: first (length-1) values null.
// Deviations from .cs: none — straight rolling sum.
//
// @typedef {{time:number|string,open:number,high:number,low:number,close:number,volume:number}} Candle
// @typedef {{time:number|string,value:number|null}} Point

/**
 * @param {Candle[]} candles
 * @param {{length?: number}} [params]
 * @returns {Point[]}
 */
export function calcSum(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 15;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i] && candles[i].time, value: null };

    if (length <= 0) return out;

    let sum = 0;
    let invalid = 0;
    for (let i = 0; i < n; i++) {
        const v = candles[i] && candles[i].close;
        const ok = typeof v === 'number' && Number.isFinite(v);
        if (ok) sum += v; else invalid++;
        if (i >= length) {
            const drop = candles[i - length] && candles[i - length].close;
            const dropOk = typeof drop === 'number' && Number.isFinite(drop);
            if (dropOk) sum -= drop; else invalid--;
        }
        if (i >= length - 1) {
            out[i] = { time: candles[i].time, value: invalid === 0 ? sum : null };
        }
    }
    return out;
}
