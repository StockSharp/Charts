// Balance of Power (BOP).
//   BOP[i] = (close - open) / (high - low)
// Range is naturally bounded [-1, +1] because close and open are clamped
// inside [low, high]; we still clamp defensively in case of malformed data.
//
// Flat-bar handling: when high == low the candle has no range —
// StockSharp's BalanceOfPower.cs returns an empty IIndicatorValue and
// does not advance IsFormed for that bar. We mirror that: emit `null` at
// that array position (the renderer / `_stripNulls` will skip it; the
// parity harness preserves expected blank rows so the row-by-row compare
// still aligns). Same applies to bars with non-finite OHLC. Result
// length always equals `candles.length`.

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
export function calcBalanceOfPower(candles, _params) {
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const o = c && c.open;
        const h = c && c.high;
        const l = c && c.low;
        const cl = c && c.close;
        if (typeof o !== 'number' || !Number.isFinite(o) ||
            typeof h !== 'number' || !Number.isFinite(h) ||
            typeof l !== 'number' || !Number.isFinite(l) ||
            typeof cl !== 'number' || !Number.isFinite(cl)) {
            out[i] = { time: c && c.time, value: null };
            continue;
        }
        const range = h - l;
        if (range === 0) {
            // Flat bar — undefined, no value emitted (matches .cs).
            out[i] = { time: c.time, value: null };
            continue;
        }
        let v = (cl - o) / range;
        if (v > 1) v = 1;
        else if (v < -1) v = -1;
        out[i] = { time: c.time, value: v };
    }
    return out;
}
