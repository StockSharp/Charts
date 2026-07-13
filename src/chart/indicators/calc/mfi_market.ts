// Market Facilitation Index (Bill Williams) — (high - low) / volume per bar.
// Port of StockSharp Algo.Indicators MarketFacilitationIndex.cs.
//
// File name suffixed `_market` to disambiguate from MoneyFlowIndex (which
// reuses the MFI acronym). Calc fn is `calcMarketFacilitationIndex`.
//
// The .cs is a BaseIndicator that returns
//   candle.GetLength() / candle.TotalVolume
// where GetLength() = HighPrice - LowPrice. When TotalVolume == 0 the .cs
// returns an empty DecimalIndicatorValue (no value) — we map that to
// `value: null` to keep the chart series aligned 1:1 with the candle array.
// No warm-up window: IsFormed becomes true on the first final candle.

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
 * @param {object} [_params]  Unused; kept for signature parity.
 * @returns {IndicatorPoint[]}
 */
export function calcMarketFacilitationIndex(candles, _params) {
    if (!Array.isArray(candles) || candles.length === 0) return [];
    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const h = c && c.high;
        const l = c && c.low;
        const v = c && c.volume;
        const finite = typeof h === 'number' && Number.isFinite(h)
            && typeof l === 'number' && Number.isFinite(l)
            && typeof v === 'number' && Number.isFinite(v);
        let value: number | null = null;
        if (finite && v !== 0) {
            value = (h - l) / v;
        }
        out[i] = { time: c && c.time, value };
    }
    return out;
}
