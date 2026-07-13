// Know Sure Thing — KST (Algo.Indicators/KnowSureThing.cs).
// Composite momentum indicator combining four Rate-of-Change inputs,
// each smoothed by its own SMA, then weighted-summed into the KST line,
// which is itself smoothed into a signal line.
//
// Defaults (from .cs):
//   ROC1.Length = 10  → smoothed by SMA1.Length = 10  → weight 1
//   ROC2.Length = 15  → smoothed by SMA2.Length = 10  → weight 2
//   ROC3.Length = 20  → smoothed by SMA3.Length = 10  → weight 3
//   ROC4.Length = 30  → smoothed by SMA4.Length = 15  → weight 4
//   Signal.Length = 9 (SMA of KST)
//
// KST[i] = SMA1[i] + 2 * SMA2[i] + 3 * SMA3[i] + 4 * SMA4[i]
// Signal[i] = SMA(KST, 9)[i]
//
// Outputs aligned 1:1 with input candles:
//   kst    : { time, value } — null during any inner indicator's warm-up.
//   signal : { time, value } — null until 9 KST samples are formed.
//
// Notes / deviations vs .cs:
//   * Rate-of-Change: `Momentum.cs / RateOfChange.cs` produces its first
//     non-null at index = Length (i.e. requires Length+1 samples — that's
//     `Buffer.Count > Length` in the .cs). We follow that.
//   * The .cs only feeds SMAi with ROC values once `Roc4.IsFormed` (i.e.
//     once all four ROCs are formed). We replicate by gating SMAi inputs
//     on Roc4 having produced a non-null at that index. Since ROCi feed
//     starts at index = Length_i, and SMAs are SMA(ROCi, smaLen_i), the
//     first KST output lands at index =
//         max(ROC4Len + SMA4Len, ROC3Len + SMA3Len,
//             ROC2Len + SMA2Len, ROC1Len + SMA1Len) - 1
//     For defaults: max(30+15, 20+10, 15+10, 10+10) - 1 = 45 - 1 = 44.
//   * Signal SMA further pushes the first signal output to index 44+8 = 52.
//
// (.cs NumValuesToInitialize = Roc4.NV + Sma4.NV + Signal.NV - 2 =
//  31 + 15 + 9 - 2 = 53; that's roughly index 52 from zero, matching.)

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
 * @typedef {{kst: IndicatorPoint[], signal: IndicatorPoint[]}} KSTSeries
 */

/**
 * Rate of Change: `(x[i] - x[i-length]) / x[i-length] * 100`.
 * First `length` entries are null (mirrors RateOfChange.cs warm-up).
 * @param {(number|null)[]} values
 * @param {number} length
 * @returns {(number|null)[]}
 */
function rocArray(values, length) {
    const n = values.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = null;
    if (length <= 0) return out;
    for (let i = length; i < n; i++) {
        const a = values[i];
        const b = values[i - length];
        if (typeof a !== 'number' || !Number.isFinite(a) ||
            typeof b !== 'number' || !Number.isFinite(b) || b === 0) continue;
        out[i] = (a - b) / b * 100;
    }
    return out;
}

/**
 * @param {CandlePoint[]} candles
 * @param {{
 *   roc1Length?: number, roc2Length?: number, roc3Length?: number, roc4Length?: number,
 *   sma1Length?: number, sma2Length?: number, sma3Length?: number, sma4Length?: number,
 *   signalLength?: number
 * }} [params]
 * @returns {KSTSeries}
 */
export function calcKST(candles, params) {
    const roc1Len = params && Number.isFinite(params.roc1Length) ? (params.roc1Length | 0) : 10;
    const roc2Len = params && Number.isFinite(params.roc2Length) ? (params.roc2Length | 0) : 15;
    const roc3Len = params && Number.isFinite(params.roc3Length) ? (params.roc3Length | 0) : 20;
    const roc4Len = params && Number.isFinite(params.roc4Length) ? (params.roc4Length | 0) : 30;
    const sma1Len = params && Number.isFinite(params.sma1Length) ? (params.sma1Length | 0) : 10;
    const sma2Len = params && Number.isFinite(params.sma2Length) ? (params.sma2Length | 0) : 10;
    const sma3Len = params && Number.isFinite(params.sma3Length) ? (params.sma3Length | 0) : 10;
    const sma4Len = params && Number.isFinite(params.sma4Length) ? (params.sma4Length | 0) : 15;
    const signalLen = params && Number.isFinite(params.signalLength) ? (params.signalLength | 0) : 9;

    if (!Array.isArray(candles) || candles.length === 0) return { kst: [], signal: [] };

    const n = candles.length;
    const closes = new Array(n);
    for (let i = 0; i < n; i++) closes[i] = candles[i] && candles[i].close;

    const roc1 = rocArray(closes, roc1Len);
    const roc2 = rocArray(closes, roc2Len);
    const roc3 = rocArray(closes, roc3Len);
    const roc4 = rocArray(closes, roc4Len);

    const sma1 = simpleMA(roc1, sma1Len);
    const sma2 = simpleMA(roc2, sma2Len);
    const sma3 = simpleMA(roc3, sma3Len);
    const sma4 = simpleMA(roc4, sma4Len);

    const kst = new Array(n);
    const kstValues = new Array(n);
    for (let i = 0; i < n; i++) {
        const a = sma1[i];
        const b = sma2[i];
        const c = sma3[i];
        const d = sma4[i];
        if (a === null || a === undefined || b === null || b === undefined ||
            c === null || c === undefined || d === null || d === undefined) {
            kst[i] = { time: candles[i].time, value: null };
            kstValues[i] = null;
            continue;
        }
        const v = a + 2 * b + 3 * c + 4 * d;
        kst[i] = { time: candles[i].time, value: v };
        kstValues[i] = v;
    }

    // Signal SMA — only feed it formed KST values (mirrors .cs Signal.Process
    // call which only runs when Sma4.IsFormed). A null gap mid-stream
    // shouldn't reset SMA state.
    const dense: number[] = [];
    const denseIdx: number[] = [];
    for (let i = 0; i < n; i++) {
        if (kstValues[i] !== null) {
            dense.push(kstValues[i]);
            denseIdx.push(i);
        }
    }
    const sigDense = simpleMA(dense, signalLen);
    const signal = new Array(n);
    for (let i = 0; i < n; i++) signal[i] = { time: candles[i].time, value: null };
    for (let k = 0; k < denseIdx.length; k++) {
        const i = denseIdx[k];
        if (sigDense[k] !== null && sigDense[k] !== undefined) {
            signal[i] = { time: candles[i].time, value: sigDense[k] };
        }
    }

    return { kst, signal };
}
