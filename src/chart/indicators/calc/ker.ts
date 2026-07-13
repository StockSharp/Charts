// Kaufman Efficiency Ratio (KER).
// Port of StockSharp Algo.Indicators KaufmanEfficiencyRatio.cs.
//
// Buffer capacity = Length. Once Buffer.Count >= Length (IsFormed at bar
// index Length-1):
//   change     = |close[i] - close[i - (Length-1)]|       (oldest vs newest in buffer)
//   volatility = Σ_{k=i-Length+2..i} |close[k] - close[k-1]|   (Length-1 consecutive diffs)
//   KER        = volatility != 0 ? change / volatility : 0
//
// Output is in [0, 1] by the triangle inequality. 0 = pure noise, 1 = perfect trend.
//
// Default Length = 10.
//
// Warm-up: outputs 0..Length-2 are null. First non-null at index Length-1.
//
// .cs deviation notes:
// (a) The user-facing description sometimes says "|close - close[N back]|"
//     (i.e. N bars back). The .cs goes (N-1) bars back, because Buffer[0]
//     is the oldest of the last N closes — separated from the current by
//     (N-1) bars, not N. We port the .cs exactly.
// (b) volatility == 0 (perfectly flat window): the .cs returns 0 (NOT
//     null/NaN). We mirror.

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
export function calcKaufmanEfficiencyRatio(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 10;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    if (length <= 0) return out;

    for (let i = length - 1; i < n; i++) {
        const newest = candles[i] && candles[i].close;
        const oldest = candles[i - (length - 1)] && candles[i - (length - 1)].close;
        if (typeof newest !== 'number' || !Number.isFinite(newest) ||
            typeof oldest !== 'number' || !Number.isFinite(oldest)) {
            continue;
        }

        let volatility = 0;
        let bad = false;
        for (let k = i - length + 2; k <= i; k++) {
            const a = candles[k] && candles[k].close;
            const b = candles[k - 1] && candles[k - 1].close;
            if (typeof a !== 'number' || !Number.isFinite(a) ||
                typeof b !== 'number' || !Number.isFinite(b)) { bad = true; break; }
            volatility += Math.abs(a - b);
        }
        if (bad) continue;

        const change = Math.abs(newest - oldest);
        out[i] = { time: candles[i].time, value: volatility !== 0 ? change / volatility : 0 };
    }

    return out;
}
