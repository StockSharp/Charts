// Kalman Filter (adaptive 1-D price smoother).
// Port of StockSharp Algo.Indicators KalmanFilter.cs.
//
// State:
//   lastEstimate (x̂)  — running estimate of the underlying signal
//   errorCovariance (P) — uncertainty of that estimate, init = 1
//
// Per bar (with z = current close):
//   priorEstimate        = lastEstimate
//   priorErrorCovariance = errorCovariance + processNoise (Q)
//   kalmanGain (K)       = priorErrorCovariance / (priorErrorCovariance + measurementNoise (R))
//   newEstimate          = priorEstimate + K * (z - priorEstimate)
//   errorCovariance      = (1 - K) * priorErrorCovariance
//   output               = newEstimate
//
// Seed: the first bar sets lastEstimate = z, errorCovariance = 1, and the
// output for that bar IS the raw close — no filtering yet. From bar 2
// onward the recurrence above runs.
//
// Defaults (match .cs):
//   processNoise (Q)     = 1e-5
//   measurementNoise (R) = 1e-3
//   length               = 10  (only used by the .cs to gate IsFormed; it
//                               does not affect emitted values, so we
//                               accept the param but never read it after
//                               validation.)
//
// .cs deviation notes:
// (a) Length in the .cs controls Buffer.Count → IsFormed timing. Since this
//     calc emits a value for every bar (the .cs returns the estimate even
//     before IsFormed) we don't need to gate output on it. We accept the
//     param for API parity but it is otherwise inert.
// (b) The .cs throws if Q or R are <= 0. We clamp to a tiny positive value
//     instead so a bad UI input doesn't crash the chart.

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
 * @param {{length?: number, processNoise?: number, measurementNoise?: number}} [params]
 * @returns {IndicatorPoint[]}
 */
export function calcKalmanFilter(candles, params) {
    let processNoise = params && Number.isFinite(params.processNoise) ? +params.processNoise : 1e-5;
    let measurementNoise = params && Number.isFinite(params.measurementNoise) ? +params.measurementNoise : 1e-3;
    if (processNoise <= 0) processNoise = 1e-12;
    if (measurementNoise <= 0) measurementNoise = 1e-12;

    const length = params && Number.isFinite(params.length) && params.length > 0 ? (params.length | 0) : 10;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    let lastEstimate: number | null = null;
    let errorCovariance = 1;
    let validCount = 0;

    for (let i = 0; i < n; i++) {
        const c = candles[i] && candles[i].close;
        if (typeof c !== 'number' || !Number.isFinite(c)) {
            // Bad bar: keep state, emit null.
            continue;
        }
        validCount++;
        let estimate;
        if (lastEstimate === null) {
            lastEstimate = c;
            errorCovariance = 1;
            estimate = c;
        } else {
            const priorEstimate = lastEstimate;
            const priorErr = errorCovariance + processNoise;
            const k = priorErr / (priorErr + measurementNoise);
            estimate = priorEstimate + k * (c - priorEstimate);
            errorCovariance = (1 - k) * priorErr;
            lastEstimate = estimate;
        }
        // Not formed until `length` values processed (DecimalLengthIndicator).
        if (validCount >= length) out[i] = { time: candles[i].time, value: estimate };
    }

    return out;
}
