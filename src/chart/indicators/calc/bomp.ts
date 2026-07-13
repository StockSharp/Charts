// Balance of Market Power (BMP) — SMA of per-bar power ratio.
// Port of StockSharp Algo.Indicators BalanceOfMarketPower.cs:
//
//   raw  = (volume == 0) ? 0 : (close - open) / max(high - low, 0.01)
//   bmp  = SMA(raw, Length)
//
// Defaults: Length=14. The 0.01 floor on (high-low) matches the .cs
// literal (`candle.HighPrice == candle.LowPrice ? 0.01m : ...`) — it
// prevents division by zero on degenerate bars where OHLC collapse.
//
// Note vs BalanceOfPower (already ported as balanceofpower.js): BOP
// emits the raw per-bar ratio, BMP emits the SMA of it. Also BMP zeroes
// out bars with no volume; BOP doesn't gate on volume.
//
// .cs deviation: none. Straight port. The 0.01 floor is .cs literal.

import { simpleMA } from './helpers.js';

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
export function calcBalanceOfMarketPower(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 14;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    if (length <= 0) return out;

    const raw = new Array(n);
    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const o = c && c.open;
        const h = c && c.high;
        const l = c && c.low;
        const cl = c && c.close;
        const v = c && c.volume;
        if (typeof o !== 'number' || !Number.isFinite(o) ||
            typeof h !== 'number' || !Number.isFinite(h) ||
            typeof l !== 'number' || !Number.isFinite(l) ||
            typeof cl !== 'number' || !Number.isFinite(cl)) {
            raw[i] = NaN; // propagates to null in simpleMA
            continue;
        }
        const vol = typeof v === 'number' && Number.isFinite(v) ? v : 0;
        if (vol === 0) {
            raw[i] = 0;
        } else {
            const range = h === l ? 0.01 : h - l;
            raw[i] = (cl - o) / range;
        }
    }

    const sma = simpleMA(raw, length);
    for (let i = 0; i < n; i++) {
        if (sma[i] === null) continue;
        out[i] = { time: candles[i].time, value: sma[i] };
    }
    return out;
}
