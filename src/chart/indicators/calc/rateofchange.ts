// Rate of Change — JS port of D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\RateOfChange.cs.
// Inherits from Momentum: momentum[i] = close[i] - close[i-Length].
// ROC[i]      = momentum[i] / close[i-Length] * 100,
// emitted only when Length+1 closes are available AND close[i-Length] != 0.
// Deviations from .cs: none — formula is straight 1:1.
//
// @typedef {{time:number|string,open:number,high:number,low:number,close:number,volume:number}} Candle
// @typedef {{time:number|string,value:number|null}} Point
//
// @param {Candle[]} candles
// @param {{length?: number}} [params]
// @returns {Point[]}
export function calcRateOfChange(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 12;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i] && candles[i].time, value: null };

    if (length <= 0) return out;

    for (let i = length; i < n; i++) {
        const curr = candles[i] && candles[i].close;
        const past = candles[i - length] && candles[i - length].close;
        if (typeof curr !== 'number' || !Number.isFinite(curr) ||
            typeof past !== 'number' || !Number.isFinite(past) || past === 0) {
            continue;
        }
        out[i] = { time: candles[i].time, value: (curr - past) / past * 100 };
    }
    return out;
}
