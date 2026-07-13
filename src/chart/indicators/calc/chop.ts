// Choppiness Index (CHOP).
// Port of StockSharp Algo.Indicators ChoppinessIndex.cs.
//
// Per-bar quantities:
//   highLowRange = high - low
//   trueRange    = max(highLowRange, |high - prevClose|, |low - prevClose|)
//
// Rolling sums over a window of `Length` bars:
//   sumHLR = Σ highLowRange
//   sumTR  = Σ trueRange
//
// Output:
//   CI = 100 * log10(sumTR / sumHLR) / log10(Length)
//
// First non-null at index Length-1 (when the rolling window is full).
//
// IMPORTANT — the StockSharp .cs differs from the textbook Choppiness
// Index in two ways. The task brief gives the textbook formula:
//   100 * log10(Σ TR / (highest(high) - lowest(low))) / log10(length)
// i.e. denominator is the spread of the rolling [maxHigh, minLow]
// window. The .cs instead sums (high - low) bar-by-bar and divides
// sumTR by sumHLR. We follow the .cs verbatim so values match the
// desktop terminal — document this as the deviation.
//
// Second .cs quirk: `_prevClose` starts at 0, so the first bar's TR
// component becomes max(HLR, |H|, |L|) — for any reasonable positive
// price the second/third terms blow up TR on bar 0. This poisons the
// rolling sum until that bar slides out of the window at bar Length.
// We replicate the .cs behaviour rather than guard against it, again
// to match desktop output.

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
export function calcChoppinessIndex(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 14;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    if (length <= 0) return out;
    if (length === 1) return out; // log10(1) = 0 → division by zero, undefined

    const part = Math.log10(length);

    // Ring buffers for the rolling sums.
    const hlrBuf = new Array(length);
    const trBuf = new Array(length);
    let head = 0;
    let count = 0;
    let sumHLR = 0;
    let sumTR = 0;
    let prevClose = 0;

    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const h = c && c.high;
        const l = c && c.low;
        const cl = c && c.close;
        if (typeof h !== 'number' || !Number.isFinite(h) ||
            typeof l !== 'number' || !Number.isFinite(l) ||
            typeof cl !== 'number' || !Number.isFinite(cl)) {
            continue;
        }

        const hlr = h - l;
        const a = Math.abs(h - prevClose);
        const b = Math.abs(l - prevClose);
        const tr = Math.max(hlr, Math.max(a, b));

        // Drop the oldest entry if buffer is full.
        if (count === length) {
            sumHLR -= hlrBuf[head];
            sumTR -= trBuf[head];
        }
        hlrBuf[head] = hlr;
        trBuf[head] = tr;
        head = (head + 1) % length;
        sumHLR += hlr;
        sumTR += tr;
        if (count < length) count++;

        prevClose = cl;

        if (count === length && sumTR > 0 && sumHLR > 0) {
            const ratio = sumTR / sumHLR;
            if (ratio > 0) {
                out[i] = { time: c.time, value: 100 * Math.log10(ratio) / part };
            }
        }
    }

    return out;
}
