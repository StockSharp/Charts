// Harmonic Oscillator.
// Port of StockSharp Algo.Indicators HarmonicOscillator.cs.
//
// Pre-computed once: sin[i] = sin(2π · i / length) for i in 0..length-1.
//
// For each formed bar (Buffer holds `length` finite closes; oldest first):
//   sum = Σ buffer[length - 1 - i] · sin[i]    for i in 0..length-1
//                                              (i.e. newest sample × sin[0],
//                                              one bar older × sin[1], ...)
//   value = sum / length
//
// .cs deviation notes:
// (a) Source: `input.ToDecimal(Source)` defaults to close. We use close.
// (b) Warm-up: IsFormed flips true once Buffer.Count == Length, so the
//     first non-null output lands at index (length - 1).
// (c) sin[0] = 0, so the most-recent close contributes nothing — that's
//     a property of the formula, preserved here.
// (d) `IsFinal=false` (intra-bar) branch from the .cs is ignored.
// (e) Measure = Percent is metadata only — we leave the value un-scaled.

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
export function calcHarmonicOscillator(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 14;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };
    if (length <= 0 || n < length) return out;

    const sin = new Array(length);
    for (let i = 0; i < length; i++) sin[i] = Math.sin(2 * Math.PI * i / length);

    for (let i = length - 1; i < n; i++) {
        let sum = 0;
        let bad = false;
        // Walk backwards over the last `length` closes.
        // j = 0 → newest, j = length-1 → oldest.
        for (let j = 0; j < length; j++) {
            const c = candles[i - j] && candles[i - j].close;
            if (typeof c !== 'number' || !Number.isFinite(c)) { bad = true; break; }
            sum += c * sin[j];
        }
        if (bad) continue;
        out[i] = { time: candles[i].time, value: sum / length };
    }

    return out;
}
