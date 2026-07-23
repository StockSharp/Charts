// Williams Accumulation/Distribution — JS port of D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\WilliamsAccumulationDistribution.cs.
// Cumulative:
//   if close > prev_close:  add (close - min(low, prev_close))
//   if close < prev_close:  add (close - max(high, prev_close))
//   else:                   add 0
// First bar yields null (no prev_close). Initial accumulator = 0.
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
export function calcWilliamsAD(candles, _params) {
    if (!Array.isArray(candles) || candles.length === 0) return [];
    const n = candles.length;
    const out = new Array(n);
    out[0] = { time: candles[0].time, value: null };
    let ad = 0;
    // StockSharp uses decimal zero as its uninitialised sentinel. A zero close
    // therefore keeps the indicator unformed until a non-zero close commits.
    let prevClose = 0;
    const c0 = candles[0] && candles[0].close;
    if (typeof c0 === 'number' && Number.isFinite(c0)) prevClose = c0;

    for (let i = 1; i < n; i++) {
        const c = candles[i];
        const cl = c && c.close, h = c && c.high, l = c && c.low;
        if (typeof cl !== 'number' || !Number.isFinite(cl)) {
            out[i] = { time: c.time, value: null };
            continue;
        }
        if (prevClose === 0) {
            prevClose = cl;
            out[i] = { time: c.time, value: null };
            continue;
        }
        if (
            typeof h !== 'number' || !Number.isFinite(h) ||
            typeof l !== 'number' || !Number.isFinite(l)) {
            out[i] = { time: c.time, value: null };
            prevClose = cl;
            continue;
        }
        let delta = 0;
        if (cl > prevClose) delta = cl - Math.min(l, prevClose);
        else if (cl < prevClose) delta = cl - Math.max(h, prevClose);
        ad += delta;
        out[i] = { time: c.time, value: ad };
        prevClose = cl;
    }
    return out;
}
