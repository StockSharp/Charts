// Constance Brown Composite Index (CBCI).
// Port of StockSharp Algo.Indicators ConstanceBrownCompositeIndex.cs:
//
//   rsi         = RSI(close, RsiLength)              // default 14
//   shortRsi    = RSI(close, ShortRsiLength)         // default 3
//   rsiRoc      = ROC(rsi, RocLength)                // default 9
//   rsiMomentum = SMA(shortRsi, MomentumLength)      // default 3
//
//   composite   = rsiRoc + rsiMomentum               // main line (CompositeIndexLine)
//   fastSma     = SMA(composite, FastSmaLength)      // default 13
//   slowSma     = SMA(composite, SlowSmaLength)      // default 33
//
// CRITICAL — StockSharp's RelativeStrengthIndex (SMMA-based) returns a value
// from bar 1 (its warm-up emits partial Buffer.Sum/Length averages, IsEmpty is
// false), so the ROC and SMA that consume the RSI are fed those PARTIAL RSI
// values from bar 1 — NOT only from the RSI's IsFormed bar. That is why the
// composite appears far earlier than a naive "RSI null until length" port would
// produce. The .cs Adds all three lines only inside the combined gate
//   _rsi.IsFormed && _shortRsi.IsFormed && _rsiRoc.IsFormed && _rsiMomentum.IsFormed
// so the composite (CompositeIndexLine, a pass-through, formed immediately) is
// emitted from the bar where the SLOWEST of those forms:
//   - rsi:         IsFormed at bar RsiLength                        (14)
//   - shortRsi:    IsFormed at bar ShortRsiLength                   (3)
//   - rsiRoc:      Momentum.CalcIsFormed = Buffer.Count > RocLength,
//                  fed from bar 1 → IsFormed at bar RocLength + 1    (10)
//   - rsiMomentum: SMA(3) fed from bar 1 → IsFormed at MomentumLength (3)
//   → combinedBar = max(14, 3, 10, 3) = 14
// FastSma/SlowSma are then fed the composite from combinedBar and their lines
// are gated on their own IsFormed (windowed SMA), landing at combinedBar+12 = 26
// and combinedBar+32 = 46.
//
// ROC math (Momentum base, Length=RocLength, capacity RocLength+1):
//   roc[i] = 100 * (rsi[i] - rsi[i-RocLength]) / rsi[i-RocLength].
//
// Output shape: { composite, fastSma, slowSma } — three IndicatorPoint[]
// aligned 1:1 with input candles.

import { simpleMA, smoothedMA, partialSeedSMA } from './helpers.js';

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
 * Partial-seed (SMMA-based) RSI matching StockSharp RelativeStrengthIndex.cs,
 * but WITHOUT the IsFormed gate — it returns the partial RSI from bar 1 (the
 * value the .cs actually feeds into the ROC/SMA consumers during warm-up).
 * @param {(number|null)[]} closes
 * @param {number} length
 * @returns {(number|null)[]}
 */
function partialRsi(closes, length) {
    const n = closes.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = null;
    if (length <= 0 || n < 2) return out;

    const gains = new Array(n - 1);
    const losses = new Array(n - 1);
    for (let i = 1; i < n; i++) {
        const prev = closes[i - 1];
        const curr = closes[i];
        if (typeof prev !== 'number' || !Number.isFinite(prev) ||
            typeof curr !== 'number' || !Number.isFinite(curr)) {
            gains[i - 1] = null;
            losses[i - 1] = null;
            continue;
        }
        const d = curr - prev;
        gains[i - 1] = d > 0 ? d : 0;
        losses[i - 1] = d < 0 ? -d : 0;
    }

    const avgG = smoothedMA(gains, length);
    const avgL = smoothedMA(losses, length);
    for (let k = 0; k < n - 1; k++) {
        const g = avgG[k];
        const l = avgL[k];
        if (g === null || l === null) continue;
        const sum = g + l;
        out[k + 1] = sum === 0 ? 50 : 100 * g / sum;
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

    // Partial-seed RSIs (fed to the ROC/SMA from bar 1, as the .cs does).
    const rsi = partialRsi(closes, rsiLength);
    const shortRsi = partialRsi(closes, shortRsiLength);

    // ROC(RocLength) of the RSI: 100 * (rsi[i] - rsi[i-RocLength]) / rsi[i-RocLength].
    const roc = new Array(n);
    for (let i = 0; i < n; i++) roc[i] = null;
    for (let i = rocLength; i < n; i++) {
        const cur = rsi[i];
        const old = rsi[i - rocLength];
        if (cur === null || old === null || old === 0) continue;
        roc[i] = (cur - old) / old * 100;
    }

    // Momentum = partial-seed SMA(MomentumLength) of the short RSI.
    const momentum = partialSeedSMA(shortRsi, momentumLength);

    // The composite (and the SMAs downstream) are Added only inside the combined
    // all-formed gate; the slowest inner is the RSI (bar RsiLength) for defaults.
    const combinedBar = Math.max(rsiLength, shortRsiLength, rocLength + 1, momentumLength);

    const compVals = new Array(n);
    for (let i = 0; i < n; i++) compVals[i] = NaN;
    for (let i = combinedBar; i < n; i++) {
        const r = roc[i];
        const m = momentum[i];
        if (r === null || m === null) continue;
        compVals[i] = r + m;
        composite[i] = { time: candles[i].time, value: compVals[i] };
    }

    // FastSma/SlowSma: windowed SMA of the composite (dumper gates them on their
    // own SimpleMovingAverage.IsFormed, i.e. the post-partial-seed windowed value).
    const fast = simpleMA(compVals, fastSmaLength);
    const slow = simpleMA(compVals, slowSmaLength);
    for (let i = 0; i < n; i++) {
        if (fast[i] !== null) fastSma[i] = { time: candles[i].time, value: fast[i] };
        if (slow[i] !== null) slowSma[i] = { time: candles[i].time, value: slow[i] };
    }

    return { composite, fastSma, slowSma };
}
