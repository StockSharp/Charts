// Jurik Moving Average (JMA).
// Port of StockSharp Algo.Indicators JurikMovingAverage.cs.
//
// NON-TRIVIAL ALGORITHM. The Jurik filter is a multi-stage cascade with two
// hidden state variables (prevMa1, prevMa2) and a derived `beta` smoothing
// constant. The full closed-form Jurik filter is proprietary; the .cs file
// in StockSharp implements a simplified two-stage variant. This port is a
// FAITHFUL line-by-line copy of that variant — do NOT try to derive the
// expected values from first principles or from third-party Jurik docs,
// they will not match.
//
// Unit tests for JMA in this codebase are REGRESSION LOCK-INS: they record
// the exact output of THIS implementation against a fixed input vector,
// which has been hand-verified against the StockSharp .cs runtime once. If
// you change the algorithm, only re-bless the regression numbers after
// re-verifying against the .cs.
//
// Parameters:
//   length — period N, default 20. Must be >= 1.
//   phase  — JMA phase in [-100, 100], default 0. .cs raises if out of range.
//
// Derived (re-computed every call from length / phase):
//   beta       = 0.45 * (length - 1) / (0.45 * (length - 1) + 2)
//   phaseRatio = (phase + 100) / 200
//
// Step recurrence (per bar after warm-up):
//   ma1 = prevMa1 + beta * (price - prevMa1)
//   ma2 = prevMa2 + beta * (ma1 - prevMa2)
//   jma = ma2 + phaseRatio * (ma2 - prevMa2)
//   prevMa1 = ma1; prevMa2 = ma2
//
// Warm-up (.cs):
//   For bar i in [0..length-1]:
//     prevMa1 = prevMa2 = close[i]
//     output  = close[i]
//   That is, the output exactly tracks the input close during warm-up; the
//   recurrence only begins from bar `length` onward, seeded with prevMa1 =
//   prevMa2 = close[length-1]. So there is NO leading-null block — the first
//   `length` outputs are the close prices themselves.

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
 * @param {{length?: number, phase?: number}} [params]
 * @returns {IndicatorPoint[]}
 */
export function calcJurikMovingAverage(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 20;
    let phase = params && Number.isFinite(params.phase) ? (params.phase | 0) : 0;
    // .cs throws on phase out of [-100, 100]. Clamp here defensively so a
    // bad UI input doesn't crash chart rendering.
    if (phase < -100) phase = -100;
    else if (phase > 100) phase = 100;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };
    if (length <= 0) return out;

    // beta and phaseRatio per the .cs Reset(): derived from length & phase.
    const beta = 0.45 * (length - 1) / (0.45 * (length - 1) + 2);
    const phaseRatio = (phase + 100) / 200;

    let prevMa1 = 0;
    let prevMa2 = 0;

    // Warm-up: outputs are the raw closes; prevMa1/prevMa2 latch to the
    // last warm-up close. (Mirrors `!IsFormed && IsFinal` branch.)
    let formed = false;
    for (let i = 0; i < n; i++) {
        const c = candles[i] && candles[i].close;
        if (typeof c !== 'number' || !Number.isFinite(c)) {
            // Bad input: emit null, do NOT advance state. Once we recover
            // we'll continue from where we were. (.cs would not advance
            // Buffer either since input isn't a usable decimal.)
            continue;
        }
        if (!formed) {
            prevMa1 = c;
            prevMa2 = c;
            // Not formed until `length` warm-up bars consumed (DecimalLengthIndicator);
            // StockSharp nulls the earlier bars, so only the last warm-up bar emits.
            if (i + 1 >= length) {
                out[i] = { time: candles[i].time, value: c };
                formed = true;
            }
            continue;
        }
        const ma1 = prevMa1 + beta * (c - prevMa1);
        const ma2 = prevMa2 + beta * (ma1 - prevMa2);
        const jma = ma2 + phaseRatio * (ma2 - prevMa2);
        prevMa1 = ma1;
        prevMa2 = ma2;
        out[i] = { time: candles[i].time, value: jma };
    }

    return out;
}
