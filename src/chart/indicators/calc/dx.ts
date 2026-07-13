// Directional Index (DX) — Welles Wilder.
// Port of StockSharp Algo.Indicators DirectionalIndex.cs (note: that .cs's
// "DirectionalIndex" class is the DI+/DI- pair plus the DX line, WITHOUT
// the second Wilder smoothing that would produce the full ADX.) Use adx.js
// when you want the smoothed ADX line as well — this calc is the
// pre-smoothing pipeline shared with that ADX implementation.
//
// Pipeline (matches DiPart.cs / DiPlus.cs / DiMinus.cs internally used by
// DirectionalIndex.cs):
//   1. For i ≥ 1, compute +DM, −DM, TR (true range).
//        upMove   = high[i] - high[i-1]
//        downMove = low[i-1] - low[i]
//        +DM      = (upMove   > downMove && upMove   > 0) ? upMove   : 0
//        −DM      = (downMove > upMove   && downMove > 0) ? downMove : 0
//        TR       = max(high-low, |high-prevClose|, |low-prevClose|)
//   2. Wilder-smooth +DM, −DM, TR over `length`.
//   3. +DI = 100 * sm(+DM) / sm(TR), same for −DI.
//   4. DX = 100 * |+DI − −DI| / (+DI + −DI)   (0 when sum is 0)
//
// Default Length in StockSharp's DiPart.cs is 5 (DirectionalIndex.cs does
// NOT override that default), but per the task the JS default is **14** —
// the canonical Wilder convention used by every charting package and by
// adx.js in this folder. Override via params.length if you need 5.
//
// Output shape: `{ plusDI, minusDI, dx }`, each an IndicatorPoint[] aligned
// 1:1 with input candles.

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
 * Wilder smoothing tolerant of a leading null prefix. Seeds with the SMA
 * of the first `length` consecutive non-null finite samples, then
 * `wma[i] = (wma[i-1] * (length-1) + x[i]) / length`. Mirrors the helper
 * inlined in adx.js (kept local here so dx.js doesn't depend on adx.js).
 * @param {(number|null)[]} values
 * @param {number} length
 * @returns {(number|null)[]}
 */
function wilderSmoothFlexible(values, length) {
    const n = values.length;
    const out = new Array(n);
    if (n === 0 || length <= 0) {
        for (let i = 0; i < n; i++) out[i] = null;
        return out;
    }
    let seedSum = 0;
    let seedCount = 0;
    let prev = 0;
    let seeded = false;
    for (let i = 0; i < n; i++) {
        const v = values[i];
        const ok = typeof v === 'number' && Number.isFinite(v);
        if (!seeded) {
            if (!ok) { seedSum = 0; seedCount = 0; out[i] = null; continue; }
            seedSum += v;
            seedCount++;
            if (seedCount === length) {
                prev = seedSum / length;
                out[i] = prev;
                seeded = true;
            } else out[i] = null;
            continue;
        }
        if (!ok) { out[i] = null; continue; }
        prev = (prev * (length - 1) + v) / length;
        out[i] = prev;
    }
    return out;
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
    const plusDM = new Array(n);
    const minusDM = new Array(n);
    const tr = new Array(n);
    plusDM[0] = null; minusDM[0] = null; tr[0] = null;
    for (let i = 1; i < n; i++) {
        const c = candles[i];
        const p = candles[i - 1];
        const h = c && c.high;
        const l = c && c.low;
        const pc = p && p.close;
        const ph = p && p.high;
        const pl = p && p.low;
        if (typeof h !== 'number' || !Number.isFinite(h) ||
            typeof l !== 'number' || !Number.isFinite(l) ||
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

    const smPlus = wilderSmoothFlexible(plusDM, length);
    const smMinus = wilderSmoothFlexible(minusDM, length);
    const smTR = wilderSmoothFlexible(tr, length);

    const plusDI = new Array(n);
    const minusDI = new Array(n);
    const dx = new Array(n);
    for (let i = 0; i < n; i++) {
        const t = candles[i].time;
        const sp = smPlus[i];
        const sm = smMinus[i];
        const st = smTR[i];
        if (sp === null || sm === null || st === null || st === 0) {
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
