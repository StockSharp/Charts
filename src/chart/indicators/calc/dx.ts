// Directional Index (DX) — Welles Wilder.
// Port of StockSharp Algo.Indicators DirectionalIndex.cs and the DiPart /
// DiPlus / DiMinus / AverageTrueRange chain it drives.
//
// C# pipeline (bar-for-bar):
//   DiPart holds an AverageTrueRange and a WilderMovingAverage, both Length=L.
//     - AverageTrueRange processes the TrueRange of EVERY bar (TR[0]=high-low),
//       i.e. it is a WilderMovingAverage over TR starting at bar 0.
//     - The directional-movement WilderMovingAverage is fed +DM / −DM starting
//       at bar 1 (it needs the previous candle).
//     +DI = 100 * WilderMA(+DM) / ATR   (−DI symmetric); 0 when ATR is 0.
//   Both WilderMovingAverage instances are EXPANDING averages during warm-up
//   (divisor = running count 1,2,3,… capped at L), not SMA-seeded — see
//   helpers.wilderWMA, which reproduces WilderMovingAverage.cs exactly.
//
//   DiPart.IsFormed lags one bar: it flips true only once BOTH inner MAs are
//   formed, tested at the START of the next bar. The +DM MA is fed from bar 1,
//   so it is formed after bar L, and DiPart therefore emits +DI/−DI from bar
//   L+1. The dumped DiPlus/DiMinus lines are gated on that IsFormed, so the JS
//   port nulls +DI/−DI before bar L+1 to match.
//
//   DX = 100 * |+DI − −DI| / (+DI + −DI)  (0 when the sum is 0).
//
// +DM / −DM (DiPlus.cs / DiMinus.cs):
//   upMove   = high[i] - high[i-1]
//   downMove = low[i-1] - low[i]
//   +DM = (upMove   > downMove && upMove   > 0) ? upMove   : 0
//   −DM = (downMove > upMove   && downMove > 0) ? downMove : 0
//   TR  = max(high-low, |high-prevClose|, |low-prevClose|)   (bar 0: high-low)
//
// Default Length in StockSharp's DiPart.cs is 5, but DirectionalIndex is used
// by AverageDirectionalIndex with Length=14 (the canonical Wilder default),
// which is the JS default here. Override via params.length.
//
// Output shape: `{ plusDI, minusDI, dx }`, each an IndicatorPoint[] aligned
// 1:1 with input candles.

import { wilderWMA } from './helpers.js';

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
 * @typedef {{plusDI: IndicatorPoint[], minusDI: IndicatorPoint[], dx: IndicatorPoint[]}} DXSeries
 */

/**
 * Compute the shared +DM / −DM / TR raw series for the DMI/ADX chain.
 * TR is populated from bar 0 (high-low); +DM/−DM start at bar 1.
 * @param {CandlePoint[]} candles
 * @returns {{plusDM: (number|null)[], minusDM: (number|null)[], tr: (number|null)[]}}
 */
export function dmiRaw(candles) {
    const n = candles.length;
    const plusDM = new Array(n);
    const minusDM = new Array(n);
    const tr = new Array(n);
    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const h = c && c.high;
        const l = c && c.low;
        const hlOk = typeof h === 'number' && Number.isFinite(h) && typeof l === 'number' && Number.isFinite(l);
        if (i === 0) {
            plusDM[0] = null;
            minusDM[0] = null;
            tr[0] = hlOk ? h - l : null;
            continue;
        }
        const p = candles[i - 1];
        const pc = p && p.close;
        const ph = p && p.high;
        const pl = p && p.low;
        if (!hlOk ||
            typeof ph !== 'number' || !Number.isFinite(ph) ||
            typeof pl !== 'number' || !Number.isFinite(pl) ||
            typeof pc !== 'number' || !Number.isFinite(pc)) {
            plusDM[i] = null; minusDM[i] = null; tr[i] = null;
            continue;
        }
        const upMove = h - ph;
        const downMove = pl - l;
        plusDM[i] = (upMove > downMove && upMove > 0) ? upMove : 0;
        minusDM[i] = (downMove > upMove && downMove > 0) ? downMove : 0;
        tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    }
    return { plusDM, minusDM, tr };
}

/**
 * @param {CandlePoint[]} candles
 * @param {{length?: number}} [params]
 * @returns {DXSeries}
 */
export function calcDX(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 14;

    if (!Array.isArray(candles) || candles.length === 0) {
        return { plusDI: [], minusDI: [], dx: [] };
    }

    const n = candles.length;
    const { plusDM, minusDM, tr } = dmiRaw(candles);

    const smPlus = wilderWMA(plusDM, length);
    const smMinus = wilderWMA(minusDM, length);
    const smTR = wilderWMA(tr, length);

    // DiPart.IsFormed flips one bar after the +DM MA forms (fed from bar 1 →
    // formed after bar L), so the emitted +DI/−DI lines start at bar L+1.
    const firstFormed = length + 1;

    const plusDI = new Array(n);
    const minusDI = new Array(n);
    const dx = new Array(n);
    for (let i = 0; i < n; i++) {
        const t = candles[i].time;
        const sp = smPlus[i];
        const sm = smMinus[i];
        const st = smTR[i];
        if (i < firstFormed || sp === null || sm === null || st === null || st === 0) {
            plusDI[i] = { time: t, value: null };
            minusDI[i] = { time: t, value: null };
            dx[i] = { time: t, value: null };
            continue;
        }
        const pdi = 100 * sp / st;
        const mdi = 100 * sm / st;
        const sum = pdi + mdi;
        const dxv = sum === 0 ? 0 : 100 * Math.abs(pdi - mdi) / sum;
        plusDI[i] = { time: t, value: pdi };
        minusDI[i] = { time: t, value: mdi };
        dx[i] = { time: t, value: dxv };
    }
    return { plusDI, minusDI, dx };
}
