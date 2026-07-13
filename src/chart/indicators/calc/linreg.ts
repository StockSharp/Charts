// Linear Regression endpoint (Algo.Indicators/LinearReg.cs).
// Fits a least-squares line y = slope*x + intercept over the last `length`
// closes (x = 0..Length-1) and returns the line's value at x = Length-1,
// i.e. the current-bar prediction.
//
// .cs algorithm (verbatim):
//   sumX, sumY, sumXY, sumX2 over indices 0..Length-1 of the buffer
//   divisor = Length * sumX2 - sumX * sumX
//   slope   = divisor == 0 ? 0 : (Length * sumXY - sumX * sumY) / divisor
//   b       = (sumY - slope * sumX) / Length
//   return  = slope * (Length - 1) + b
//
// Default length: 11 (matches .cs).
//
// Deviation note vs .cs: the .cs LinearReg also emits a value for warm-up
// bars (running over a partial buffer). Existing JS indicators in this
// codebase emit `null` until they're fully formed (SMA/EMA convention),
// so we do the same: first (length-1) outputs are null. This matches what
// downstream charts expect and what `IsFormed` (Buffer.Count >= Length)
// would gate to in .NET clients.

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
 * Compute LinearReg over `length` closes ending at `endIdx` (inclusive).
 * Returns the regression line's value at the last bar.
 * @param {(number|null)[]} closes
 * @param {number} endIdx
 * @param {number} length
 * @returns {number|null}
 */
function lrEndpoint(closes, endIdx, length) {
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let k = 0; k < length; k++) {
        const y = closes[endIdx - length + 1 + k];
        if (typeof y !== 'number' || !Number.isFinite(y)) return null;
        sumX += k;
        sumY += y;
        sumXY += k * y;
        sumX2 += k * k;
    }
    const divisor = length * sumX2 - sumX * sumX;
    const slope = divisor === 0 ? 0 : (length * sumXY - sumX * sumY) / divisor;
    const b = (sumY - slope * sumX) / length;
    return slope * (length - 1) + b;
}

/**
 * Linear regression endpoint over `length` closes.
 * @param {CandlePoint[]} candles
 * @param {{length?: number}} [params]
 * @returns {IndicatorPoint[]}
 */
export function calcLinearReg(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 11;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const closes = new Array(n);
    for (let i = 0; i < n; i++) closes[i] = candles[i] && candles[i].close;

    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };
    if (length <= 0) return out;

    for (let i = length - 1; i < n; i++) {
        const v = lrEndpoint(closes, i, length);
        if (v !== null) out[i] = { time: candles[i].time, value: v };
    }
    return out;
}
