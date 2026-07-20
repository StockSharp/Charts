// Average Directional Index (Welles Wilder, 1978).
// Port of StockSharp Algo.Indicators AverageDirectionalIndex.cs, which wraps a
// DirectionalIndex (the DX / +DI / −DI stage) and smooths its DX output with a
// WilderMovingAverage (Length=14), running in Sequence mode.
//
// The DX stage is the same chain as dx.js (see dmiRaw / DiPart notes there):
//   +DI = 100 * WilderMA(+DM) / ATR,  −DI symmetric,  both WilderMA EXPANDING.
//   DX  = 100 * |+DI − −DI| / (+DI + −DI).
// The DX outer produces a scalar from bar 1 (as soon as +DI/−DI exist), which
// is what feeds the ADX WilderMovingAverage — so ADX is a second Wilder pass
// over DX, fed from bar 1 and formed after L inputs (bar L).
//
// Line gating (matches the dumped inner IsFormed flags):
//   - DX line   (DirectionalIndex.IsFormed = DiPlus.IsFormed && DiMinus.IsFormed)
//     emits from bar L+1.
//   - ADX line  (MovingAverage.IsFormed, fed DX from bar 1) emits from bar L.
// +DI/−DI (kept for the renderer, not part of the ADX dump) are gated like DX.
//
// Output shape: `{ adx, dx, plusDI, minusDI }`, each IndicatorPoint[] aligned
// 1:1 with input candles.

import { wilderWMA } from './helpers.js';
import { dmiRaw } from './dx.js';

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
 * @typedef {{adx: IndicatorPoint[], dx: IndicatorPoint[], plusDI: IndicatorPoint[], minusDI: IndicatorPoint[]}} ADXSeries
 */

/**
 * @param {CandlePoint[]} candles
 * @param {{length?: number}} [params]
 * @returns {ADXSeries}
 */
export function calcADX(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 14;

    if (!Array.isArray(candles) || candles.length === 0) {
        return { adx: [], dx: [], plusDI: [], minusDI: [] };
    }

    const n = candles.length;
    const { plusDM, minusDM, tr } = dmiRaw(candles);

    const smPlus = wilderWMA(plusDM, length);
    const smMinus = wilderWMA(minusDM, length);
    const smTR = wilderWMA(tr, length);

    // Internal (ungated) +DI/−DI/DX, non-null from bar 1 — this is the stream
    // the C# DX outer produces and feeds into the ADX WilderMovingAverage.
    const pdiRaw = new Array(n).fill(null);
    const mdiRaw = new Array(n).fill(null);
    const dxRaw = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
        const sp = smPlus[i];
        const sm = smMinus[i];
        const st = smTR[i];
        if (sp === null || sm === null || st === null || st === 0) continue;
        const pdi = 100 * sp / st;
        const mdi = 100 * sm / st;
        pdiRaw[i] = pdi;
        mdiRaw[i] = mdi;
        const sum = pdi + mdi;
        dxRaw[i] = sum === 0 ? 0 : 100 * Math.abs(pdi - mdi) / sum;
    }

    const diFirst = length + 1; // DiPart.IsFormed → +DI/−DI/DX line

    // The ADX WilderMovingAverage is fed the DX value only once the DX outer
    // is IsFormed (Sequence mode gates on the upstream IsFormed), i.e. from bar
    // diFirst — NOT from bar 1. It then needs L inputs to form itself, so the
    // ADX line first appears at bar diFirst + L - 1 (= 2L for the defaults).
    const dxForMA = dxRaw.map((v, i) => (i >= diFirst ? v : null));
    const adxRaw = wilderWMA(dxForMA, length);
    const adxFirst = diFirst + length - 1; // MovingAverage.IsFormed → ADX line

    const adx = new Array(n);
    const dx = new Array(n);
    const plusDI = new Array(n);
    const minusDI = new Array(n);
    for (let i = 0; i < n; i++) {
        const t = candles[i].time;
        adx[i] = { time: t, value: i >= adxFirst ? adxRaw[i] : null };
        dx[i] = { time: t, value: i >= diFirst ? dxRaw[i] : null };
        plusDI[i] = { time: t, value: i >= diFirst ? pdiRaw[i] : null };
        minusDI[i] = { time: t, value: i >= diFirst ? mdiRaw[i] : null };
    }
    return { adx, dx, plusDI, minusDI };
}
