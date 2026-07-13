// Weighted Moving Average — close-price based, linear weights.
// For each i >= length-1:
//   WMA[i] = Σ_{k=0..length-1} close[i-k] * (length - k) / Σ_{k=0..length-1} (length - k)
// i.e. most-recent bar gets weight `length`, oldest gets weight 1. Denominator
// is the triangular number length*(length+1)/2 (constant per call).
// First (length-1) outputs are null (warm-up).

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
export function calcWMA(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 20;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    if (length <= 0) return out;
    const denom = (length * (length + 1)) / 2;

    for (let i = length - 1; i < n; i++) {
        let sum = 0;
        let bad = false;
        for (let k = 0; k < length; k++) {
            const c = candles[i - k] && candles[i - k].close;
            if (typeof c !== 'number' || !Number.isFinite(c)) { bad = true; break; }
            sum += c * (length - k);
        }
        if (bad) {
            out[i] = { time: candles[i].time, value: null };
            continue;
        }
        out[i] = { time: candles[i].time, value: sum / denom };
    }
    return out;
}
