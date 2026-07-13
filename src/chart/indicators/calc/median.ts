// Moving Median — trailing median of close price over `length` bars.
// Port of StockSharp Algo.Indicators Median.cs.
//
// The .cs maintains a FIFO `_window` of size `Length` plus a sorted side
// list `_sorted`. On each final candle it dequeues the oldest sample (when
// full), enqueues the new one, then returns the median of the sorted list:
//   odd  n  -> data[n/2]
//   even n  -> (data[n/2 - 1] + data[n/2]) / 2
//
// We're a batch / closed-bar calculator, so we just slice the trailing
// `length` closes for each output point, sort, and take the median. First
// (length-1) outputs are null (window not yet full) — mirrors
// `CalcIsFormed() => _window.Count == Length`. Non-finite values inside
// the window invalidate that output (kept consistent with simpleMA).
// Default length: 5 (matches the .cs ctor).

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
export function calcMedian(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 5;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };
    if (length <= 0) return out;

    const buf = new Array(length);
    for (let i = length - 1; i < n; i++) {
        let ok = true;
        for (let k = 0; k < length; k++) {
            const c = candles[i - length + 1 + k] && candles[i - length + 1 + k].close;
            if (typeof c !== 'number' || !Number.isFinite(c)) { ok = false; break; }
            buf[k] = c;
        }
        if (!ok) continue;
        // Sort a fresh copy so we don't mutate `buf` between iterations
        // (cheap for small `length` typical of this indicator).
        const sorted = buf.slice().sort((a, b) => a - b);
        const m = length;
        let med;
        if ((m & 1) === 1) {
            med = sorted[(m - 1) >> 1];
        } else {
            med = (sorted[(m >> 1) - 1] + sorted[m >> 1]) / 2;
        }
        out[i] = { time: candles[i].time, value: med };
    }
    return out;
}
