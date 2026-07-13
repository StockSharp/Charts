// Arnaud Legoux Moving Average (ALMA).
// Port of StockSharp Algo.Indicators ArnaudLegouxMovingAverage.cs.
//
// Parameters:
//   length (default 9)  — window size.
//   offset (default 0.85) — Gaussian centre as fraction of (length-1).
//                          0 = lag-heavy (centre at oldest), 1 = noisy (centre at newest).
//   sigma  (default 6)   — Gaussian width; larger = smoother.
//
// Formula (matches the .cs `OnProcessDecimal`):
//   m = offset * (length - 1)
//   s = length / sigma
//   w[i] = exp( -(i - m)^2 / (2 s^2) )                 for i = 0..length-1
//   value[t] = Σ_{i=0..length-1} ( close[t - (length-1-i)] * w[i] ) / Σ w[i]
//
// The .cs walks the buffer as `Buffer[Length-1-i]`. StockSharp's CircularBuffer
// is FIFO with PushBack appending to the end, so `Buffer[0]` is the OLDEST and
// `Buffer[Length-1]` is the NEWEST close. Therefore at `i=0` the .cs reads the
// NEWEST close, and at `i=Length-1` the OLDEST. With `offset=0.85` and
// `m = offset*(Length-1) = 6.8` on Length=9, the Gaussian centre sits near
// `i=7`, so the heaviest weights land on `Buffer[1]` and `Buffer[2]` — the
// SECOND- and THIRD-OLDEST closes in the window (a deliberately lag-heavy
// configuration matching the StockSharp default). An earlier port had this
// mapping inverted, which produced opposite-direction lag/lead.
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
 * @param {{length?: number, offset?: number, sigma?: number}} [params]
 * @returns {IndicatorPoint[]}
 */
export function calcALMA(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 9;
    const offset = params && Number.isFinite(params.offset) ? params.offset : 0.85;
    const sigma = params && Number.isFinite(params.sigma) ? (params.sigma | 0) : 6;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    if (length <= 0 || sigma <= 0 || n < length) return out;

    // Precompute weights once — they only depend on length/offset/sigma.
    const m = offset * (length - 1);
    const s = length / sigma;
    const w = new Array(length);
    let weightSum = 0;
    for (let i = 0; i < length; i++) {
        const d = (i - m) / s;
        const wi = Math.exp(-(d * d) / 2);
        w[i] = wi;
        weightSum += wi;
    }
    if (weightSum === 0) return out; // pathological sigma — keep nulls.

    for (let t = length - 1; t < n; t++) {
        let sum = 0;
        let ok = true;
        for (let i = 0; i < length; i++) {
            // Mirror the .cs `Buffer[Length-1-i]` access: at i=0 read the
            // NEWEST close (t), at i=Length-1 read the OLDEST (t-(Length-1)).
            const idx = t - i;
            const c = candles[idx] && candles[idx].close;
            if (typeof c !== 'number' || !Number.isFinite(c)) {
                ok = false;
                break;
            }
            sum += c * w[i];
        }
        if (ok) out[t] = { time: candles[t].time, value: sum / weightSum };
    }
    return out;
}
