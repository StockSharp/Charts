// Double Exponential Moving Average (Patrick Mulloy, 1994).
// Port of StockSharp Algo.Indicators DoubleExponentialMovingAverage.cs:
//   ema1 = EMA(close, length)
//   ema2 = EMA(ema1,  length)   // EMA-of-EMA, only fed once ema1 has formed
//   DEMA = 2 * ema1 - ema2
//
// Warm-up matches the StockSharp cascade exactly:
//   * ema1 needs `length` closes → seeds at index (length-1).
//   * ema2 only starts receiving samples once ema1 has formed and needs
//     `length` more samples → seeds at index (length-1) + (length-1)
//     = 2*(length-1). So first non-null DEMA lands at index 2*(length-1).
// Matches DoubleExponentialMovingAverage.NumValuesToInitialize, which is
// `_ema1.NumValuesToInitialize + _ema2.NumValuesToInitialize - 1`
// (= length + length - 1 = 2*length - 1, i.e. index 2*length-2).

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
export function calcDEMA(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 32;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    if (length <= 0) return out;

    const k = 2 / (length + 1);

    // First EMA over closes: seed with SMA over the first `length` closes.
    let seedSum = 0;
    let seedOk = true;
    for (let i = 0; i < length && i < n; i++) {
        const c = candles[i] && candles[i].close;
        if (typeof c !== 'number' || !Number.isFinite(c)) seedOk = false;
        else seedSum += c;
    }
    if (!seedOk || n < length) return out;

    const ema1 = new Array(n);
    for (let i = 0; i < length - 1; i++) ema1[i] = null;
    let prev1 = seedSum / length;
    ema1[length - 1] = prev1;
    for (let i = length; i < n; i++) {
        const c = candles[i] && candles[i].close;
        if (typeof c !== 'number' || !Number.isFinite(c)) {
            ema1[i] = null;
            continue;
        }
        prev1 = c * k + prev1 * (1 - k);
        ema1[i] = prev1;
    }

    // Second EMA over ema1 values — only counts samples once ema1 has formed.
    // Seed: SMA over the first `length` non-null ema1 samples.
    let seed2Sum = 0;
    let seed2Count = 0;
    let prev2 = 0;
    let seed2Done = false;
    for (let i = 0; i < n; i++) {
        const a = ema1[i];
        if (a === null) continue;
        if (!seed2Done) {
            seed2Sum += a;
            seed2Count++;
            if (seed2Count === length) {
                prev2 = seed2Sum / length;
                seed2Done = true;
                // DEMA emit at this bar
                out[i] = { time: candles[i].time, value: 2 * a - prev2 };
            }
            continue;
        }
        prev2 = a * k + prev2 * (1 - k);
        out[i] = { time: candles[i].time, value: 2 * a - prev2 };
    }

    return out;
}
