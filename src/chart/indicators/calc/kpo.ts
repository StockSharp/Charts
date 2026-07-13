// Kase Peak Oscillator (KPO).
// Port of StockSharp Algo.Indicators KasePeakOscillator.cs.
//
// Two outputs (`shortTerm`, `longTerm`):
//
//   Per bar i (once ATR is formed):
//     peak[i]   = candle.high
//     valley[i] = candle.low
//     if prevClose != 0:
//       if close[i] > prevClose:
//         peak   = max(high, prevClose + atr)
//         valley = max(low,  prevClose - 0.5 * atr)
//       elif close[i] < prevClose:
//         peak   = min(high, prevClose + 0.5 * atr)
//         valley = min(low,  prevClose - atr)
//     push peak  → peakBuffer  (capacity 2)
//     push valley → valleyBuffer (capacity 2)
//     prevClose  = close[i]
//
//     den1                  = max(peakBuffer) - min(valleyBuffer)        (2-bar local range)
//     den2                  = peakBuffer[0] - valleyBuffer[0]             (oldest peak/valley)
//     shortTermOscillator   = den1 != 0 ? 100 * (close - min(valleyBuffer)) / den1 : 0
//     longTermOscillator    = den2 != 0 ? 100 * (close - valleyBuffer[0]) / den2 : 0
//
// Defaults: shortPeriod=9, longPeriod=18 (.cs). These control when the
// inner DecimalLengthIndicator's buffer fills — they DO NOT affect the
// emitted numeric values (the OnProcessDecimal of the inner part is a
// pure pass-through). So we don't use them in this calc; we accept them
// for API parity and so future smoothing layers can be added without
// breaking the call signature.
//
// ATR length = 10 is HARDCODED in the .cs (not exposed as a parameter).
//
// .cs deviation notes:
// (a) ATR: we delegate to calcATR. Our calcATR's first non-null is at
//     bar `atrLength` (=10), whereas the .cs TrueRange seeds bar 0 with
//     (high-low), so its ATR is formed one bar earlier (bar 9). KPO output
//     here therefore lags the .cs by one bar at start-of-series. Steady-
//     state values match.
// (b) shortPeriod / longPeriod are inert (see note above). The .cs uses
//     them only to gate the BaseComplexIndicator.IsFormed property, which
//     itself only affects downstream "is this fully formed" semantics and
//     not the numeric output.
// (c) The .cs has a non-final intra-bar branch that uses peakBuffer.Min
//     widened by the unpushed valley, etc. We process only homogeneous
//     batches of closed bars, so we always take the IsFinal branch.

import { csATR } from './helpers.js';

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
 * @typedef {{shortTerm: IndicatorPoint[], longTerm: IndicatorPoint[]}} KasePeakOscillatorSeries
 */

/**
 * @param {CandlePoint[]} candles
 * @param {{shortPeriod?: number, longPeriod?: number, atrLength?: number}} [params]
 * @returns {KasePeakOscillatorSeries}
 */
export function calcKasePeakOscillator(candles, params) {
    // ATR length hardcoded in .cs to 10; allow override here for testing.
    const atrLength = params && Number.isFinite(params.atrLength) ? (params.atrLength | 0) : 10;

    if (!Array.isArray(candles) || candles.length === 0) {
        return { shortTerm: [], longTerm: [] };
    }

    const n = candles.length;
    const shortTerm = new Array(n);
    const longTerm = new Array(n);
    for (let i = 0; i < n; i++) {
        const t = candles[i].time;
        shortTerm[i] = { time: t, value: null };
        longTerm[i] = { time: t, value: null };
    }

    if (atrLength <= 0) return { shortTerm, longTerm };

    const atr = csATR(candles, atrLength);
    // The .cs only enters the oscillator branch once `_atr.IsFormed` (bar
    // atrLength-1). csATR emits non-null from bar 0 (partial cumulative
    // average), so gate explicitly to skip the early bars.
    const atrFormedFrom = atrLength - 1;

    // Rolling buffers of capacity 2 (peak/valley over the last 2 bars).
    const peakBuf: number[] = [];
    const valleyBuf: number[] = [];
    let prevClose = 0;

    for (let i = 0; i < n; i++) {
        if (i < atrFormedFrom) continue;
        const c = candles[i];
        const h = c && c.high;
        const l = c && c.low;
        const cl = c && c.close;
        const a = atr[i] && atr[i].value;
        if (typeof h !== 'number' || !Number.isFinite(h) ||
            typeof l !== 'number' || !Number.isFinite(l) ||
            typeof cl !== 'number' || !Number.isFinite(cl) ||
            typeof a !== 'number' || !Number.isFinite(a)) {
            // Skip until ATR is formed and inputs are valid.
            continue;
        }

        let peak = h;
        let valley = l;
        if (prevClose !== 0) {
            if (cl > prevClose) {
                peak = Math.max(h, prevClose + a);
                valley = Math.max(l, prevClose - 0.5 * a);
            } else if (cl < prevClose) {
                peak = Math.min(h, prevClose + 0.5 * a);
                valley = Math.min(l, prevClose - a);
            }
        }

        // Mirror IsFinal branch: push, then compute using buffer state.
        peakBuf.push(peak);
        valleyBuf.push(valley);
        if (peakBuf.length > 2) peakBuf.shift();
        if (valleyBuf.length > 2) valleyBuf.shift();
        prevClose = cl;

        let minValley = valleyBuf[0];
        let maxPeak = peakBuf[0];
        for (let k = 1; k < valleyBuf.length; k++) {
            if (valleyBuf[k] < minValley) minValley = valleyBuf[k];
            if (peakBuf[k] > maxPeak) maxPeak = peakBuf[k];
        }

        const den1 = maxPeak - minValley;
        const den2 = peakBuf[0] - valleyBuf[0];
        const sho = den1 !== 0 ? 100 * (cl - minValley) / den1 : 0;
        const lon = den2 !== 0 ? 100 * (cl - valleyBuf[0]) / den2 : 0;

        shortTerm[i] = { time: candles[i].time, value: sho };
        longTerm[i] = { time: candles[i].time, value: lon };
    }

    return { shortTerm, longTerm };
}
