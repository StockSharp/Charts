// Bull Power (Alexander Elder).
// Port of StockSharp Algo.Indicators BullPower.cs — symmetric to BearPower:
//   BullPower[i] = high[i] - EMA(close, length)[i]
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
export function calcBullPower(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 13;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    if (length <= 0 || n < length) return out;

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

    const hiSeed = candles[length - 1] && candles[length - 1].high;
    if (typeof hiSeed === 'number' && Number.isFinite(hiSeed)) {
        out[length - 1] = { time: candles[length - 1].time, value: hiSeed - ema };
    }

    for (let i = length; i < n; i++) {
        const c = candles[i] && candles[i].close;
        const hi = candles[i] && candles[i].high;
        if (typeof c !== 'number' || !Number.isFinite(c)) {
            out[i] = { time: candles[i].time, value: null };
            continue;
        }
        ema = c * k + ema * (1 - k);
        if (typeof hi === 'number' && Number.isFinite(hi)) {
            out[i] = { time: candles[i].time, value: hi - ema };
        } else {
            out[i] = { time: candles[i].time, value: null };
        }
    }
    return out;
}
