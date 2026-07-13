// Lowest indicator (Algo.Indicators/Lowest.cs).
// Trailing minimum of the input price stream over `length` bars. Mirror
// of Highest. Aligned 1:1 with input candles.
//
// Although Lowest.cs reads `input.ToCandle().LowPrice`, the indicator
// inherits the default [IndicatorIn(typeof(DecimalIndicatorValue))]
// attribute from BaseIndicator — so the canonical test path feeds raw
// close prices. When ToCandle() is invoked on a DecimalIndicatorValue,
// the helper synthesises a candle with OHLC all equal to the decimal
// (LowPrice == ClosePrice). The indicator therefore effectively runs
// on close prices in the canonical test path; we match that by reading
// candle.close.
//
// Default length: 5 (matches the .cs default).

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
 * Trailing min of candle.close over `length` bars.
 * @param {CandlePoint[]} candles
 * @param {{length?: number}} [params]
 * @returns {IndicatorPoint[]}
 */
export function calcLowest(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 5;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };
    if (length <= 0) return out;

    for (let i = length - 1; i < n; i++) {
        let lo = +Infinity;
        let bad = false;
        for (let j = i - length + 1; j <= i; j++) {
            const c = candles[j];
            const cl = c && c.close;
            if (typeof cl !== 'number' || !Number.isFinite(cl)) { bad = true; break; }
            if (cl < lo) lo = cl;
        }
        if (bad) continue;
        out[i] = { time: candles[i].time, value: lo };
    }
    return out;
}
