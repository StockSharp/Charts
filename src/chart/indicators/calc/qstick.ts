// QStick — Tushar Chande's open-close momentum oscillator.
// Port of StockSharp Algo.Indicators QStick.cs.
//
// Algorithm (per .cs):
//   per bar: feed (OpenPrice - ClosePrice) into a SimpleMovingAverage.
//   Default Length = 15.
//
// Note on SMA semantics: StockSharp's SimpleMovingAverage divides the running
// buffer sum by Length even before the buffer is full (i.e. partial-window
// averages from bar 0 onwards), NOT by the actual sample count. So the very
// first output equals (open[0]-close[0]) / Length, the second equals
// (sum of first two open-close diffs) / Length, etc. This matches the
// reference IndicatorsData/QStick.txt file row-for-row. We replicate that
// here instead of delegating to ./sma.js (which follows the more standard
// "null until buffer full, then sum/length" pattern).
//
// Sign convention: it's (open - close), not (close - open). When close > open
// (a green candle), value is negative; when close < open (a red candle),
// value is positive. The .cs literally writes
//   `_sma.Process(input, candle.OpenPrice - candle.ClosePrice)`.

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
export function calcQStick(candles, params) {
    const length = params && Number.isFinite(params.length) && params.length > 0
        ? (params.length | 0)
        : 15;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    // Pre-compute (open - close) for each bar so the loop can keep a running
    // sum and pop the oldest element in O(1).
    const diffs = new Array(n);
    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const o = c && c.open;
        const cl = c && c.close;
        if (typeof o === 'number' && Number.isFinite(o) &&
            typeof cl === 'number' && Number.isFinite(cl)) {
            diffs[i] = o - cl;
        } else {
            diffs[i] = null;
        }
    }

    // Running sum over the last `length` valid diffs. Invalid (null) samples
    // make the current window's output null until the bad point drops out.
    let sum = 0;
    let invalid = 0;
    for (let i = 0; i < n; i++) {
        const d = diffs[i];
        if (d === null) invalid++;
        else sum += d;

        if (i >= length) {
            const drop = diffs[i - length];
            if (drop === null) invalid--;
            else sum -= drop;
        }

        if (invalid > 0) {
            out[i] = { time: candles[i].time, value: null };
        } else {
            // Divide by Length (not by actual count). Matches C# SMA semantics.
            out[i] = { time: candles[i].time, value: sum / length };
        }
    }
    return out;
}
