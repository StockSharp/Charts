// Finite Volume Element (FVE) — Markos Katsanos.
// Port of StockSharp Algo.Indicators FiniteVolumeElement.cs.
//
// Per-bar raw value:
//   cl = high - low                                          (candle "length")
//   if cl != 0 AND totalVolume != 0:
//       vf  = totalVolume * (2 * (close - low) / cl - 1)
//       fve = vf / totalVolume                               // = 2*(close-low)/cl - 1
//   else:
//       fve = 0
//
// Output (once `length` raw values have been pushed):
//   FVE_pct = (sum of last `length` raw values) / length * 100
//
// Note: the per-bar raw value collapses to a position-in-range mapped to
// [-1, +1] (close at low → -1, close at high → +1). The "volume" factor
// in the .cs cancels itself out exactly, so FVE is independent of the
// magnitude of volume here. We preserve the .cs's *gate* on
// totalVolume != 0 (a bar with zero volume contributes 0), but otherwise
// the multiplication/division is a no-op. We document this rather than
// simplify the code because anyone diff'ing against the .cs should see
// the same structural arithmetic.
//
// .cs deviation notes:
// (a) Measure = Percent on the .cs is metadata only — we just multiply
//     the final value by 100 to match.
// (b) Warm-up: IsFormed flips true once Buffer is at capacity (count ==
//     length). So the first non-null output lands at index (length - 1).
// (c) `IsFinal=false` (intra-bar) branch from the .cs is ignored; the
//     final-bar overlay term in the .cs `(input.IsFinal ? 0 : fve - Buffer.Back())`
//     is for live ticks, not closed-bar batches.

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
 * @param {CandlePoint[]} candles
 * @param {{length?: number}} [params]
 * @returns {IndicatorPoint[]}
 */
export function calcFVE(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 22;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };
    if (length <= 0) return out;

    // Per-bar raw fve in [-1, +1] (or exactly 0 for degenerate bars).
    const raw = new Array(n);
    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const h = c && c.high;
        const l = c && c.low;
        const cl = c && c.close;
        const v = c && c.volume;
        if (typeof h !== 'number' || !Number.isFinite(h) ||
            typeof l !== 'number' || !Number.isFinite(l) ||
            typeof cl !== 'number' || !Number.isFinite(cl)) {
            raw[i] = 0; // mirror the .cs's else-branch: treat as 0 contribution
            continue;
        }
        const range = h - l;
        const hasVol = typeof v === 'number' && Number.isFinite(v) && v !== 0;
        if (range === 0 || !hasVol) {
            raw[i] = 0;
        } else {
            // vf = volume * (2*(close-low)/range - 1); fve = vf / volume.
            // Volume cancels but we keep the structure honest.
            const vf = v * (2 * ((cl - l) / range) - 1);
            raw[i] = vf / v;
        }
    }

    // SMA of the raw stream gives the .cs's Buffer.Sum / Length, then ×100.
    const sma = simpleMA(raw, length);
    for (let i = 0; i < n; i++) {
        const s = sma[i];
        if (s === null) continue;
        out[i] = { time: candles[i].time, value: s * 100 };
    }
    return out;
}
