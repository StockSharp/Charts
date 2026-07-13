// Hull Moving Average (Alan Hull, 2005).
// Port of StockSharp Algo.Indicators HullMovingAverage.cs:
//   wmaSlow   = WMA(close, length)
//   wmaFast   = WMA(close, floor(length / 2))
//   raw[i]    = 2 * wmaFast[i] - wmaSlow[i]   (once both WMAs are formed)
//   HMA[i]    = WMA(raw, sqrtPeriod)
// where sqrtPeriod defaults to floor(sqrt(length)) when not supplied or 0.
//
// Warm-up: wmaSlow seeds at index (length-1) and wmaFast much earlier, so
// `raw` starts at index (length-1). The final WMA over `raw` needs
// `sqrtPeriod` samples, so first non-null HMA lands at index
// (length-1) + (sqrtPeriod-1) = length + sqrtPeriod - 2. Mirrors
// `NumValuesToInitialize = base + sqrtWma - 1`.

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
 * Weighted moving average on a numeric array (most-recent weight = `length`).
 * Returns an array of (number|null), same length as input. Null until index
 * length-1, or whenever a window contains a non-finite sample.
 * @param {(number|null)[]} values
 * @param {number} length
 * @returns {(number|null)[]}
 */
function wmaArray(values, length) {
    const n = values.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = null;
    if (length <= 0 || n < length) return out;
    const denom = (length * (length + 1)) / 2;
    for (let i = length - 1; i < n; i++) {
        let sum = 0;
        let bad = false;
        for (let k = 0; k < length; k++) {
            const v = values[i - k];
            if (typeof v !== 'number' || !Number.isFinite(v)) { bad = true; break; }
            sum += v * (length - k);
        }
        out[i] = bad ? null : sum / denom;
    }
    return out;
}

/**
 * @param {CandlePoint[]} candles
 * @param {{length?: number, sqrtPeriod?: number}} [params]
 * @returns {IndicatorPoint[]}
 */
export function calcHMA(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 10;
    const sqrtRaw = params && Number.isFinite(params.sqrtPeriod) ? (params.sqrtPeriod | 0) : 0;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };
    if (length <= 0) return out;

    const halfLen = (length / 2) | 0; // C# `Length / 2` is integer division.
    const sqrtLen = sqrtRaw > 0 ? sqrtRaw : (Math.sqrt(length) | 0);
    if (halfLen <= 0 || sqrtLen <= 0) return out;

    const closes = new Array(n);
    for (let i = 0; i < n; i++) closes[i] = candles[i] && candles[i].close;

    const slow = wmaArray(closes, length);
    const fast = wmaArray(closes, halfLen);

    const raw = new Array(n);
    for (let i = 0; i < n; i++) {
        const a = fast[i];
        const b = slow[i];
        if (a === null || b === null) raw[i] = null;
        else raw[i] = 2 * a - b;
    }

    // Final WMA over `raw` — but it must only consider raw samples that
    // exist (i.e. start counting after slow WMA has formed). The simplest
    // and correct way: wmaArray treats nulls as "bad window", which gives
    // exactly the warm-up we want — first non-null appears `sqrtLen-1`
    // bars after `raw` becomes non-null at index (length-1).
    const result = wmaArray(raw, sqrtLen);

    for (let i = 0; i < n; i++) {
        if (result[i] !== null) {
            out[i] = { time: candles[i].time, value: result[i] };
        }
    }
    return out;
}
