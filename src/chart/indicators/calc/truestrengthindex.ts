// True Strength Index (TSI) — JS port of D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\TrueStrengthIndex.cs.
// Deviations from .cs: none.
//
// momentum[i]   = close[i] - close[i-1]                         (null for i=0)
// firstMom      = EMA(momentum,     firstLength)
// firstAbsMom   = EMA(|momentum|,   firstLength)
// dblMom        = EMA(firstMom,     secondLength)
// dblAbsMom     = EMA(firstAbsMom,  secondLength)
// tsi           = 100 * dblMom / dblAbsMom   (0 when dblAbsMom == 0)
// signal        = EMA(tsi, signalLength)
//
// Defaults: firstLength=25, secondLength=13, signalLength=7 per .cs ctor.
//
// @typedef {{time:number|string,open:number,high:number,low:number,close:number,volume:number}} Candle
// @typedef {{time:number|string,value:number|null}} Point
// @typedef {{tsi: Point[], signal: Point[]}} TSISeries

/**
 * EMA matching the C# `ExponentialMovingAverage` partial-seed semantics:
 * emits `Buffer.Sum / Length` from bar 0 (the partial seed), at bar
 * length-1 the buffer fills and emission equals the classic SMA, from bar
 * length onward the steady-state recursion takes over. Delegated to the
 * shared partialSeedEMA helper.
 */
import { partialSeedEMA } from './helpers.js';

function emaArray(values, length) {
    return partialSeedEMA(values, length);
}

/**
 * @param {Candle[]} candles
 * @param {{firstLength?: number, secondLength?: number, signalLength?: number}} [params]
 * @returns {TSISeries}
 */
export function calcTrueStrengthIndex(candles, params) {
    const firstLength  = params && Number.isFinite(params.firstLength)  ? (params.firstLength  | 0) : 25;
    const secondLength = params && Number.isFinite(params.secondLength) ? (params.secondLength | 0) : 13;
    const signalLength = params && Number.isFinite(params.signalLength) ? (params.signalLength | 0) : 7;

    if (!Array.isArray(candles) || candles.length === 0) return { tsi: [], signal: [] };
    const n = candles.length;

    // Build momentum and |momentum| series.
    const mom = new Array(n);
    const absMom = new Array(n);
    for (let i = 0; i < n; i++) {
        if (i === 0) { mom[i] = null; absMom[i] = null; continue; }
        const cur = candles[i] && candles[i].close;
        const prv = candles[i - 1] && candles[i - 1].close;
        const ok = typeof cur === 'number' && Number.isFinite(cur)
            && typeof prv === 'number' && Number.isFinite(prv);
        if (!ok) { mom[i] = null; absMom[i] = null; continue; }
        const m = cur - prv;
        mom[i] = m;
        absMom[i] = Math.abs(m);
    }

    const firstMom    = emaArray(mom,    firstLength);
    const firstAbsMom = emaArray(absMom, firstLength);
    const dblMom      = emaArray(firstMom,    secondLength);
    const dblAbsMom   = emaArray(firstAbsMom, secondLength);

    const tsiRaw = new Array(n);
    for (let i = 0; i < n; i++) {
        const a = dblMom[i];
        const b = dblAbsMom[i];
        if (a === null || b === null) { tsiRaw[i] = null; continue; }
        tsiRaw[i] = b !== 0 ? 100 * a / b : 0;
    }

    // Signal is only fed tsi values after Line.IsFormed = true (per .cs:
    // BaseComplexIndicator Sequence mode breaks before invoking the next
    // inner when the previous is not yet formed). Line.IsFormed iff
    // doubleSmoothed*.IsFormed, which happens once each inner EMA has
    // received secondLength inputs. The first inner-EMA input lands at
    // bar 1 (first momentum), so Line.IsFormed at bar secondLength.
    const lineFormedAt = secondLength;
    const tsiForSignal = new Array(n);
    for (let i = 0; i < n; i++) {
        tsiForSignal[i] = i >= lineFormedAt ? tsiRaw[i] : null;
    }
    const signalRaw = emaArray(tsiForSignal, signalLength);

    // The dumped lines are gated on their inner IsFormed flags, NOT on when the
    // partial-seed EMAs first produce a value. The Tsi line is emitted from
    // Line.IsFormed (bar lineFormedAt); the Signal EMA is fed the tsi only from
    // that bar, so it forms — and its line is emitted — at bar
    // lineFormedAt + signalLength - 1.
    const signalFormedAt = lineFormedAt + signalLength - 1;

    const tsi = new Array(n);
    const signal = new Array(n);
    for (let i = 0; i < n; i++) {
        const t = candles[i].time;
        tsi[i] = { time: t, value: i >= lineFormedAt ? tsiRaw[i] : null };
        signal[i] = { time: t, value: i >= signalFormedAt ? signalRaw[i] : null };
    }
    return { tsi, signal };
}
