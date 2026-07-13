// Median Price — (high + low) / 2 per bar.
// Port of StockSharp Algo.Indicators MedianPrice.cs.
//
// The .cs is a BaseIndicator that calls candle.GetMedianPrice(), which is
// `(HighPrice + LowPrice) / 2` (see Messages/Extensions.cs::GetMedianPrice).
// No warm-up window — IsFormed becomes true on the first final candle.
// Output is 1:1 with input candles. If high or low is non-finite we emit
// null for that bar (defensive — the .cs would still compute on whatever
// the candle exposes, but JS arrays can carry undefined / NaN).

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
 * @param {object} [_params]  Unused; kept for signature parity with other calcs.
 * @returns {IndicatorPoint[]}
 */
export function calcMedianPrice(candles, _params) {
    if (!Array.isArray(candles) || candles.length === 0) return [];
    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const h = c && c.high;
        const l = c && c.low;
        const ok = typeof h === 'number' && Number.isFinite(h)
            && typeof l === 'number' && Number.isFinite(l);
        out[i] = { time: c && c.time, value: ok ? (h + l) / 2 : null };
    }
    return out;
}
