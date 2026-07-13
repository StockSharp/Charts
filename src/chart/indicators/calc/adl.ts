// Accumulation/Distribution Line (Marc Chaikin) — cumulative volume-weighted
// money-flow line.
//   MFM = ((close - low) - (high - close)) / (high - low)          (range −1..+1)
//   MFV = MFM * volume
//   ADL[i] = ADL[i-1] + MFV[i],   ADL[0] = MFV[0]
// When high == low the MFM denominator is zero — StockSharp's
// AccumulationDistributionLine treats it as "no contribution" and carries
// the running sum forward. Same for NaN volume / NaN high/low: skip MFV
// for that bar and emit the previous ADL value so the cumulative sum isn't
// poisoned by a single bad print.

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
 * @param {object} [_params] No tunables — accepted for registry uniformity.
 * @returns {IndicatorPoint[]}
 */
export function calcADL(candles, _params) {
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    let adl = 0;
    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const h = c && c.high;
        const l = c && c.low;
        const cl = c && c.close;
        const v = c && c.volume;
        const range = (typeof h === 'number' && typeof l === 'number') ? h - l : NaN;
        const okPrice = typeof h === 'number' && Number.isFinite(h) &&
                        typeof l === 'number' && Number.isFinite(l) &&
                        typeof cl === 'number' && Number.isFinite(cl);
        const okVol = typeof v === 'number' && Number.isFinite(v);
        if (okPrice && okVol && range !== 0) {
            const mfm = ((cl - l) - (h - cl)) / range;
            adl += mfm * v;
        }
        // else: carry adl forward unchanged.
        out[i] = { time: c.time, value: adl };
    }
    return out;
}
