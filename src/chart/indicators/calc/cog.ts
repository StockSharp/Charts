// Center of Gravity Oscillator (John Ehlers).
// Port of StockSharp Algo.Indicators CenterOfGravityOscillator.cs.
//
// .cs buffer is FIFO with `PushBack(price)`. The weighted sum walks the
// buffer oldest→newest with weights 1..length:
//   sumWeightedPrice = Σ_{k=0..length-1} price[k] * (k+1)      // k=0 is oldest
//   sumPrice         = Σ_{k=0..length-1} price[k]
//   CGO              = sumWeightedPrice / sumPrice − (length+1)/2
//
// NOTE on the spec's sign: the user-supplied scope said
// `CG = -Σ(close[i] × (i+1)) / Σ(close[i])`, but the .cs source produces
// the value above (positive weighted ratio, then a constant subtraction
// that centres the indicator near zero). We match the .cs exactly because
// that's what the desktop terminal plots. The output sign here can differ
// from a reference web-charting CG implementation that uses the negation form.
//
// `length` default 10. First (length-1) outputs are null (warm-up). If
// every close in the window is zero, sumPrice == 0 → emit null.

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
export function calcCOG(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 10;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };
    if (length <= 0) return out;

    const part = (length + 1) / 2;

    for (let i = length - 1; i < n; i++) {
        let sumPrice = 0;
        let sumWeighted = 0;
        let ok = true;
        // Walk window oldest→newest: indices i-length+1 .. i, weights 1..length.
        for (let k = 0; k < length; k++) {
            const c = candles[i - length + 1 + k] && candles[i - length + 1 + k].close;
            if (typeof c !== 'number' || !Number.isFinite(c)) {
                ok = false;
                break;
            }
            sumPrice += c;
            sumWeighted += c * (k + 1);
        }
        if (!ok || sumPrice === 0) continue;
        out[i] = { time: candles[i].time, value: sumWeighted / sumPrice - part };
    }
    return out;
}
