// Highest — trailing maximum of the candle CLOSE over `length` bars.
//
// Port of StockSharp Algo.Indicators Highest.cs. That source reads
// `input.ToCandle().HighPrice`, which looks like the bar high but is not:
// Highest inherits [IndicatorIn(typeof(DecimalIndicatorValue))] from
// BaseIndicator and never overrides it, so the platform hands it a decimal.
// SingleIndicatorValue<decimal>.GetValue<ICandleMessage>() expands that decimal
// into a candle whose open/high/low/close are all the same number, so
// .HighPrice returns it unchanged — the close on a candle feed. The one
// expression serves both input shapes, which is what makes the C# misleading.
//
// LengthIndicator.CalcIsFormed() is `Buffer.Count >= Length`, so nothing is
// emitted before index `length - 1`; StockSharp reports the pre-form values as
// not-formed, i.e. null on the wire.

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

    // O(n*length) window scan of the bar CLOSE; emit only once formed (i >= length-1).
    for (let i = length - 1; i < n; i++) {
        let mx = -Infinity;
        let bad = false;
        for (let k = i - length + 1; k <= i; k++) {
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
