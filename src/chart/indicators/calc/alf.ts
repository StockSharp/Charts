// Adaptive Laguerre Filter (ALF) — 4-stage Laguerre cascade.
// Port of StockSharp Algo.Indicators AdaptiveLaguerreFilter.cs:
//
//   gamma1 = 1 - gamma
//   l0 = gamma1 * price + gamma * l0_prev
//   l1 = -gamma * l0    + l0    + gamma * l1_prev
//   l2 = -gamma * l1    + l1    + gamma * l2_prev
//   l3 = -gamma * l2    + l2    + gamma * l3_prev
//   filt = (l0 + 2*l1 + 2*l2 + l3) / 6
//
// Initial l0..l3 = 0, so the filter emits a value from bar 0 (no NaN
// warm-up). The .cs sets IsFormed on the first bar where filt >= price,
// but that's only used to gate downstream consumers — the filter itself
// still produces a value every bar, so we emit a value at every index
// (no nulls except on non-finite input).
//
// Param: { gamma }, default 0.8. Must be strictly between 0 and 1 (the
// .cs throws ArgumentOutOfRangeException for values outside (0,1)); we
// clamp instead and emit all-nulls to fail closed if invalid.
//
// .cs deviation: none. Straight numeric port. The Source-price selector
// in .cs defaults to close on candle inputs — we use candle.close here.

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
 * @param {{gamma?: number}} [params]
 * @returns {IndicatorPoint[]}
 */
export function calcAdaptiveLaguerreFilter(candles, params) {
    const gamma = params && Number.isFinite(params.gamma) ? +params.gamma : 0.8;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    // .cs rejects gamma outside (0,1) — fail closed.
    if (!(gamma > 0 && gamma < 1)) return out;

    const gamma1 = 1 - gamma;
    let l0 = 0, l1 = 0, l2 = 0, l3 = 0;
    let formed = false;

    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const price = c && c.close;
        if (typeof price !== 'number' || !Number.isFinite(price)) {
            // Hold state, emit null.
            continue;
        }
        l0 = gamma1 * price + gamma * l0;
        l1 = -gamma * l0 + l0 + gamma * l1;
        l2 = -gamma * l1 + l1 + gamma * l2;
        l3 = -gamma * l2 + l2 + gamma * l3;

        const v = (l0 + 2 * l1 + 2 * l2 + l3) / 6;
        // StockSharp flips IsFormed on the first bar where filt >= price and reports
        // the earlier bars as not-formed (null); the filter state still advances.
        if (!formed && v >= price) formed = true;
        if (formed) out[i] = { time: c.time, value: v };
    }

    return out;
}
