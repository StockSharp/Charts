// Linear Regression Slope (Algo.Indicators/LinearRegSlope.cs).
// Returns the slope coefficient of the least-squares line over the last
// `length` closes (x = 0..Length-1). Same buffer / sum-trick as LinearReg.
//
// .cs:
//   sumX, sumY, sumXY, sumX2 over the buffer (size Length)
//   divisor = Length * sumX2 - sumX * sumX
//   if divisor == 0: return null
//   return (Length * sumXY - sumX * sumY) / divisor
//
// Default length: 11 (matches .cs).
//
// Deviation note vs .cs: like LinearReg, the .cs LinearRegSlope emits a
// value once `divisor != 0` (which is true as soon as there are 2 distinct
// x values, i.e. from index 1 with Length=11 and a partial buffer). Our
// JS port matches the surrounding code style and emits `null` until
// Buffer.Count >= Length (the .NET IsFormed gate).

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
 * Compute least-squares slope over `length` closes ending at `endIdx`.
 * @param {(number|null)[]} closes
 * @param {number} endIdx
 * @param {number} length
 * @returns {number|null}
 */
function lrSlope(closes, endIdx, length) {
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
    if (divisor === 0) return null;
    return (length * sumXY - sumX * sumY) / divisor;
}

/**
 * Linear regression slope over `length` closes.
 * @param {CandlePoint[]} candles
 * @param {{length?: number}} [params]
 * @returns {IndicatorPoint[]}
 */
export function calcLinearRegSlope(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 11;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const closes = new Array(n);
    for (let i = 0; i < n; i++) closes[i] = candles[i] && candles[i].close;

    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };
    if (length <= 0) return out;

    for (let i = length - 1; i < n; i++) {
        const v = lrSlope(closes, i, length);
        if (v !== null) out[i] = { time: candles[i].time, value: v };
    }
    return out;
}
