// Highest — trailing maximum of the input price stream over `length` bars.
// Port of StockSharp Algo.Indicators Highest.cs.
//
// Although Highest.cs reads `input.ToCandle().HighPrice`, the indicator
// inherits the default [IndicatorIn(typeof(DecimalIndicatorValue))]
// attribute from BaseIndicator — so the canonical test path feeds raw
// close prices. When ToCandle() is invoked on a DecimalIndicatorValue,
// the helper synthesises a candle with OHLC all equal to the decimal
// (HighPrice == ClosePrice). The indicator therefore effectively runs
// on close prices in the canonical test path; we match that by reading
// candle.close.
//
// For each bar:
//   value = candle.close
//   return max(close[max(0, i-length+1) .. i])
//
// Warm-up: the .cs returns `Buffer.Max.Value` after every PushBack —
// so the very first bar already returns its own close. We mirror that
// pre-form behaviour to match the StockSharp expected output.

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
export function calcHighest(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 5;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };
    if (length <= 0) return out;

    // O(n*length) scan. Length defaults to 5; even bumped to 200 with a
    // 10k-bar history it's well under a few ms. Trades clarity for the
    // monotonic-deque optimisation — easy to revisit if profiling demands.
    for (let i = 0; i < n; i++) {
        const start = Math.max(0, i - length + 1);
        let mx = -Infinity;
        let bad = false;
        for (let k = start; k <= i; k++) {
            const c = candles[k] && candles[k].close;
            if (typeof c !== 'number' || !Number.isFinite(c)) {
                bad = true;
                break;
            }
            if (c > mx) mx = c;
        }
        if (bad) continue;
        out[i] = { time: candles[i].time, value: mx };
    }

    return out;
}
