// Connors RSI (CRSI) — Larry Connors, 2012.
// Port of StockSharp Algo.Indicators ConnorsRSI.cs:
//   CRSI = (rsiClose + rsiStreak + rsiRoc) / 3
// where each component is a Wilder-smoothed RSI:
//   * rsiClose  = RSI(close,        length = RSIPeriod = 3)
//   * rsiStreak = RSI(streak,       length = StreakRSIPeriod = 2)
//   * rsiRoc    = RSI(ROC(close, ROCRSIPeriod), length = ROCRSIPeriod = 100)
//
// IMPORTANT — StockSharp ≠ textbook Connors:
//
// The original Connors (2012) paper defines the third component as a
// **percent-rank** of a 1-bar ROC over a lookback window. StockSharp's
// ConnorsRSI.cs implements it differently: it takes the standard
// RateOfChange (Length=100, NOT 1) of close, then runs a 100-period RSI
// over THAT series. We follow the .cs verbatim so the JS readouts match
// the desktop terminal — note this deviation from the textbook formula.
//
// Streak definition (matches the .cs `CalculateStreak`):
//   * first bar: streak = 1 (no previous bar to compare)
//   * thereafter, given prevStreak / prevPrice:
//       currentPrice > prevPrice → streak = prevStreak > 0 ? prevStreak + 1 : 1
//       currentPrice < prevPrice → streak = prevStreak < 0 ? prevStreak - 1 : -1
//       equal                    → streak = 0
//
// Warm-up cascade is deep — first non-null CRSI lands at roughly
//   max(rsi3 warm-up, rsi2 warm-up, ROC(100) warm-up + RSI(100) warm-up).
// With defaults (3, 2, 100) that's ~ 100 (ROC seed) + 100 (RSI seed) ≈ 200
// bars before the third component is real, so CRSI is effectively only
// usable from index ~200 onward.
//
// Tests in connorsrsi.test.js use constant-series invariants (all-up →
// CRSI saturates at known values) plus a regression lock-in on a small
// known vector. Hand-deriving every step on a real series is impractical.

// Note: we don't import calc/rsi.js — that helper takes candles and aborts
// when the seed window has nulls. Connors RSI feeds RSI a series with a
// leading null prefix (from ROC's own warm-up), so we inline a small
// (number|null)[]-aware Wilder RSI helper below.

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
 * RSI over a (number|null)[] series — same Wilder smoothing as
 * calc/rsi.js but tolerates a leading null prefix (skips it and seeds
 * from the first run of `length` consecutive finite samples). Needed
 * because we feed RSI the output of ROC, which is null until its own
 * warm-up clears. We DON'T reuse calcRSI here because that helper
 * aborts the entire output when the seed window contains nulls.
 *
 * Returns a (number|null)[] aligned 1:1 with input.
 *
 * @param {(number|null)[]} values
 * @param {number} length
 * @returns {(number|null)[]}
 */
import { smoothedMA } from './helpers.js';

