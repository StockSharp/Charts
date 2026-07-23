// Composite Momentum indicator (Algo.Indicators/CompositeMomentum.cs).
// Multi-output complex indicator. Combines short-term ROC, long-term ROC,
// RSI, and a MACD-style EMA-fast vs EMA-slow normalised difference into a
// single "composite" line, then smooths it with an SMA.
//
// Per .cs (default ctor): shortRoc.Length=14, longRoc.Length=28,
// rsi.Length=14, emaFast.Length=12, emaSlow.Length=26, sma.Length=9.
//
// On each bar (once shortRoc/longRoc/rsi/emaFast/emaSlow are all formed):
//   normShortRoc = ROC_short / 100               (so 5% → 0.05)
//   normLongRoc  = ROC_long  / 100
//   normRsi      = (RSI - 50) / 50               (so 50 RSI → 0, 100 → 1)
//   macdLine     = emaSlow != 0
//                  ? (emaFast - emaSlow) / emaSlow
//                  : 0
//   composite    = (normShortRoc + normLongRoc + normRsi + macdLine) / 4
//   composite   *= 100                            (back to "percent" units)
//   sma          = SMA(composite, smaLength)
//
// Outputs aligned 1:1 with input candles:
//   composite : { time, value } — null during warm-up of any inner.
//   sma       : { time, value } — null until smaLength composite samples.
//
// Notes / deviations vs the .cs:
//   * The .cs only PUSHES the composite into the SMA when all inner
//     indicators are formed. We do the same: SMA starts counting from the
//     first non-null composite, so the SMA's warm-up stacks on top of the
//     longest inner warm-up.
//   * RateOfChange.cs warm-up: first non-null at index = Length (needs
//     Buffer.Count > Length, i.e. Length+1 samples).
//   * RSI warm-up matches calcRSI: first non-null at index = Length.
//   * EMA warm-up matches calcEMA: SMA-seed at index = Length-1.

import { simpleMA, smoothedMA } from './helpers.js';

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
 * @typedef {{composite: IndicatorPoint[], sma: IndicatorPoint[]}} CompositeMomentumSeries
 */

/**
 * Rate of Change on a numeric series. Returns array aligned 1:1; first
 * `length` entries are null; thereafter v[i] = (x[i] - x[i-length]) / x[i-length] * 100.
 * Mirrors Momentum.cs + RateOfChange.cs: `Buffer.Count > Length` means the
 * first non-null output lands at index `length` (we have length+1 samples
 * by then).
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
 * EMA on a numeric series with SMA seed (length-1 nulls, then EMA recurrence).
 * Matches calcEMA's seeding rule. Null in seed window invalidates that run
 * but we keep going — non-finite values after the seed emit null and pass
 * through prev.
 * @param {(number|null)[]} values
 * @param {number} length
 * @returns {(number|null)[]}
 */
