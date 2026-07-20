// Optimal Tracking (Kalman-style adaptive smoother of midprice).
// Port of StockSharp Algo.Indicators OptimalTracking.cs.
//
// Constants (exact from .cs):
//   k1 = exp(-0.25)              ≈ 0.7788007830714049
//   k0 = 1 - k1                  ≈ 0.22119921692859512
//
// State per filter run:
//   _value1Old   — last smoothed midprice-difference
//   _value2Old   — last smoothed half-range
//   _resultOld   — last filtered output
//   _lambda      — tracking index (updated only when smoothRng != 0)
//
// Per-bar inputs:
//   average   = (high + low) / 2
//   halfRange = (high - low) / 2
//
// Per-bar logic (mirrors .cs CalcBuffer.Calculate):
//   Bars 0 and 1 (indicator is NOT yet IsFormed — Length=2, buffer needs
//   two pushes BEFORE IsFormed flips):
//       _value2Old = halfRange
//       _resultOld = average
//       output     = average
//   Bar 2 onward (IsFormed):
//       avgDiff    = buff[-1] - buff[-2]    // last two midprices
//       smoothDiff = k0 * avgDiff   + k1 * _value1Old
//       smoothRng  = k0 * halfRange + k1 * _value2Old
//       _value1Old = smoothDiff
//       _value2Old = smoothRng
//       if (smoothRng != 0)
//           lambda = |smoothDiff / smoothRng|
//       alpha = (-lambda² + √(lambda⁴ + 16 lambda²)) / 8
//       result = alpha * average + (1 - alpha) * _resultOld
//       _resultOld = result
//       output = result
//
// .cs deviation notes:
//   (a) The .cs IsFormed flips AFTER the second bar (post-Process), so the
//       second bar still emits `average` (seed-branch). Output[2] is the
//       first filtered value.
//   (b) `_lambda` is per-instance state in the .cs (CalcBuffer struct
//       field). It carries between bars; we model the same.
//   (c) Bad bars (non-finite OHL) emit null and DO NOT advance state.

const K1 = Math.exp(-0.25);
const K0 = 1 - K1;

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
 * @param {object} [_params] No tunables — Length is hardcoded to 2 in .cs.
 * @returns {IndicatorPoint[]}
 */
export function calcOptimalTracking(candles, _params) {
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);

    let value1Old = 0;
    let value2Old = 0;
    let resultOld = 0;
    let lambda = 0;
    let pushedCount = 0; // mirrors Buffer.Count growth (capped at 2 effectively, but we only need the seeding gate)
    let prevAverage: number | null = null; // mirrors buff[count-2] once IsFormed

    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const h = c && c.high;
        const l = c && c.low;
        if (typeof h !== 'number' || !Number.isFinite(h) ||
            typeof l !== 'number' || !Number.isFinite(l)) {
            // Bad bar: don't touch filter state, emit null.
            out[i] = { time: c && c.time, value: null };
            continue;
        }

        const average = (h + l) / 2;
        const halfRange = (h - l) / 2;

        // C# LengthIndicator IsFormed = Buffer.Count >= Length (=2); the .cs
        // pushes BEFORE checking, so once we've already accumulated >= 1
        // previous bar (this is the 2nd or later bar), the formed branch fires.
        const isFormed = pushedCount >= 1;
        let result;

        if (!isFormed) {
            value2Old = halfRange;
            resultOld = average;
            result = average;
        } else {
            const avgDiff = average - prevAverage!;
            const smoothDiff = K0 * avgDiff + K1 * value1Old;
            const smoothRng = K0 * halfRange + K1 * value2Old;
            value1Old = smoothDiff;
            value2Old = smoothRng;
            if (smoothRng !== 0) {
                lambda = Math.abs(smoothDiff / smoothRng);
            }
            const l2 = lambda * lambda;
            const alpha = (-l2 + Math.sqrt(l2 * l2 + 16 * l2)) / 8;
            result = alpha * average + (1 - alpha) * resultOld;
            resultOld = result;
        }

        prevAverage = average;
        pushedCount++;
        if (pushedCount > 2) pushedCount = 2;

        // Not formed until Buffer.Count == Length (=2): StockSharp nulls the first
        // bar, so emit only from the second valid bar onward.
        out[i] = { time: c.time, value: pushedCount >= 2 ? result : null };
    }

    return out;
}
