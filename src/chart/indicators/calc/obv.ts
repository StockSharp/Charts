// On-Balance Volume (Joseph Granville).
// Port of StockSharp Algo.Indicators BalanceVolume.cs.
//
//   OBV[0] = null   (StockSharp's BalanceVolume.cs returns an empty
//                    IIndicatorValue on the first bar — no previous close
//                    to compare against — and starts the cumulative sum
//                    from bar 1.)
//   OBV[i] = OBV[i-1] + volume[i]   if close[i] > close[i-1]
//          = OBV[i-1] - volume[i]   if close[i] < close[i-1]
//          = OBV[i-1]               if close[i] == close[i-1]
//
// Bad bars (non-finite close or volume): emit null and keep the running
// sum + previous-close marker unchanged so the line resumes cleanly.

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
export function calcOBV(candles, _params) {
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    let cum = 0;
    let prevClose: number | null = null;
    let seeded = false; // mirrors `_prevClose == 0` check in .cs

    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const cl = c && c.close;
        const v = c && c.volume;
        const okClose = typeof cl === 'number' && Number.isFinite(cl);
        const okVol = typeof v === 'number' && Number.isFinite(v);

        if (!seeded) {
            // First valid bar seeds prevClose and emits null (no cumulative value yet).
            if (okClose) {
                prevClose = cl;
                seeded = true;
            }
            out[i] = { time: c && c.time, value: null };
            continue;
        }

        if (!okClose || !okVol) {
            // Carry forward without updating cum / prevClose.
            out[i] = { time: c && c.time, value: null };
            continue;
        }

        if (prevClose !== null) {
            if (cl > prevClose) cum += v;
            else if (cl < prevClose) cum -= v;
        }
        // equal → no change

        prevClose = cl;
        out[i] = { time: c.time, value: cum };
    }
    return out;
}
