// Triple Exponential Moving Average (Patrick Mulloy, 1994).
// Port of StockSharp Algo.Indicators TripleExponentialMovingAverage.cs:
//   ema1 = EMA(close, length)
//   ema2 = EMA(ema1,  length)   // only fed once ema1 has formed
//   ema3 = EMA(ema2,  length)   // only fed once ema2 has formed
//   TEMA = 3*ema1 - 3*ema2 + ema3
//
// Warm-up cascades just like DEMA: first non-null lands at index
// 3*(length-1). Matches NumValuesToInitialize =
// `_ema1 + _ema2 + _ema3 - 2` = 3*length - 2 (i.e. index 3*length-3).

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
export function calcTEMA(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 32;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    if (length <= 0 || n < length) return out;

    const k = 2 / (length + 1);

    // Stage 1: EMA over closes (seeded with SMA of first `length` closes).
    let seedSum = 0;
    let seedOk = true;
    for (let i = 0; i < length; i++) {
        const c = candles[i] && candles[i].close;
        if (typeof c !== 'number' || !Number.isFinite(c)) seedOk = false;
        else seedSum += c;
    }
    if (!seedOk) return out;

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

    // Stage 2: EMA over ema1 — counts samples only after ema1 has formed.
    const ema2 = new Array(n);
    for (let i = 0; i < n; i++) ema2[i] = null;
    let prev2 = 0;
    let seed2Sum = 0;
    let seed2Count = 0;
    let seed2Done = false;
    for (let i = 0; i < n; i++) {
        const a = ema1[i];
        if (a === null) continue;
        if (!seed2Done) {
            seed2Sum += a;
            seed2Count++;
            if (seed2Count === length) {
                prev2 = seed2Sum / length;
                ema2[i] = prev2;
                seed2Done = true;
            }
            continue;
        }
        prev2 = a * k + prev2 * (1 - k);
        ema2[i] = prev2;
    }

    // Stage 3: EMA over ema2 — counts samples only after ema2 has formed.
    let prev3 = 0;
    let seed3Sum = 0;
    let seed3Count = 0;
    let seed3Done = false;
    for (let i = 0; i < n; i++) {
        const b = ema2[i];
        if (b === null) continue;
        if (!seed3Done) {
            seed3Sum += b;
            seed3Count++;
            if (seed3Count === length) {
                prev3 = seed3Sum / length;
                seed3Done = true;
                out[i] = {
                    time: candles[i].time,
                    value: 3 * ema1[i] - 3 * b + prev3,
                };
            }
            continue;
        }
        prev3 = b * k + prev3 * (1 - k);
        out[i] = {
            time: candles[i].time,
            value: 3 * ema1[i] - 3 * b + prev3,
        };
    }

    return out;
}
