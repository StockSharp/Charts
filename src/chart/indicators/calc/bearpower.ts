// Bear Power (Alexander Elder).
// Port of StockSharp Algo.Indicators BearPower.cs — derives an EMA over
// close, then subtracts it from the candle low:
//   BearPower[i] = low[i] - EMA(close, length)[i]
// `length` default 13. EMA is seeded with SMA over the first `length` closes
// (same convention as ema.js / calcEMA). First (length-1) outputs are null.

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
export function calcBearPower(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 13;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    if (length <= 0 || n < length) return out;

    // EMA over close. Seed = SMA(first `length` closes), matches calcEMA.
    let seedSum = 0;
    let seedOk = true;
    for (let i = 0; i < length; i++) {
        const c = candles[i] && candles[i].close;
        if (typeof c !== 'number' || !Number.isFinite(c)) seedOk = false;
        else seedSum += c;
    }
    if (!seedOk) return out;

    const k = 2 / (length + 1);
    let ema = seedSum / length;

    const lowSeed = candles[length - 1] && candles[length - 1].low;
    if (typeof lowSeed === 'number' && Number.isFinite(lowSeed)) {
        out[length - 1] = { time: candles[length - 1].time, value: lowSeed - ema };
    }

    for (let i = length; i < n; i++) {
        const c = candles[i] && candles[i].close;
        const lo = candles[i] && candles[i].low;
        if (typeof c !== 'number' || !Number.isFinite(c)) {
            // Hold previous EMA, emit null for this bar.
            out[i] = { time: candles[i].time, value: null };
            continue;
        }
        ema = c * k + ema * (1 - k);
        if (typeof lo === 'number' && Number.isFinite(lo)) {
            out[i] = { time: candles[i].time, value: lo - ema };
        } else {
            out[i] = { time: candles[i].time, value: null };
        }
    }
    return out;
}
