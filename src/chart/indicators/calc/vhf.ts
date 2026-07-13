// Vertical Horizontal Filter — JS port of D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\VerticalHorizontalFilter.cs.
// VHF[i] = (max(high*,N) - min(low*,N)) / sum(|close[j]-close[j-1]|, j over the N most recent deltas).
// .cs feeds Lowest with candle.LowPrice and Highest with candle.HighPrice; the
// numerator therefore tracks the price range of the last N bars (not the
// last N closes). The denominator uses |close - prev_close| diffs, summed
// over a rolling N-window. First non-null bar at index N (need N deltas
// plus the seed close at index 0). Default Length=15 from .cs ctor.
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
export function calcVHF(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 15;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    if (length <= 0 || n <= length) return out;

    // Per-bar |close - prev_close| deltas. deltas[0] = null.
    const deltas = new Array(n);
    deltas[0] = null;
    for (let i = 1; i < n; i++) {
        const prev = candles[i - 1] && candles[i - 1].close;
        const curr = candles[i] && candles[i].close;
        if (typeof prev !== 'number' || !Number.isFinite(prev) ||
            typeof curr !== 'number' || !Number.isFinite(curr)) {
            deltas[i] = null;
        } else {
            deltas[i] = Math.abs(curr - prev);
        }
    }

    for (let i = length; i < n; i++) {
        // Rolling max(high) and min(low) over the last `length` bars
        // (inclusive of current). The .cs Highest/Lowest are fed every bar
        // from bar 0, so when index === length-1 they are formed; combined
        // with prev_close existing from bar 1 onward, first emit happens at
        // index >= length.
        let hi = -Infinity, lo = Infinity, bad = false;
        for (let j = i - length + 1; j <= i; j++) {
            const c = candles[j];
            const h = c && c.high;
            const l = c && c.low;
            if (typeof h !== 'number' || !Number.isFinite(h) ||
                typeof l !== 'number' || !Number.isFinite(l)) { bad = true; break; }
            if (h > hi) hi = h;
            if (l < lo) lo = l;
        }
        if (bad) continue;

        let sumDelta = 0;
        for (let j = i - length + 1; j <= i; j++) {
            const d = deltas[j];
            if (d === null) { bad = true; break; }
            sumDelta += d;
        }
        if (bad) continue;
        if (sumDelta === 0) continue; // .cs returns null when denominator is 0
        out[i] = { time: candles[i].time, value: (hi - lo) / sumDelta };
    }
    return out;
}
