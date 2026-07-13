// Time Weighted Average Price (TWAP) — JS port of D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\TimeWeightedAveragePrice.cs.
// Deviations from .cs: none.
//   per-bar typical price = (high + low + close) / 3
//   cumulative sum of typical prices / count → running average from session
//   start (no length window — .cs does not have one).
//   IsFormed becomes true on first bar.
//
// @typedef {{time:number|string,open:number,high:number,low:number,close:number,volume:number}} Candle
// @typedef {{time:number|string,value:number|null}} Point

/**
 * @param {Candle[]} candles
 * @param {object} [_params]
 * @returns {Point[]}
 */
export function calcTWAP(candles, _params) {
    if (!Array.isArray(candles) || candles.length === 0) return [];
    const n = candles.length;
    const out = new Array(n);

    let cum = 0;
    let count = 0;

    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const t = c && c.time;
        const h = c && c.high;
        const l = c && c.low;
        const cl = c && c.close;
        const ok = typeof h === 'number' && Number.isFinite(h)
            && typeof l === 'number' && Number.isFinite(l)
            && typeof cl === 'number' && Number.isFinite(cl);
        if (!ok) {
            // Carry running mean unchanged; emit null for this bar.
            out[i] = { time: t, value: null };
            continue;
        }
        const tp = (h + l + cl) / 3;
        cum += tp;
        count++;
        out[i] = { time: t, value: cum / count };
    }

    return out;
}
