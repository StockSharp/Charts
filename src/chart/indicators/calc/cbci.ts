// Constance Brown Composite Index (CBCI).
// Port of StockSharp Algo.Indicators ConstanceBrownCompositeIndex.cs:
//
//   rsi         = RSI(close, RsiLength)              // default 14
//   shortRsi    = RSI(close, ShortRsiLength)         // default 3
//   rsiRoc      = ROC(rsi, RocLength)                // default 9
//   rsiMomentum = SMA(shortRsi, MomentumLength)      // default 3
//
//   composite   = rsiRoc + rsiMomentum               // main line
//   fastSma     = SMA(composite, FastSmaLength)      // default 13
//   slowSma     = SMA(composite, SlowSmaLength)      // default 33
//
// Warm-up cascade (with defaults):
//   - rsi:         first non-null at index 14
//   - shortRsi:    first non-null at index 3
//   - rsiRoc:      needs rsi at i and i-9 → first non-null at 14+9 = 23
//   - rsiMomentum: needs shortRsi at i-2..i → first non-null at 3+2 = 5
//   - composite:   max(23, 5) = 23
//   - fastSma:     23 + 12 = 35
//   - slowSma:     23 + 32 = 55
//
// Output shape: { composite, fastSma, slowSma } — three IndicatorPoint[]
// aligned 1:1 with input candles. fastSma/slowSma stay null until their
// own warm-ups inside the composite series clear.
//
// .cs deviation: the .cs framework feeds the ROC/SMA inner indicators
// even during RSI warm-up (with empty values that decode to 0). That's
// an artefact of `BaseIndicator` lifecycle, not part of the formula —
// the actual gate `_rsi.IsFormed && _shortRsi.IsFormed && _rsiRoc.IsFormed
// && _rsiMomentum.IsFormed` combined with ROC's `Buffer[0] != 0` guard
// means the first meaningful composite lands at bar 14+9 = 23 anyway.
// Our JS port computes the same numeric output but skips the no-op
// "feed-0-during-warmup" cycles entirely.

import { simpleMA } from './helpers.js';

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
 * @typedef {{composite: IndicatorPoint[], fastSma: IndicatorPoint[], slowSma: IndicatorPoint[]}} CBCISeries
 */

/**
 * Wilder-RSI over a numeric closes array (returns (number|null)[]).
 * Matches calc/rsi.js seeding: SMA of first `length` deltas (lands at
 * index = length), then Wilder smoothing.
 * @param {(number|null)[]} closes
 * @param {number} length
 * @returns {(number|null)[]}
 */
function wilderRsi(closes, length) {
    const n = closes.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = null;
    if (length <= 0 || n <= length) return out;

    let gainSum = 0;
    let lossSum = 0;
    let seedOk = true;
    for (let i = 1; i <= length; i++) {
        const prev = closes[i - 1];
        const curr = closes[i];
        if (prev === null || curr === null) { seedOk = false; break; }
        const d = curr - prev;
        if (d > 0) gainSum += d;
        else lossSum += -d;
    }
    if (!seedOk) return out;

    let avgG = gainSum / length;
    let avgL = lossSum / length;
    out[length] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);

    for (let i = length + 1; i < n; i++) {
        const prev = closes[i - 1];
        const curr = closes[i];
        if (prev === null || curr === null) { out[i] = null; continue; }
        const d = curr - prev;
        const g = d > 0 ? d : 0;
        const l = d < 0 ? -d : 0;
        avgG = (avgG * (length - 1) + g) / length;
        avgL = (avgL * (length - 1) + l) / length;
        out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
    }
    return out;
}

/**
 * @param {CandlePoint[]} candles
 * @param {{rsiLength?: number, rocLength?: number, shortRsiLength?: number, momentumLength?: number, fastSmaLength?: number, slowSmaLength?: number}} [params]
 * @returns {CBCISeries}
 */
export function calcConstanceBrownCompositeIndex(candles, params) {
    const rsiLength = params && Number.isFinite(params.rsiLength) ? (params.rsiLength | 0) : 14;
    const rocLength = params && Number.isFinite(params.rocLength) ? (params.rocLength | 0) : 9;
    const shortRsiLength = params && Number.isFinite(params.shortRsiLength) ? (params.shortRsiLength | 0) : 3;
    const momentumLength = params && Number.isFinite(params.momentumLength) ? (params.momentumLength | 0) : 3;
    const fastSmaLength = params && Number.isFinite(params.fastSmaLength) ? (params.fastSmaLength | 0) : 13;
    const slowSmaLength = params && Number.isFinite(params.slowSmaLength) ? (params.slowSmaLength | 0) : 33;

    if (!Array.isArray(candles) || candles.length === 0) {
        return { composite: [], fastSma: [], slowSma: [] };
    }

    const n = candles.length;
    const composite = new Array(n);
    const fastSma = new Array(n);
    const slowSma = new Array(n);
    for (let i = 0; i < n; i++) {
        composite[i] = { time: candles[i].time, value: null };
        fastSma[i] = { time: candles[i].time, value: null };
        slowSma[i] = { time: candles[i].time, value: null };
    }

    if (rsiLength <= 0 || rocLength <= 0 || shortRsiLength <= 0 ||
        momentumLength <= 0 || fastSmaLength <= 0 || slowSmaLength <= 0) {
        return { composite, fastSma, slowSma };
    }

    const closes = new Array(n);
    for (let i = 0; i < n; i++) {
        const c = candles[i] && candles[i].close;
        closes[i] = typeof c === 'number' && Number.isFinite(c) ? c : null;
    }

    const rsi = wilderRsi(closes, rsiLength);
    const shortRsi = wilderRsi(closes, shortRsiLength);

    // ROC of RSI: (rsi[i] - rsi[i-rocLength]) / rsi[i-rocLength] * 100.
    const roc = new Array(n);
    for (let i = 0; i < n; i++) roc[i] = null;
    for (let i = rocLength; i < n; i++) {
        const cur = rsi[i];
        const old = rsi[i - rocLength];
        if (cur === null || old === null || old === 0) continue;
        roc[i] = (cur - old) / old * 100;
    }

    // SMA of shortRsi with momentumLength.
    const momentum = simpleMA(shortRsi.map(v => v === null ? NaN : v), momentumLength);
    // simpleMA returns null for windows containing NaN — perfect for warm-up.

    // Composite line.
    const compVals = new Array(n);
    for (let i = 0; i < n; i++) compVals[i] = NaN;
    for (let i = 0; i < n; i++) {
        const r = roc[i];
        const m = momentum[i];
        if (r === null || m === null) continue;
        compVals[i] = r + m;
        composite[i] = { time: candles[i].time, value: compVals[i] };
    }

    // FastSma / SlowSma over the composite series.
    const fast = simpleMA(compVals, fastSmaLength);
    const slow = simpleMA(compVals, slowSmaLength);
    for (let i = 0; i < n; i++) {
        if (fast[i] !== null) fastSma[i] = { time: candles[i].time, value: fast[i] };
        if (slow[i] !== null) slowSma[i] = { time: candles[i].time, value: slow[i] };
    }

    return { composite, fastSma, slowSma };
}
