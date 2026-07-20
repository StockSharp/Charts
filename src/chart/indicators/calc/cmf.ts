// Chaikin Money Flow (Marc Chaikin).
//   MFM = ((close - low) - (high - close)) / (high - low)        (high==low → 0)
//   MFV = MFM * volume
//   CMF[i] = Σ MFV over last N bars / Σ volume over last N bars
//
// Port of StockSharp Algo.Indicators ChaikinMoneyFlow.cs, INCLUDING its quirk:
// the .cs buffer caches the per-bar `moneyFlowVolume` and on eviction subtracts
// `oldValue = Buffer.Front()` (the old MFV) from BOTH `_moneyFlowVolumeSum` and
// `_volumeSum` — i.e. the volume denominator is decremented by the old bar's MFV,
// not its volume. This is arguably a bug, but to match the live C# bar-for-bar we
// replicate it exactly (subtract the old MFV from the volume sum too).
//
// `length` default 20. Warm-up: first (length-1) outputs are null.
// Σvolume == 0 in the window → CMF = 0 (matches the .cs guard).

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
export function calcCMF(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 20;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    if (length <= 0) return out;

    // Pre-compute per-bar MFV and volume so the rolling-window pass is trivial.
    const mfv = new Array(n);
    const vol = new Array(n);
    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const h = c && c.high;
        const l = c && c.low;
        const cl = c && c.close;
        const v = c && c.volume;
        const okPrice = typeof h === 'number' && Number.isFinite(h) &&
                        typeof l === 'number' && Number.isFinite(l) &&
                        typeof cl === 'number' && Number.isFinite(cl);
        const okVol = typeof v === 'number' && Number.isFinite(v);
        if (!okPrice || !okVol) {
            mfv[i] = NaN;
            vol[i] = NaN;
            continue;
        }
        const range = h - l;
        const mfm = range !== 0 ? ((cl - l) - (h - cl)) / range : 0;
        mfv[i] = mfm * v;
        vol[i] = v;
    }

    let mfvSum = 0;
    let volSum = 0;
    let invalid = 0;
    for (let i = 0; i < n; i++) {
        if (Number.isFinite(mfv[i])) {
            mfvSum += mfv[i];
            volSum += vol[i];
        } else {
            invalid++;
        }
        if (i >= length) {
            const dm = mfv[i - length];
            if (Number.isFinite(dm)) {
                mfvSum -= dm;
                // Replicate the .cs: it subtracts the old MFV (Buffer.Front) from the
                // volume sum too, NOT the old bar's volume.
                volSum -= dm;
            } else {
                invalid--;
            }
        }
        if (i < length - 1) continue;
        if (invalid !== 0) continue;
        out[i] = { time: candles[i].time, value: volSum !== 0 ? mfvSum / volSum : 0 };
    }
    return out;
}
