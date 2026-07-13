// Aroon indicator (Tushar Chande).
//   aroonUp[i]   = 100 * (length - barsSinceHighestHigh) / length
//   aroonDown[i] = 100 * (length - barsSinceLowestLow)   / length
// `barsSinceHighestHigh` counts how many bars ago (within the trailing
// window of `length` bars, inclusive of the current bar) the highest
// high occurred; 0 means "today is the highest". Same for the low.
// StockSharp's Aroon uses a buffer of capacity `Length` and forms when
// the buffer fills (Buffer.Count >= Length) — so warm-up: outputs are
// null until index `length-1` (first formed at the (length)-th bar).

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
 * @typedef {{up: IndicatorPoint[], down: IndicatorPoint[]}} AroonSeries
 */

/**
 * @param {CandlePoint[]} candles
 * @param {{length?: number}} [params]
 * @returns {AroonSeries}
 */
export function calcAroon(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 14;

    if (!Array.isArray(candles) || candles.length === 0) {
        return { up: [], down: [] };
    }

    const n = candles.length;
    const up = new Array(n);
    const down = new Array(n);
    for (let i = 0; i < n; i++) {
        up[i] = { time: candles[i].time, value: null };
        down[i] = { time: candles[i].time, value: null };
    }
    if (length <= 0) return { up, down };

    // Replicate StockSharp's incremental Aroon algorithm exactly so that
    // the (admittedly idiosyncratic) eviction-rescan path produces the
    // same `_maxValueAge` / `_minValueAge` values the .cs writes to the
    // expected file. On eviction of the bar holding the current extreme,
    // the .cs rescans the remaining buffer and assigns `*_ValueAge = i`
    // (the buffer index in the OLD buffer state, NOT the bars-ago age).
    // We mirror that quirk verbatim — see Aroon.cs / AroonUp / AroonDown.
    const bufH: number[] = [];
    const bufL: number[] = [];
    let maxValue = -Infinity;
    let maxValueAge = 0;
    let minValue = +Infinity;
    let minValueAge = 0;

    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const h = c && c.high;
        const l = c && c.low;
        if (typeof h !== 'number' || !Number.isFinite(h) ||
            typeof l !== 'number' || !Number.isFinite(l)) {
            continue;
        }

        // Age step (mirrors AroonUp/AroonDown's pre-PushBack branch).
        if (h >= maxValue) { maxValue = h; maxValueAge = 0; }
        else { maxValueAge++; }
        if (l <= minValue) { minValue = l; minValueAge = 0; }
        else { minValueAge++; }

        // Eviction-rescan step — only fires when the buffer is full.
        if (bufH.length === length) {
            if (bufH[0] === maxValue) {
                maxValue = h;
                maxValueAge = 0;
                for (let k = 1; k < length; k++) {
                    if (bufH[k] > maxValue) { maxValue = bufH[k]; maxValueAge = k; }
                }
            }
            if (bufL[0] === minValue) {
                minValue = l;
                minValueAge = 0;
                for (let k = 1; k < length; k++) {
                    if (bufL[k] < minValue) { minValue = bufL[k]; minValueAge = k; }
                }
            }
        }

        bufH.push(h);
        bufL.push(l);
        if (bufH.length > length) bufH.shift();
        if (bufL.length > length) bufL.shift();

        if (bufH.length === length) {
            up[i] = { time: c.time, value: 100 * (length - maxValueAge) / length };
            down[i] = { time: c.time, value: 100 * (length - minValueAge) / length };
        }
    }
    return { up, down };
}
