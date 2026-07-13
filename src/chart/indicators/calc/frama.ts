// Fractal Adaptive Moving Average (FRAMA, John F. Ehlers).
// Port of StockSharp Algo.Indicators FractalAdaptiveMovingAverage.cs.
//
// Algorithm (once buffer holds `length` closes):
//   period = length / 3      (integer division, like C# decimal/int truncation)
//   slice1 = first `period` buffer entries  → n1 = (max-min)/period
//   slice2 = next  `period` buffer entries  → n2 = (max-min)/period
//   slice3 = remaining buffer entries       → n3 = (max-min)/period
//   d      = (log(n1 + n2) - log(n3)) / log(2)     (natural log; ratio is
//                                                   dimensionless either way)
//   d      = clamp(d, 1, 2)
//   alpha  = exp(-4.6 * (d - 1))
//   frama  = alpha * close + (1 - alpha) * prevFrama
//
// .cs deviation notes:
// (a) Source: the .cs calls `input.ToDecimal(Source)`. Default Source on
//     a candle is the close price. We use close.
// (b) Warm-up: the .cs gates on `IsFormed`, which for DecimalLengthIndicator
//     becomes true once the buffer holds exactly `length` samples. So the
//     first non-null FRAMA lands at index (length - 1). We emit null for
//     indices 0..length-2.
// (c) prevFrama starts at decimal default (0). That means the very first
//     FRAMA emission is `alpha * close + (1 - alpha) * 0 = alpha * close`.
//     We mirror this — it's deliberately the .cs behaviour even though it
//     produces a tiny spike on the very first formed bar before settling.
// (d) period = length / 3 in C# truncates toward zero for positive ints
//     (e.g. length=20 → period=6, buffer is 20 long → slices [0..6),
//     [6..12), [12..20) of sizes 6, 6, 8). We replicate exactly.
// (e) For length < 3 (period == 0) the slicing would be degenerate. In
//     that case we behave like the .cs: every slice would be empty and
//     `Max() - Min()` on an empty sequence throws — JS doesn't have that
//     luxury, so we emit null. This matches the spirit of "indicator not
//     formed" rather than introducing a divergent fallback.
// (f) `IsFinal=false` (intra-bar) branch from the .cs is ignored: this
//     calculator only processes a homogeneous batch of closed bars.

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
export function calcFRAMA(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 20;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    if (length <= 0) return out;
    const period = (length / 3) | 0; // C# int division for positives
    if (period <= 0) return out;     // length 1 or 2 — never formed
    if (n < length) return out;

    const log2 = Math.log(2);
    let prevFrama = 0;

    // Rolling buffer of the last `length` finite closes.
    const buffer = new Array(length);
    let buffered = 0;
    let head = 0; // index of the oldest element when buffer is full

    for (let i = 0; i < n; i++) {
        const c = candles[i] && candles[i].close;
        if (typeof c !== 'number' || !Number.isFinite(c)) {
            // Skip this bar; buffer state is unchanged and output stays null.
            continue;
        }

        if (buffered < length) {
            buffer[buffered] = c;
            buffered++;
        } else {
            buffer[head] = c;
            head = (head + 1) % length;
        }

        if (buffered < length) continue;

        // Read the buffer in chronological order.
        // ordered[0] = oldest, ordered[length-1] = newest.
        // We iterate the three slices without allocating an extra array.
        const sliceMaxMin = (start, count) => {
            let mx = -Infinity;
            let mn = Infinity;
            for (let k = 0; k < count; k++) {
                const idx = (head + start + k) % length;
                const v = buffer[idx];
                if (v > mx) mx = v;
                if (v < mn) mn = v;
            }
            return [mx, mn];
        };

        const [mx1, mn1] = sliceMaxMin(0, period);
        const [mx2, mn2] = sliceMaxMin(period, period);
        const [mx3, mn3] = sliceMaxMin(period * 2, length - period * 2);

        // The .cs `calculateDimension` always divides by `period`, even for
        // the third slice (which is `Buffer.Skip(period*2)` = length-2*period
        // items long, NOT period items long). So n3 = (max-min)/period too,
        // despite the slice having more entries.
        const n1 = (mx1 - mn1) / period;
        const n2 = (mx2 - mn2) / period;
        const n3 = (mx3 - mn3) / period;

        // log(0) = -Infinity; (-Inf - x) / log2 = -Inf, clamped to 1, alpha=1.
        // That makes frama track the new close fully on flat slices — same
        // as the .cs's `.Min(2).Max(1)` behaviour on -Inf.
        let d = (Math.log(n1 + n2) - Math.log(n3)) / log2;
        if (!Number.isFinite(d)) {
            // NaN: 0/0 or Inf-Inf. Treat as fully-trend (d=1, alpha=1).
            d = 1;
        }
        if (d > 2) d = 2;
        else if (d < 1) d = 1;

        const alpha = Math.exp(-4.6 * (d - 1));
        const newFrama = alpha * c + (1 - alpha) * prevFrama;
        out[i] = { time: candles[i].time, value: newFrama };
        prevFrama = newFrama;
    }

    return out;
}
