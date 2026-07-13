// Klinger Volume Oscillator — KVO (Algo.Indicators/KlingerVolumeOscillator.cs).
// Volume-based oscillator: takes signed volume (sign flips on a typical-price
// turnaround) and runs it through two EMAs of different periods, then
// returns short - long.
//
// Defaults (from .cs):
//   ShortPeriod = 34  (ExponentialMovingAverage)
//   LongPeriod  = 55
//
// Per-bar update:
//   hlc[i]  = (high[i] + low[i] + close[i]) / 3        // typical price
//   sv[i]   = volume[i] * (hlc[i] > hlc[i-1] ? +1 : -1)
//             // .cs treats hlc <= prev (including the first bar with prev=0)
//             // as -1. We mirror that exactly.
//   shortEma = EMA(sv, 34)
//   longEma  = EMA(sv, 55)
//   kvo      = shortEma - longEma                      // only once longEma formed
//
// Outputs aligned 1:1 with input candles:
//   shortEma  : { time, value } — null until short-EMA seeded.
//   longEma   : { time, value } — null until long-EMA seeded.
//   oscillator: { time, value } — null until longEma is formed (KVO emits
//                                 the difference only on `LongEma.IsFormed`).
//
// Notes / deviations vs .cs:
//   * The .cs feeds the EMAs via `Process(input, sv)` so the EMA's price
//     source is the synthetic sv stream, not the candle close. We do the
//     same — build the sv array first, then EMA it with SMA seed.
//   * .cs initial _prevHlc = 0; the very first candle compares hlc > 0 →
//     usually +1 for any real instrument. Reproduced as-is.

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
 * @typedef {{shortEma: IndicatorPoint[], longEma: IndicatorPoint[], oscillator: IndicatorPoint[]}} KVOSeries
 */

/**
 * EMA with SMA seed (length-1 nulls, then EMA recurrence). Inputs that
 * are null/NaN emit null but do not poison the running EMA after seed.
 * @param {(number|null)[]} values
 * @param {number} length
 * @returns {(number|null)[]}
 */
function emaArray(values, length) {
    const n = values.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = null;
    if (n === 0 || length <= 0) return out;
    const k = 2 / (length + 1);
    let seedSum = 0;
    let seedCount = 0;
    let prev = 0;
    let seeded = false;
    for (let i = 0; i < n; i++) {
        const v = values[i];
        const ok = typeof v === 'number' && Number.isFinite(v);
        if (!seeded) {
            if (!ok) { out[i] = null; continue; }
            seedSum += v;
            seedCount++;
            if (seedCount === length) {
                prev = seedSum / length;
                out[i] = prev;
                seeded = true;
            } else {
                out[i] = null;
            }
            continue;
        }
        if (!ok) { out[i] = null; continue; }
        prev = v * k + prev * (1 - k);
        out[i] = prev;
    }
    return out;
}

/**
 * @param {CandlePoint[]} candles
 * @param {{shortPeriod?: number, longPeriod?: number}} [params]
 * @returns {KVOSeries}
 */
export function calcKVO(candles, params) {
    const shortLen = params && Number.isFinite(params.shortPeriod) ? (params.shortPeriod | 0) : 34;
    const longLen  = params && Number.isFinite(params.longPeriod)  ? (params.longPeriod  | 0) : 55;
    if (!Array.isArray(candles) || candles.length === 0) {
        return { shortEma: [], longEma: [], oscillator: [] };
    }
    const n = candles.length;

    // Build the signed-volume stream.
    const sv = new Array(n);
    let prevHlc = 0;
    for (let i = 0; i < n; i++) {
        const c = candles[i] || {};
        const h = c.high, l = c.low, cl = c.close, v = c.volume;
        if (typeof h !== 'number' || !Number.isFinite(h) ||
            typeof l !== 'number' || !Number.isFinite(l) ||
            typeof cl !== 'number' || !Number.isFinite(cl) ||
            typeof v !== 'number' || !Number.isFinite(v)) {
            sv[i] = null;
            // Don't update prevHlc on a bad candle.
            continue;
        }
        const hlc = (h + l + cl) / 3;
        const sign = hlc > prevHlc ? 1 : -1;
        sv[i] = v * sign;
        prevHlc = hlc;
    }

    const shortE = emaArray(sv, shortLen);
    const longE = emaArray(sv, longLen);

    const shortEma = new Array(n);
    const longEma = new Array(n);
    const osc = new Array(n);
    for (let i = 0; i < n; i++) {
        shortEma[i] = { time: candles[i].time, value: shortE[i] };
        longEma[i] = { time: candles[i].time, value: longE[i] };
        if (shortE[i] !== null && longE[i] !== null) {
            osc[i] = { time: candles[i].time, value: shortE[i] - longE[i] };
        } else {
            osc[i] = { time: candles[i].time, value: null };
        }
    }
    return { shortEma, longEma, oscillator: osc };
}