// RSI over a (number|null)[] series matching the SMMA semantics of
// StockSharp's RelativeStrengthIndex.cs. The first finite element is
// consumed as `_last` (no output). From the next element onwards, deltas
// drive two parallel SMMAs (gain and loss); the SMMA emits a value from
// its very first call (Sum/Length partial during warmup, Wilder recursion
// once the window has length samples).
//
// Output is aligned 1:1 with the input series — out[i] is the RSI for
// values[i] using values[0..i] only. Slots before the first valid
// consumable index (where the input is non-finite) propagate null.
function rsiOverArray(values, length) {
    const n = values.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = null;
    if (length <= 0 || n === 0) return out;

    // Find first index where values[start] is finite — this is the "_last"
    // seed input. Subsequent inputs from start+1 onwards produce deltas
    // that drive the gain/loss SMMAs.
    let start = -1;
    for (let i = 0; i < n; i++) {
        const v = values[i];
        if (typeof v === 'number' && Number.isFinite(v)) { start = i; break; }
    }
    if (start < 0 || start + 1 >= n) return out;

    // Build per-call gain/loss series. gains[k] / losses[k] = the SMMA
    // input for the k-th call after the seed. Maps to the (start+1+k)-th
    // position in `values`. Total length = n - start - 1.
    const m = n - start - 1;
    const gains = new Array(m);
    const losses = new Array(m);
    for (let k = 0; k < m; k++) {
        const prev = values[start + k];
        const curr = values[start + k + 1];
        if (typeof prev !== 'number' || !Number.isFinite(prev) ||
            typeof curr !== 'number' || !Number.isFinite(curr)) {
            gains[k] = null;
            losses[k] = null;
            continue;
        }
        const d = curr - prev;
        gains[k] = d > 0 ? d : 0;
        losses[k] = d < 0 ? -d : 0;
    }

    const avgG = smoothedMA(gains, length);
    const avgL = smoothedMA(losses, length);

    for (let k = 0; k < m; k++) {
        const g = avgG[k];
        const l = avgL[k];
        if (g === null || l === null) continue;
        const sum = g + l;
        const rsi = sum === 0 ? 50 : 100 * g / sum;
        out[start + 1 + k] = rsi;
    }
    return out;
}

/**
 * Rate-of-change matching StockSharp RateOfChange.cs (which inherits from
 * Momentum). The C# implementation uses a CircularBuffer with capacity
 * Length+1: at input N, Buffer[0] is the oldest value still in the
 * buffer — `close[max(0, N - Length)]`. So during warm-up (N <= Length),
 * ROC compares against `close[0]`, not against `close[N - Length]` (which
 * doesn't exist yet). After the buffer fills, it slides to the canonical
 * `(close[N] - close[N - Length]) / close[N - Length] * 100`.
 *
 * Per-input output: never null while inputs are finite — even at input 0
 * we have Buffer.Count=1 with Buffer[0]=close[0], so ROC[0]=0. Null only
 * on non-finite input or zero base.
 *
 * @param {(number|null)[]} closes
 * @param {number} length
 * @returns {(number|null)[]}
 */
function rocSeries(closes, length) {
    const n = closes.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = null;
    if (length <= 0) return out;
    for (let i = 0; i < n; i++) {
        const cur = closes[i];
        if (typeof cur !== 'number' || !Number.isFinite(cur)) continue;
        const baseIdx = Math.max(0, i - length);
        const baseVal = closes[baseIdx];
        if (typeof baseVal !== 'number' || !Number.isFinite(baseVal) ||
            baseVal === 0) continue;
        out[i] = (cur - baseVal) / baseVal * 100;
    }
    return out;
}

/**
 * Streak values per .cs CalculateStreak. Index 0 = 1 by default (no
 * previous bar). Returns null for any bar where the close is non-finite.
 * @param {(number|null)[]} closes
 * @returns {(number|null)[]}
 */
function streakSeries(closes) {
    const n = closes.length;
    const out = new Array(n);
    let prevPrice: number | null = null;
    let prevStreak = 0;
    for (let i = 0; i < n; i++) {
        const c = closes[i];
        if (typeof c !== 'number' || !Number.isFinite(c)) {
            out[i] = null;
            // Don't update prevPrice/prevStreak on gap — keep last known.
            continue;
        }
        if (prevPrice === null) {
            // .cs returns streak=1 on the first call (buffer empty branch).
            out[i] = 1;
            prevStreak = 1;
            prevPrice = c;
            continue;
        }
        let s;
        if (c > prevPrice) s = prevStreak > 0 ? prevStreak + 1 : 1;
        else if (c < prevPrice) s = prevStreak < 0 ? prevStreak - 1 : -1;
        else s = 0;
        out[i] = s;
        prevStreak = s;
        prevPrice = c;
    }
    return out;
}

