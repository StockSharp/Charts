// Typical Price — JS port of D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\TypicalPrice.cs.
// Deviations from .cs: none. Per bar: (high + low + close) / 3.
//
// @typedef {{time:number|string,open:number,high:number,low:number,close:number,volume:number}} Candle
// @typedef {{time:number|string,value:number|null}} Point

/**
 * @param {Candle[]} candles
 * @param {object} [_params]
 * @returns {Point[]}
 */
export function calcTypicalPrice(candles, _params) {
    if (!Array.isArray(candles) || candles.length === 0) return [];
    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const t = c && c.time;
        const h = c && c.high;
        const l = c && c.low;
        const cl = c && c.close;
        const ok = typeof h === 'number' && Number.isFinite(h)
            && typeof l === 'number' && Number.isFinite(l)
            && typeof cl === 'number' && Number.isFinite(cl);
        out[i] = { time: t, value: ok ? (h + l + cl) / 3 : null };
    }
    return out;
}
