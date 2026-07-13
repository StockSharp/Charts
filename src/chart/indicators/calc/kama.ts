// Kaufman Adaptive Moving Average (Perry J. Kaufman).
// Port of StockSharp Algo.Indicators KaufmanAdaptiveMovingAverage.cs.
//
// Parameters:
//   length    — efficiency-ratio window (N), default 10.
//   fastSc    — fast EMA period for the smoothing constant, default 2.
//   slowSc    — slow EMA period for the smoothing constant, default 30.
//
// Algorithm (one bar at a time, after a `length+1` warm-up buffer is filled):
//   direction  = close[i] - close[i - length]
//   volatility = Σ_{k=1..length} |close[i-length+k] - close[i-length+k-1]|
//                (capped to a tiny positive epsilon so ER stays finite)
//   er         = |direction / volatility|
//   fastSC     = 2 / (fastSc + 1),  slowSC = 2 / (slowSc + 1)
//   ssc        = er * (fastSC - slowSC) + slowSC
//   smooth     = ssc * ssc
//   KAMA[i]    = (close[i] - KAMA[i-1]) * smooth + KAMA[i-1]
//
// Warm-up: in the .cs IsFormed flips when Buffer.Count > Length (i.e. after
// length+1 final values). The first KAMA output happens at index = `length`
// and equals close[length] (the indicator seeds itself with the current
// close). True KAMA recursion kicks in from index `length+1`. So indices
// 0..length-1 are null.

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
 * @param {{length?: number, fastSc?: number, slowSc?: number}} [params]
 * @returns {IndicatorPoint[]}
 */
export function calcKAMA(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 10;
    const fastSc = params && Number.isFinite(params.fastSc) ? (params.fastSc | 0) : 2;
    const slowSc = params && Number.isFinite(params.slowSc) ? (params.slowSc | 0) : 30;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    if (length <= 0 || fastSc < 1 || slowSc < 1) return out;
    if (n <= length) return out;

    const fastK = 2 / (fastSc + 1);
    const slowK = 2 / (slowSc + 1);

    // Validate all closes up to and including the seed index — any non-
    // finite value before then aborts the series (mirrors StockSharp's
    // requirement that the buffer be full of valid finals before IsFormed).
    for (let i = 0; i <= length; i++) {
        const c = candles[i] && candles[i].close;
        if (typeof c !== 'number' || !Number.isFinite(c)) return out;
    }

    // Seed at index `length`: KAMA = close[length].
    let prev = candles[length].close;
    out[length] = { time: candles[length].time, value: prev };

    for (let i = length + 1; i < n; i++) {
        const c = candles[i] && candles[i].close;
        if (typeof c !== 'number' || !Number.isFinite(c)) {
            out[i] = { time: candles[i].time, value: null };
            continue;
        }

        // Window: close[i-length .. i] — `length+1` samples.
        const oldest = candles[i - length] && candles[i - length].close;
        if (typeof oldest !== 'number' || !Number.isFinite(oldest)) {
            out[i] = { time: candles[i].time, value: null };
            continue;
        }

        const direction = c - oldest;
        let volatility = 0;
        let bad = false;
        for (let k = i - length + 1; k <= i; k++) {
            const a = candles[k] && candles[k].close;
            const b = candles[k - 1] && candles[k - 1].close;
            if (typeof a !== 'number' || !Number.isFinite(a) ||
                typeof b !== 'number' || !Number.isFinite(b)) {
                bad = true; break;
            }
            volatility += Math.abs(a - b);
        }
        if (bad) {
            out[i] = { time: candles[i].time, value: null };
            continue;
        }
        // Same epsilon the .cs uses to avoid divide-by-zero on a perfectly
        // flat window (close has not moved at all over `length` bars).
        if (volatility <= 0) volatility = 0.00001;

        const er = Math.abs(direction / volatility);
        const ssc = er * (fastK - slowK) + slowK;
        const smooth = ssc * ssc;

        prev = (c - prev) * smooth + prev;
        out[i] = { time: candles[i].time, value: prev };
    }

    return out;
}
