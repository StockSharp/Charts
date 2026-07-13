// DeMarker indicator (Algo.Indicators/DeMarker.cs).
// Single-output oscillator bounded in [0, 1].
//
// Per-bar logic (after the 1-bar init):
//   deMax[i] = high[i] > prevHigh ? high[i] - prevHigh : 0
//   deMin[i] = low[i]  < prevLow  ? prevLow - low[i]   : 0
//   prevHigh, prevLow ← high[i], low[i]
//
//   deMaxSma = SMA(deMax, length)
//   deMinSma = SMA(deMin, length)
//   DeMarker = (deMaxSma + deMinSma) != 0
//              ? deMaxSma / (deMaxSma + deMinSma)
//              : 0.5
//
// Warm-up matches .cs:
//   * Bar 0: cached as `_prevHigh/_prevLow`; output null.
//   * Bars 1..length: produce deMax/deMin samples but SMAs not yet formed
//     (need `length` samples); output null.
//   * Bar `length`: first formed DeMarker.
//
// NumValuesToInitialize in .cs is base+1 — matches "first valid at bar
// index `length`" since the SMA needs `length` deMax samples and they
// start at bar 1.

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
export function calcDeMarker(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 14;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };
    if (length <= 0) return out;

    // Build deMax / deMin streams aligned with input candles. Index 0 has
    // no previous bar — mirror .cs's _isInitialized gating: emit no
    // contribution at i=0, then for i >= 1 we have deMax[i]/deMin[i].
    const deMax = new Array(n);
    const deMin = new Array(n);
    for (let i = 0; i < n; i++) { deMax[i] = null; deMin[i] = null; }

    // Walk bar-by-bar exactly like the .cs: SMAs only see samples starting
    // at i=1, so SMA forms when we've fed it `length` samples ⇒ bar
    // index 1 + (length-1) = length.
    let prevHigh: number | null = null;
    let prevLow: number | null = null;
    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const h = c && c.high;
        const l = c && c.low;
        if (typeof h !== 'number' || !Number.isFinite(h) ||
            typeof l !== 'number' || !Number.isFinite(l)) {
            // Don't update prev — wait for a clean bar to re-anchor.
            continue;
        }
        if (prevHigh === null || prevLow === null) {
            prevHigh = h;
            prevLow = l;
            continue;
        }
        deMax[i] = h > prevHigh ? h - prevHigh : 0;
        deMin[i] = l < prevLow ? prevLow - l : 0;
        prevHigh = h;
        prevLow = l;
    }

    // SMAs of length `length` over the deMax / deMin samples — but only the
    // *non-null* slots count, since bar 0 contributes nothing per .cs.
    // We use a windowed sum over candle indices; null entries reset the
    // sum (matches "_deMaxSma.Process" being called only on real samples).
    // Since deMax/deMin are null only on the very first bar (and on
    // unparseable bars), this works the same as feeding them sequentially.
    let maxSum = 0;
    let minSum = 0;
    let validCount = 0;
    // Track which sample-indices are currently inside the window so we can
    // properly evict the oldest. We index into the non-null sample stream.
    const validIdx: number[] = [];
    for (let i = 0; i < n; i++) {
        if (deMax[i] === null || deMin[i] === null) continue;
        maxSum += deMax[i];
        minSum += deMin[i];
        validIdx.push(i);
        if (validIdx.length > length) {
            const drop = validIdx.shift()!;
            maxSum -= deMax[drop];
            minSum -= deMin[drop];
        }
        validCount++;
        if (validCount < length) continue;
        const a = maxSum / length;
        const b = minSum / length;
        const denom = a + b;
        const v = denom !== 0 ? a / denom : 0.5;
        out[i] = { time: candles[i].time, value: v };
    }

    return out;
}
