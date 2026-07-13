// Fibonacci Retracement.
// Port of StockSharp Algo.Indicators FibonacciRetracement.cs.
//   levels        = [0.236, 0.382, 0.5, 0.618, 0.786]    (fixed in .cs)
//   highestHigh   = max(high, length)
//   lowestLow     = min(low,  length)
//   levelValue[k] = lowestLow + (highestHigh - lowestLow) * levels[k]
// Default `length` is 20.
//
// .cs shape: the .cs class is a BaseComplexIndicator whose output is
// FibonacciRetracementValue with a `Levels: decimal?[]` array of five
// retracement prices (one per ratio). We mirror that shape with a
// fixed-key object:
//   { l236, l382, l500, l618, l786 }
// each pointing to an IndicatorPoint[] series of length === candles.length.
// We also expose `levels: number[]` (the literal ratios) so the renderer
// can label each line without re-deriving them. Adding new levels in the
// future is a single-line change here plus rolling renderer code.
//
// .cs deviation note: the .cs class internally uses `Highest`/`Lowest`
// helpers which include the *current* bar in their rolling window
// (PushBack-then-Max). We reproduce that exact semantics: the trailing
// window for bar `i` spans `[i-length+1 .. i]`, inclusive, so the first
// non-null output lands at index `length - 1` (matches CalcIsFormed
// returning true once both Highest and Lowest have `length` samples).

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
 * @typedef {{
 *   levels: number[],
 *   l236: IndicatorPoint[],
 *   l382: IndicatorPoint[],
 *   l500: IndicatorPoint[],
 *   l618: IndicatorPoint[],
 *   l786: IndicatorPoint[]
 * }} FibonacciRetracementSeries
 */

export const FIBO_LEVELS = [0.236, 0.382, 0.5, 0.618, 0.786];
export const FIBO_KEYS = ['l236', 'l382', 'l500', 'l618', 'l786'];

/**
 * @param {CandlePoint[]} candles
 * @param {{length?: number}} [params]
 * @returns {FibonacciRetracementSeries}
 */
export function calcFibonacciRetracement(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 20;

    const empty = { levels: FIBO_LEVELS.slice() };
    for (const k of FIBO_KEYS) empty[k] = [];
    if (!Array.isArray(candles) || candles.length === 0) return empty;

    const n = candles.length;
    /** @type {FibonacciRetracementSeries} */
    const out = { levels: FIBO_LEVELS.slice() };
    for (const k of FIBO_KEYS) {
        const a = new Array(n);
        for (let i = 0; i < n; i++) a[i] = { time: candles[i].time, value: null };
        out[k] = a;
    }

    if (length <= 0) return out;

    for (let i = length - 1; i < n; i++) {
        let hi = -Infinity;
        let lo = +Infinity;
        let bad = false;
        for (let j = i - length + 1; j <= i; j++) {
            const c = candles[j];
            const h = c && c.high;
            const l = c && c.low;
            if (typeof h !== 'number' || !Number.isFinite(h) ||
                typeof l !== 'number' || !Number.isFinite(l)) {
                bad = true;
                break;
            }
            if (h > hi) hi = h;
            if (l < lo) lo = l;
        }
        if (bad) continue;

        const range = hi - lo;
        for (let k = 0; k < FIBO_LEVELS.length; k++) {
            out[FIBO_KEYS[k]][i] = { time: candles[i].time, value: lo + range * FIBO_LEVELS[k] };
        }
    }
    return out;
}
