// Highest — trailing maximum of the candle HIGH over `length` bars.
// Port of StockSharp Algo.Indicators Highest.cs, which reads
// `input.ToCandle().HighPrice`. On the chart's candle feed that is the bar
// HIGH (not the close). The indicator is a DecimalLengthIndicator: it is
// IsFormed only once `length` values are buffered, so nothing is emitted
// before index `length - 1` (StockSharp reports the pre-form values as
// not-formed, i.e. null on the wire).

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

    // O(n*length) window scan of the bar HIGH; emit only once formed (i >= length-1).
    for (let i = length - 1; i < n; i++) {
        let mx = -Infinity;
        let bad = false;
        for (let k = i - length + 1; k <= i; k++) {
            const h = candles[k] && candles[k].high;
            if (typeof h !== 'number' || !Number.isFinite(h)) {
                bad = true;
                break;
            }
            if (h > mx) mx = h;
        }
        if (bad) continue;
        out[i] = { time: candles[i].time, value: mx };
    }

    return out;
}