function emaArray(values, length) {
    const n = values.length;
    const out = new Array(n);
    if (n === 0 || length <= 0) {
        for (let i = 0; i < n; i++) out[i] = null;
        return out;
    }
    const k = 2 / (length + 1);
    let seedSum = 0;
    let seedCount = 0;
    let seedDone = false;
    let prev = 0;
    for (let i = 0; i < n; i++) {
        const v = values[i];
        const ok = typeof v === 'number' && Number.isFinite(v);
        if (!seedDone) {
            if (!ok) { out[i] = null; continue; }
            seedSum += v;
            seedCount++;
            if (seedCount === length) {
                prev = seedSum / length;
                out[i] = prev;
                seedDone = true;
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
 * RSI on a numeric series (Wilder smoothing, SMA seed of gains/losses).
 * First `length` outputs are null.
 * @param {(number|null)[]} values
 * @param {number} length
 * @returns {(number|null)[]}
 */
function rsiArray(values, length) {
    const n = values.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = null;
    if (n <= length || length <= 0) return out;

    const gains = new Array(n - 1);
    const losses = new Array(n - 1);
    for (let i = 1; i < n; i++) {
        const a = values[i - 1];
        const b = values[i];
        if (typeof a !== 'number' || !Number.isFinite(a)
            || typeof b !== 'number' || !Number.isFinite(b)) {
            gains[i - 1] = null;
            losses[i - 1] = null;
            continue;
        }
        const d = b - a;
        gains[i - 1] = d > 0 ? d : 0;
        losses[i - 1] = d < 0 ? -d : 0;
    }
    const averageGain = smoothedMA(gains, length);
    const averageLoss = smoothedMA(losses, length);
    for (let index = length - 1; index < n - 1; index++) {
        const gain = averageGain[index];
        const loss = averageLoss[index];
        if (gain === null || loss === null) continue;
        const total = gain + loss;
        out[index + 1] = total === 0 ? 50 : 100 * gain / total;
    }
    return out;
}

/**
 * @param {CandlePoint[]} candles
 * @param {{shortRocLength?: number, longRocLength?: number, rsiLength?: number, fastLength?: number, slowLength?: number, smaLength?: number}} [params]
 * @returns {CompositeMomentumSeries}
 */
export function calcCompositeMomentum(candles, params) {
    const shortRocLen = params && Number.isFinite(params.shortRocLength) ? (params.shortRocLength | 0) : 14;
    const longRocLen  = params && Number.isFinite(params.longRocLength)  ? (params.longRocLength  | 0) : 28;
    const rsiLen      = params && Number.isFinite(params.rsiLength)      ? (params.rsiLength      | 0) : 14;
    const fastLen     = params && Number.isFinite(params.fastLength)     ? (params.fastLength     | 0) : 12;
    const slowLen     = params && Number.isFinite(params.slowLength)     ? (params.slowLength     | 0) : 26;
    const smaLen      = params && Number.isFinite(params.smaLength)      ? (params.smaLength      | 0) : 9;

    if (!Array.isArray(candles) || candles.length === 0) {
        return { composite: [], sma: [] };
    }

    const n = candles.length;
    const closes = new Array(n);
    for (let i = 0; i < n; i++) closes[i] = candles[i] && candles[i].close;

    const shortRoc = rocArray(closes, shortRocLen);
    const longRoc = rocArray(closes, longRocLen);
    const rsi = rsiArray(closes, rsiLen);
    const emaFast = emaArray(closes, fastLen);
    const emaSlow = emaArray(closes, slowLen);

    const composite = new Array(n);
    const compRaw = new Array(n);
    for (let i = 0; i < n; i++) {
        const t = candles[i].time;
        const sr = shortRoc[i];
        const lr = longRoc[i];
        const r = rsi[i];
        const ef = emaFast[i];
        const es = emaSlow[i];
        if (sr === null || lr === null || r === null || ef === null || es === null) {
            composite[i] = { time: t, value: null };
            compRaw[i] = null;
            continue;
        }
        const normShortRoc = sr / 100;
        const normLongRoc = lr / 100;
        const normRsi = (r - 50) / 50;
        const macdLine = es !== 0 ? (ef - es) / es : 0;
        const v = ((normShortRoc + normLongRoc + normRsi + macdLine) / 4) * 100;
        composite[i] = { time: t, value: v };
        compRaw[i] = v;
    }

    // SMA fed only by formed composite values. The .cs pushes into SMA
    // strictly while all inner indicators are formed, so a `null` gap in
    // the middle of compRaw doesn't reset the SMA — we filter nulls then
    // realign back to the candle timeline.
    const dense: number[] = [];
    const denseIdx: number[] = [];
    for (let i = 0; i < n; i++) {
        if (compRaw[i] !== null) {
            dense.push(compRaw[i]);
            denseIdx.push(i);
        }
    }
    const smaDense = simpleMA(dense, smaLen);
    const sma = new Array(n);
    for (let i = 0; i < n; i++) sma[i] = { time: candles[i].time, value: null };
    for (let k = 0; k < denseIdx.length; k++) {
        const i = denseIdx[k];
        if (smaDense[k] !== null && smaDense[k] !== undefined) {
            sma[i] = { time: candles[i].time, value: smaDense[k] };
        }
    }

    return { composite, sma };
}
