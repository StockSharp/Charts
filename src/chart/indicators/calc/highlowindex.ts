// High Low Index (HLI).
// Port of StockSharp Algo.Indicators HighLowIndex.cs.
//
// Once `length` finite candles have been pushed:
//   highestHigh = max(high) over last `length` bars (inclusive of current)
//   lowestLow   = min(low)  over last `length` bars (inclusive of current)
//   range       = highestHigh - lowestLow
//   if range == 0: HLI = 50
//   else:          HLI = (current.high - lowestLow) / range * 100
//
// .cs deviation notes:
// (a) Warm-up: CalcIsFormed gates on `_highBuffer.Count == Length`, so
//     the first non-null output is at index (length - 1).
// (b) `Measure = Percent` is metadata only — the formula already returns
//     a percent in [0, 100].
// (c) `IsFinal=false` branch (the .cs's intra-bar `_highBuffer.Max.Value
//     .Max(candle.HighPrice)` path) is ignored for closed-bar batches.

/**
 * @typedef {object} CandlePoint
 * @property {string|number} time
 * @property {number} open
 * @property {number} high
 * @property {number} low
 * @property {number} close
 * @property {number} [volume]
 */

/**
 * @typedef {{time: string|number, value: number|null}} IndicatorPoint
 */

/**
 * @param {CandlePoint[]} candles
 * @param {{length?: number}} [params]
 * @returns {IndicatorPoint[]}
 */
export function calcHighLowIndex(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 14;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };
    if (length <= 0 || n < length) return out;

    for (let i = length - 1; i < n; i++) {
        let mxH = -Infinity;
        let mnL = Infinity;
        let bad = false;
        for (let k = i - length + 1; k <= i; k++) {
            const c = candles[k];
            const h = c && c.high;
            const l = c && c.low;
            if (typeof h !== 'number' || !Number.isFinite(h) ||
                typeof l !== 'number' || !Number.isFinite(l)) {
                bad = true;
                break;
            }
            if (h > mxH) mxH = h;
            if (l < mnL) mnL = l;
        }
        if (bad) continue;

        const cur = candles[i];
        const range = mxH - mnL;
        const value = range === 0 ? 50 : (cur.high - mnL) / range * 100;
        out[i] = { time: cur.time, value };
    }

    return out;
}
