// Hurst Exponent (simplified R/S analysis on a fixed-length window).
// Port of StockSharp Algo.Indicators HurstExponent.cs.
//
// Once `length` finite closes have been pushed (call them values, count = N):
//   mean   = average(values)
//   dev[i] = values[i] - mean
//   cum[0] = dev[0]; cum[i] = cum[i-1] + dev[i]
//   range  = max(cum) - min(cum)
//   std    = sqrt( (Σ (values[i]-mean)²) / N )      // population sd, not sample
//   if std == 0: return null                         // .cs explicitly returns null
//   RS = range / std
//   H  = log(RS) / log(N)
//
// .cs deviation notes:
// (a) Source: `input.ToDecimal(Source)` defaults to close. We use close.
// (b) Warm-up: IsFormed flips true once Buffer is at capacity (count ==
//     length). First non-null output lands at index (length - 1).
// (c) The .cs uses `(decimal)Math.Sqrt((double)…)` then a decimal `Log()`
//     extension. We use Math.sqrt / Math.log directly — double precision
//     is more than enough for a chart indicator and matches what the
//     decimal Log() path would produce within rounding.
// (d) length == 1 makes log(1) = 0 → divide-by-zero. The .cs has no
//     explicit guard; we emit null in that case (length <= 1 → never
//     formed in spirit).
// (e) `IsFinal=false` (intra-bar) branch from the .cs is ignored.
// (f) Measure = MinusOnePlusOne is metadata; H is not actually bounded
//     to [-1, 1] in this simplified form. Real Hurst values mostly land
//     in (0, 1); we don't clamp.

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
export function calcHurstExponent(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 100;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };
    if (length <= 1 || n < length) return out;

    const logN = Math.log(length);

    for (let i = length - 1; i < n; i++) {
        // Pull the last `length` closes into a window.
        const win = new Array(length);
        let bad = false;
        let sum = 0;
        for (let k = 0; k < length; k++) {
            const c = candles[i - length + 1 + k] && candles[i - length + 1 + k].close;
            if (typeof c !== 'number' || !Number.isFinite(c)) { bad = true; break; }
            win[k] = c;
            sum += c;
        }
        if (bad) continue;

        const mean = sum / length;

        let cum = 0;
        let mxCum = -Infinity;
        let mnCum = Infinity;
        let sumSqr = 0;
        for (let k = 0; k < length; k++) {
            const d = win[k] - mean;
            cum += d;
            if (cum > mxCum) mxCum = cum;
            if (cum < mnCum) mnCum = cum;
            sumSqr += d * d;
        }
        const range = mxCum - mnCum;
        const std = Math.sqrt(sumSqr / length);
        if (std === 0) continue; // .cs returns null here

        const RS = range / std;
        const H = Math.log(RS) / logN;
        out[i] = { time: candles[i].time, value: H };
    }

    return out;
}
