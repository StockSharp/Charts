// Weighted Close Price —
// JS port of D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\WeightedClosePrice.cs.
// wcp[i] = (high + low + 2*close) / 4. Per-candle, no warm-up.
//
// Deviations from .cs: none.
//
// @typedef {{time:number|string,open:number,high:number,low:number,close:number,volume:number}} Candle
// @typedef {{time:number|string,value:number|null}} Point

/**
 * @param {Candle[]} candles
 * @param {{}} [_params]
 * @returns {Point[]}
 */
export function calcWeightedClosePrice(candles, _params) {
    if (!Array.isArray(candles) || candles.length === 0) return [];
    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const h = c && c.high, l = c && c.low, cl = c && c.close;
        if (typeof h !== 'number' || !Number.isFinite(h) ||
            typeof l !== 'number' || !Number.isFinite(l) ||
            typeof cl !== 'number' || !Number.isFinite(cl)) {
            out[i] = { time: c.time, value: null };
        } else {
            out[i] = { time: c.time, value: (h + l + 2 * cl) / 4 };
        }
    }
    return out;
}
