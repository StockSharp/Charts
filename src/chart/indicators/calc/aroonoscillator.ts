// Aroon Oscillator — single line in the [-100, +100] range:
//   aroonOscillator[i] = aroonUp[i] - aroonDown[i]
// Same warm-up rule as Aroon (output is null until index `length-1`).
// Implementation duplicates the bars-since-high/low scan rather than
// allocating a full Aroon result; cheaper for big candle arrays.

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
export function calcAroonOscillator(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 14;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };
    if (length <= 0) return out;

    // Mirror AroonOscillator.cs which uses an internal Aroon{Up,Down} pair,
    // reusing the same eviction-rescan idiosyncrasy: `*_ValueAge = i`
    // assigns a buffer index treated as a bars-ago count.
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

        if (h >= maxValue) { maxValue = h; maxValueAge = 0; }
        else { maxValueAge++; }
        if (l <= minValue) { minValue = l; minValueAge = 0; }
        else { minValueAge++; }

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
            const up = 100 * (length - maxValueAge) / length;
            const down = 100 * (length - minValueAge) / length;
            out[i] = { time: candles[i].time, value: up - down };
        }
    }
    return out;
}
