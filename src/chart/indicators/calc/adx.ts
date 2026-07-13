// Average Directional Index (Welles Wilder, 1978).
// Steps:
//   1. For each i ≥ 1 compute +DM, −DM, TR (true range).
//   2. Smooth all three with Wilder's MA over `length` periods.
//   3. +DI = 100 * smoothed(+DM) / smoothed(TR); same for −DI.
//   4. DX  = 100 * |+DI − −DI| / (+DI + −DI).
//   5. ADX = Wilder smoothing of DX over `length`.
//
// Warm-up: +DM/-DM/TR start at candle index 1, so smoothing seeds at index
// `length` (first non-null +DI/-DI). ADX (a second Wilder pass over DX)
// seeds at index 2*length − 1. Outputs before those indices are null on
// each series.
//
// We don't reuse helpers/wilderMA here because that helper assumes the
// seed window is at the start of the input array — ADX has variable-length
// null prefixes (DX is null until +DI/-DI exist), so smoothing is inlined.

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
 * @typedef {{adx: IndicatorPoint[], plusDI: IndicatorPoint[], minusDI: IndicatorPoint[]}} ADXSeries
 */

/**
 * Wilder smoothing that tolerates a leading null prefix in `values`. Seeds
 * with the SMA of the first `length` consecutive non-null finite samples,
 * then recurses `wma[i] = (wma[i-1] * (length-1) + x[i]) / length`.
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
            if (!ok) {
                seedSum = 0;
                seedCount = 0;
                out[i] = null;
                continue;
            }
            seedSum += v;
            seedCount++;
            if (seedCount === length) {
                prev = seedSum / length;
                out[i] = prev;
                seeded = true;
            } else {
                out[i] = null;
            }
            continue;
        }
        if (!ok) {
            out[i] = null;
            continue;
        }
        prev = (prev * (length - 1) + v) / length;
        out[i] = prev;
    }
    return out;
}

/**
 * @param {CandlePoint[]} candles
 * @param {{length?: number}} [params]
 * @returns {ADXSeries}
 */
export function calcADX(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 14;

    if (!Array.isArray(candles) || candles.length === 0) {
        return { adx: [], plusDI: [], minusDI: [] };
    }

    const n = candles.length;
    const plusDM = new Array(n);
    const minusDM = new Array(n);
    const tr = new Array(n);
    plusDM[0] = null;
    minusDM[0] = null;
    tr[0] = null;
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
        const range1 = h - l;
        const range2 = Math.abs(h - pc);
        const range3 = Math.abs(l - pc);
        tr[i] = Math.max(range1, range2, range3);
    }

    const smPlusDM = wilderSmoothFlexible(plusDM, length);
    const smMinusDM = wilderSmoothFlexible(minusDM, length);
    const smTR = wilderSmoothFlexible(tr, length);

    const plusDI = new Array(n);
    const minusDI = new Array(n);
    const dxRaw = new Array(n);
    for (let i = 0; i < n; i++) {
        const sp = smPlusDM[i];
        const sm = smMinusDM[i];
        const st = smTR[i];
        if (sp === null || sm === null || st === null || st === 0) {
            plusDI[i] = null; minusDI[i] = null; dxRaw[i] = null;
            continue;
        }
        const pdi = 100 * sp / st;
        const mdi = 100 * sm / st;
        plusDI[i] = pdi;
        minusDI[i] = mdi;
        const sum = pdi + mdi;
        dxRaw[i] = sum === 0 ? 0 : 100 * Math.abs(pdi - mdi) / sum;
    }

    const adxRaw = wilderSmoothFlexible(dxRaw, length);

    const adx = new Array(n);
    const plusDIOut = new Array(n);
    const minusDIOut = new Array(n);
    for (let i = 0; i < n; i++) {
        const t = candles[i].time;
        adx[i] = { time: t, value: adxRaw[i] };
        plusDIOut[i] = { time: t, value: plusDI[i] };
        minusDIOut[i] = { time: t, value: minusDI[i] };
    }
    return { adx, plusDI: plusDIOut, minusDI: minusDIOut };
}
