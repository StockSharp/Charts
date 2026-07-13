// Gopalakrishnan Range Index (GAPO / GRI).
// Port of StockSharp Algo.Indicators GopalakrishnanRangeIndex.cs.
//
// Once `length` finite candles have been pushed:
//   highestHigh = max(high) over the last `length` bars (inclusive of current)
//   lowestLow   = min(low)  over the last `length` bars (inclusive of current)
//   currentRange = high - low of the current bar
//   if currentRange > 0:
//       gapo = log((highestHigh - lowestLow) / currentRange) / log(length)
//   else:
//       gapo = 0
//
// .cs deviation notes:
// (a) Warm-up: IsFormed requires _high.Count >= Length → first non-null
//     output lands at index (length - 1).
// (b) `length == 1` makes log(length) = 0, producing ±Infinity. The .cs
//     would produce the same — there's no guard there. We emit null in
//     that case (mirrors `IsFormed`-but-degenerate). Standard usage is
//     length=14 so this is an edge.
// (c) `IsFinal=false` (intra-bar) branch from the .cs is ignored.

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
export function calcGRI(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 14;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };
    if (length <= 1) return out; // log(length) = 0 → degenerate; never form
    if (n < length) return out;

    const logLen = Math.log(length);

    // O(n*length) windowed max/min. Length defaults to 14, n is candle count
    // for a chart — well under 10k — so this stays cheap.
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
        const currentRange = cur.high - cur.low;
        let gapo;
        if (currentRange > 0) {
            const ratio = (mxH - mnL) / currentRange;
            // ratio == 0 → log = -Infinity. Mirrors .cs (no guard).
            gapo = Math.log(ratio) / logLen;
        } else {
            gapo = 0;
        }
        out[i] = { time: cur.time, value: gapo };
    }

    return out;
}