/**
 * @param {CandlePoint[]} candles
 * @param {{rsiLength?: number, streakLength?: number, rocLength?: number}} [params]
 * @returns {{rsi: IndicatorPoint[], updown: IndicatorPoint[], rocrsi: IndicatorPoint[], crsi: IndicatorPoint[]}}
 */
export function calcConnorsRSI(candles, params) {
    const rsiLength = params && Number.isFinite(params.rsiLength) ? (params.rsiLength | 0) : 3;
    const streakLength = params && Number.isFinite(params.streakLength) ? (params.streakLength | 0) : 2;
    const rocLength = params && Number.isFinite(params.rocLength) ? (params.rocLength | 0) : 100;

    if (!Array.isArray(candles) || candles.length === 0) {
        return { rsi: [], updown: [], rocrsi: [], crsi: [] };
    }

    const n = candles.length;
    const rsiOut = new Array(n);
    const updownOut = new Array(n);
    const rocrsiOut = new Array(n);
    const crsiOut = new Array(n);
    for (let i = 0; i < n; i++) {
        const t = candles[i] && candles[i].time;
        rsiOut[i] = { time: t, value: null };
        updownOut[i] = { time: t, value: null };
        rocrsiOut[i] = { time: t, value: null };
        crsiOut[i] = { time: t, value: null };
    }

    if (rsiLength <= 0 || streakLength <= 0 || rocLength <= 0) {
        return { rsi: rsiOut, updown: updownOut, rocrsi: rocrsiOut, crsi: crsiOut };
    }

    const times = new Array(n);
    const closes = new Array(n);
    for (let i = 0; i < n; i++) {
        times[i] = candles[i].time;
        const c = candles[i] && candles[i].close;
        closes[i] = typeof c === 'number' && Number.isFinite(c) ? c : null;
    }

    // 1) RSI of close prices.
    const rsi1 = rsiOverArray(closes, rsiLength);

    // 2) RSI of streak.
    const streaks = streakSeries(closes);
    const rsi2 = rsiOverArray(streaks, streakLength);

    // 3) RSI of ROC(close, rocLength).
    const roc = rocSeries(closes, rocLength);
    const rsi3 = rsiOverArray(roc, rocLength);

    // C# ConnorsRSI emits the composite only AFTER all inner indicators are
    // formed: Rsi.IsFormed && UpDownRsi.IsFormed && RocRsi.IsFormed && _roc.IsFormed.
    // Each inner RSI is formed at its SMMA call # length (input index = length).
    // ROC is formed when Buffer.Count > rocLength, i.e. at input index = rocLength.
    // The bottleneck is rocLength on both fronts → first IsFormed at index = rocLength.
    const firstFormed = Math.max(rsiLength, streakLength, rocLength);

    // All FOUR inner lines (Rsi, UpDownRsi, RocRsi, CrsiLine) are Added — and
    // therefore dumped — ONLY inside the combined `!rocValue.IsEmpty &&
    // Rsi.IsFormed && UpDownRsi.IsFormed && RocRsi.IsFormed && _roc.IsFormed`
    // gate, so every line shares the SAME warm-up (bar firstFormed), not each
    // sub-RSI's own. Gate all four identically.
    for (let i = 0; i < n; i++) {
        if (i < firstFormed) continue;
        const a = rsi1[i];
        const b = rsi2[i];
        const c = rsi3[i];
        if (typeof a !== 'number' || typeof b !== 'number' || typeof c !== 'number' ||
            !Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) continue;
        rsiOut[i] = { time: times[i], value: a };
        updownOut[i] = { time: times[i], value: b };
        rocrsiOut[i] = { time: times[i], value: c };
        crsiOut[i] = { time: times[i], value: (a + b + c) / 3 };
    }
    return { rsi: rsiOut, updown: updownOut, rocrsi: rocrsiOut, crsi: crsiOut };
}
