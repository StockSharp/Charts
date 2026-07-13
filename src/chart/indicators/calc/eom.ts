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
    const buf = new Array(length);
    let bufHead = 0; // next slot to overwrite
    let bufCount = 0;
    let bufSum = 0;

    for (let i = 1; i < n; i++) {
        const c = candles[i];
        const p = candles[i - 1];
        const h = c && c.high;
        const l = c && c.low;
        const ph = p && p.high;
        const pl = p && p.low;
        const v = c && c.volume;
        if (typeof h !== 'number' || !Number.isFinite(h) ||
            typeof l !== 'number' || !Number.isFinite(l) ||
            typeof ph !== 'number' || !Number.isFinite(ph) ||
            typeof pl !== 'number' || !Number.isFinite(pl) ||
            typeof v !== 'number' || !Number.isFinite(v)) {
            continue; // skip; don't push, don't emit
        }
        const range = h - l;
        if (range === 0 || v === 0) continue; // gap branch: no push, no emit

        const midMove = (h + l) / 2 - (ph + pl) / 2;
        // emvRaw = midMove / boxRatio = midMove * range / volume
        const emv = midMove * range / v;

        // Push to circular buffer (evict the oldest when full).
        if (bufCount < length) {
            buf[bufHead] = emv;
            bufHead = (bufHead + 1) % length;
            bufCount++;
            bufSum += emv;
        } else {
            bufSum -= buf[bufHead];
            buf[bufHead] = emv;
            bufHead = (bufHead + 1) % length;
            bufSum += emv;
        }

        // Emit only once Buffer.Count >= Length (mirrors .cs IsFormed gate).
        if (bufCount >= length) {
            out[i] = { time: c.time, value: bufSum / length };
        }
    }
    return out;
}
