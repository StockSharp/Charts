// Shift indicator — JS port of D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\Shift.cs.
//
// .cs only delays the FIRST emitted value by `Length` bars; once formed it
// returns the current close (not a shifted-back close). Implementation
// matches: first `length` outputs are null, subsequent outputs are
// close[i] verbatim. Default Length = 1.
// Deviations from .cs: none — .cs really just gates output by counting down
// `_left` and emits the current input once `_left <= 0`.
//
// @typedef {{time:number|string,open:number,high:number,low:number,close:number,volume:number}} Candle
// @typedef {{time:number|string,value:number|null}} Point

/**
 * @param {Candle[]} candles
 * @param {{length?: number}} [params]
 * @returns {Point[]}
 */
export function calcShift(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 1;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const t = c && c.time;
        if (i < length) {
            out[i] = { time: t, value: null };
            continue;
        }
        const v = c && c.close;
        out[i] = {
            time: t,
            value: typeof v === 'number' && Number.isFinite(v) ? v : null,
        };
    }
    return out;
}
