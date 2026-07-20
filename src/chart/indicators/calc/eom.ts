// Ease of Movement (EMV / EOM) — Richard W. Arms Jr.
// Port of StockSharp Algo.Indicators EaseOfMovement.cs:
//
//   midpointMove = (high + low) / 2 - (prevHigh + prevLow) / 2
//   boxRatio     = volume / (high - low)
//   emvRaw       = midpointMove / boxRatio
//                = midpointMove * (high - low) / volume
//   EOM[i]       = SMA(emvRaw, length)
//
// Special-cases (from the .cs):
//   * First bar emits null (no prev high/low yet).
//   * Skip the bar entirely (no contribution, output null) when
//     prevHigh == 0, prevLow == 0, or (high - low) == 0 — the .cs's
//     `_prevHigh != 0 && _prevLow != 0 && cl != 0` guard.
//     This matches the desktop terminal's behaviour for flat / missing bars.
//   * volume == 0 produces ±Infinity in standard arithmetic; we treat
//     it the same way as the zero-range case (skip, emit null) for safety.
//
// SMA on the .cs side uses `Buffer.Sum / Length` once buffer is formed
// (Buffer.Capacity = Length). Warm-up: first non-null raw EMV at index 1
// (needs prev bar); SMA-of-EMV becomes formed after `length` more raw
// values are buffered → first non-null SMA at index `length`.
//
// Default Length = 14, matching the .cs constructor.

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
export function calcEOM(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 14;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };
    if (length <= 0) return out;

    // EaseOfMovement.cs maintains its own circular buffer of capacity
    // `Length` that ONLY holds emv samples from "good" bars (prevHigh!=0,
    // prevLow!=0, range!=0). Gap bars (range==0 or volume==0) do NOT push,
    // so the buffer's contents are position-agnostic. Once Buffer.Count >=
    // Length the indicator is formed and emits `sum / Length` from every
    // subsequent good bar.
    //
    // _prevHigh / _prevLow are updated EVERY bar (regardless of the
    // good/gap branch) on IsFinal — i.e., we always use the immediate
    // previous candle as `prev`. We mirror that here by reading candles[i-1].
    // Explicit _prevHigh/_prevLow state, mirroring EaseOfMovement.cs. Key quirk:
    // once the indicator is formed it `return`s from the emv branch and so NEVER
    // reaches the `_prevHigh = candle.HighPrice` update below — meaning from the
    // first formed bar onward the mid-point move is measured against a FROZEN
    // previous candle (the bar just before forming), which is why the value
    // trends rather than staying a bounded SMA. The buffer itself is windowed.
    let prevHigh = 0;
    let prevLow = 0;
    const buf = [];
    let bufSum = 0;

    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const h = c && c.high;
        const l = c && c.low;
        const v = c && c.volume;
        const finite = typeof h === 'number' && Number.isFinite(h)
            && typeof l === 'number' && Number.isFinite(l)
            && typeof v === 'number' && Number.isFinite(v);
        const cl = finite ? h - l : 0;

        // The .cs guards range (cl != 0) but not volume; a zero-volume bar would
        // throw DivideByZero there. We guard it too and degrade to a gap (null).
        if (finite && prevHigh !== 0 && prevLow !== 0 && cl !== 0 && v !== 0) {
            const midMove = (h + l) / 2 - (prevHigh + prevLow) / 2;
            const emv = midMove * cl / v;
            buf.push(emv);
            bufSum += emv;
            if (buf.length > length) bufSum -= buf.shift();
            if (buf.length >= length) {
                // IsFormed -> emit and, like the .cs, return WITHOUT updating _prev.
                out[i] = { time: c.time, value: bufSum / length };
                continue;
            }
        }
        // Not returned early -> update _prev (the .cs does this on every IsFinal bar
        // that does not return from the formed branch).
        if (finite) {
            prevHigh = h;
            prevLow = l;
        }
    }
    return out;
}
