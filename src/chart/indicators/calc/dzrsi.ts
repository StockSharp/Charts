// Dynamic Zones RSI (Algo.Indicators/DynamicZonesRSI.cs).
// Single-output: a remapped RSI based on dynamic over-sold/over-bought
// zones derived from a trailing min/max of the RSI itself.
//
// Algorithm per .cs:
//   rsi = RSI(close, length)
//   if RSI is formed:
//       push rsi into a trailing buffer of `length` capacity
//       min = buffer.Min  ;  max = buffer.Max
//       if buffer is full (outer indicator formed):
//           dynamicOS  = min + (max-min) * OversoldLevel   / 100
//           dynamicOB  = min + (max-min) * OverboughtLevel / 100
//           if rsi <= dynamicOS    →  out = 0
//           else if rsi >= dynamicOB  →  out = 100
//           else                   →  out = (rsi - dynamicOS) /
//                                          (dynamicOB - dynamicOS) * 100
//
// Warm-up stacks: RSI needs `length` deltas (first valid at bar index
// `length`), then we need `length` RSI samples to fill the dynamic-zones
// buffer. So first DZRSI value lands at bar index `2*length - 1`.
//
// Deviations vs .cs:
//   * .cs uses a CircularBuffer with O(1) min/max via cached stats. We
//     scan the buffer on every push — acceptable for a chart-side
//     calculator on `length`-bar windows.
//   * .cs's NumValuesToInitialize is `RSI + base.NumValuesToInitialize-1`;
//     `base.NumValuesToInitialize = Length`, RSI's is `Length+1`, so total
//     warmup = `2*Length`. We emit the first non-null at index
//     `2*Length - 1` (i.e. when both the RSI is formed AND the dynamic
//     buffer is full), which matches "NumValuesToInitialize"-th bar 1-based.

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
 * RSI on close[] producing aligned series (length nulls then values).
 * @param {(number|null|undefined)[]} closes
 * @param {number} length
 * @returns {(number|null)[]}
 */
function rsiSeries(closes, length) {
    const n = closes.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = null;
    if (n <= length || length <= 0) return out;

    let gainSum = 0;
    let lossSum = 0;
    let seedOk = true;
    for (let i = 1; i <= length; i++) {
        const a = closes[i - 1];
        const b = closes[i];
        if (typeof a !== 'number' || !Number.isFinite(a) ||
            typeof b !== 'number' || !Number.isFinite(b)) { seedOk = false; break; }
        const d = b - a;
        if (d > 0) gainSum += d;
        else lossSum += -d;
    }
    if (!seedOk) return out;
    let avgGain = gainSum / length;
    let avgLoss = lossSum / length;
    out[length] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    for (let i = length + 1; i < n; i++) {
        const a = closes[i - 1];
        const b = closes[i];
        if (typeof a !== 'number' || !Number.isFinite(a) ||
            typeof b !== 'number' || !Number.isFinite(b)) { out[i] = null; continue; }
        const d = b - a;
        const g = d > 0 ? d : 0;
        const l = d < 0 ? -d : 0;
        avgGain = (avgGain * (length - 1) + g) / length;
        avgLoss = (avgLoss * (length - 1) + l) / length;
        out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }
    return out;
}

/**
 * @param {CandlePoint[]} candles
 * @param {{length?: number, oversoldLevel?: number, overboughtLevel?: number}} [params]
 * @returns {IndicatorPoint[]}
 */
export function calcDZRSI(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 14;
    const oversold = params && Number.isFinite(params.oversoldLevel) ? +params.oversoldLevel : 20;
    const overbought = params && Number.isFinite(params.overboughtLevel) ? +params.overboughtLevel : 80;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };
    if (length <= 0) return out;

    const closes = new Array(n);
    for (let i = 0; i < n; i++) closes[i] = candles[i] && candles[i].close;

    const rsi = rsiSeries(closes, length);

    // Trailing buffer of last `length` RSI samples.
    const buf: number[] = [];
    for (let i = 0; i < n; i++) {
        const r = rsi[i];
        if (r === null) continue;
        buf.push(r);
        if (buf.length > length) buf.shift();
        if (buf.length < length) continue;

        // Recompute min/max — buffer size = length, cheap enough.
        let min = +Infinity;
        let max = -Infinity;
        for (let k = 0; k < buf.length; k++) {
            const v = buf[k];
            if (v < min) min = v;
            if (v > max) max = v;
        }

        const range = max - min;
        const dynOS = min + range * oversold / 100;
        const dynOB = min + range * overbought / 100;

        let v;
        if (r <= dynOS) v = 0;
        else if (r >= dynOB) v = 100;
        else v = (r - dynOS) / (dynOB - dynOS) * 100;

        out[i] = { time: candles[i].time, value: v };
    }
    return out;
}
