// Trix — Triple Exponential Average Oscillator (Jack Hutson, 1980s).
// Port of StockSharp Algo.Indicators Trix.cs:
//   ema1 = EMA(close, length)
//   ema2 = EMA(ema1,  length)
//   ema3 = EMA(ema2,  length)
//   roc  = RateOfChange(ema3, 1)     // (curr - prev) / prev * 100
//   Trix = 10 * roc                  // scaling factor from Trix.cs
//
// NOTE: this is the CASCADE form of triple-smoothed EMA, NOT the TEMA
// linear-combination formula (3*ema1 - 3*ema2 + ema3). Trix takes the
// rate-of-change of the *innermost* triple-smoothed EMA, while TEMA is a
// price-tracking moving average. Common confusion — keep them straight.
//
// Trix.cs ends with `return 10m * roc(...)`. RateOfChange (Length=1)
// computes `(curr - prev) / prev * 100`. So Trix's final scale is
// 10 * ((ema3[i] - ema3[i-1]) / ema3[i-1]) * 100 = 1000 * delta-ratio.
// Most reference (Wikipedia, other web charting platforms) definitions use 100 *, but StockSharp uses
// 10 * roc — we replicate that exact multiplier here so chart values
// match the desktop terminal.
//
// Warm-up: ema1 needs `length` closes (seeds at index length-1), ema2 then
// needs `length` ema1 values (index 2*length-2), ema3 another `length`
// (index 3*length-3). ROC needs one more sample after ema3 forms. So first
// non-null Trix lands at index 3*(length-1) + 1 = 3*length - 2.

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
 * EMA over a (number|null)[] series. Counts only finite samples until seed
 * is full; once seeded, returns null on any non-finite input. Returns
 * array of (number|null), same length as input.
 * @param {(number|null)[]} values
 * @param {number} length
 * @returns {(number|null)[]}
 */
function emaCascade(values, length) {
    const n = values.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = null;
    if (length <= 0) return out;
    const k = 2 / (length + 1);
    let seedSum = 0;
    let seedCount = 0;
    let seedDone = false;
    let prev = 0;
    for (let i = 0; i < n; i++) {
        const v = values[i];
        const ok = typeof v === 'number' && Number.isFinite(v);
        if (!seedDone) {
            if (!ok) continue;
            seedSum += v;
            seedCount++;
            if (seedCount === length) {
                prev = seedSum / length;
                out[i] = prev;
                seedDone = true;
            }
            continue;
        }
        if (!ok) continue;
        prev = v * k + prev * (1 - k);
        out[i] = prev;
    }
    return out;
}

/**
 * @param {CandlePoint[]} candles
 * @param {{length?: number}} [params]
 * @returns {IndicatorPoint[]}
 */
export function calcTrix(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 14;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };
    if (length <= 0) return out;

    const closes = new Array(n);
    for (let i = 0; i < n; i++) closes[i] = candles[i] && candles[i].close;

    const ema1 = emaCascade(closes, length);
    const ema2 = emaCascade(ema1, length);
    const ema3 = emaCascade(ema2, length);

    // Rate of change with Length=1, then * 10 (matches Trix.cs return).
    // Trix.cs delegates to RateOfChange : Momentum. With Length=1, the
    // Momentum buffer capacity is 2; after the first PushBack the buffer
    // holds the just-pushed value at index 0, so Momentum returns 0
    // (newValue - Buffer[0] where Buffer[0] == newValue). RateOfChange
    // then divides by Buffer[0]: if non-zero, ROC = 0; result Trix = 0.
    // So the first formed Trix value mirrors that and is 0.
    let prev = null;
    for (let i = 0; i < n; i++) {
        const v = ema3[i];
        if (v === null) {
            prev = null;
            continue;
        }
        if (prev === null) {
            // First formed bar: Trix.cs emits 10 * roc where roc=0 (see comment).
            if (v !== 0) {
                out[i] = { time: candles[i].time, value: 0 };
            }
            prev = v;
            continue;
        }
        if (prev === 0) {
            // ROC.cs guards against zero denominator and returns null.
            prev = v;
            continue;
        }
        const roc = (v - prev) / prev * 100;
        out[i] = { time: candles[i].time, value: 10 * roc };
        prev = v;
    }
    return out;
}
