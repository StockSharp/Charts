// SuperTrend — JS port of D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\SuperTrend.cs.
//
// Trailing stop based on ATR(length) with multiplier:
//   hl2          = (high + low) / 2
//   basicUpper   = hl2 + multiplier * atr
//   basicLower   = hl2 - multiplier * atr
//   finalUpper   = (prevUpper is null OR basicUpper < prevUpper OR prevClose > prevUpper)
//                    ? basicUpper : prevUpper
//   finalLower   = (prevLower is null OR basicLower > prevLower OR prevClose < prevLower)
//                    ? basicLower : prevLower
//   first formed bar:
//     supertrend = close >= hl2 ? finalLower : finalUpper
//     trend      = close >= hl2 ? +1 : -1
//   subsequent bars:
//     if prev trend == +1:
//        supertrend = close <= finalLower ? finalUpper : finalLower
//        trend      = close <= finalLower ? -1 : +1
//     else:
//        supertrend = close >= finalUpper ? finalLower : finalUpper
//        trend      = close >= finalUpper ? +1 : -1
//
// Output keys: value (supertrend line) and direction (+1 / -1).
// Warm-up: until ATR is formed (index < length), both null/0. First formed
// bar is at index `length` (same as ATR; see atr.js header for the seed
// rationale).
// Deviations from .cs: none — direct 1:1 port.
//
// @typedef {{time:number|string,open:number,high:number,low:number,close:number,volume:number}} Candle
// @typedef {{time:number|string,value:number|null}} Point

import { csATR } from './helpers.js';

/**
 * @param {Candle[]} candles
 * @param {{length?: number, multiplier?: number}} [params]
 * @returns {{value: Point[], direction: Point[]}}
 */
export function calcSuperTrend(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 10;
    const multiplier = params && Number.isFinite(params.multiplier) ? +params.multiplier : 3;

    if (!Array.isArray(candles) || candles.length === 0) {
        return { value: [], direction: [] };
    }

    const n = candles.length;
    const value = new Array(n);
    const direction = new Array(n);
    for (let i = 0; i < n; i++) {
        const t = candles[i] && candles[i].time;
        value[i] = { time: t, value: null };
        direction[i] = { time: t, value: null };
    }

    const atr = csATR(candles, length);

    let prevUpper: number | null = null;
    let prevLower: number | null = null;
    let prevClose: number | null = null;
    let prevSupertrend: number | null = null;
    let prevTrend = 0;

    // SuperTrend only emits once ATR.IsFormed = true, which happens at bar
    // length-1 (when the WilderMovingAverage buffer has accumulated `length`
    // TR samples; TR[0] is the high-low seed). csATR returns non-null from
    // bar 0 already (partial cumulative average), so gate explicitly.
    const atrFormedFrom = length - 1;

    for (let i = 0; i < n; i++) {
        if (i < atrFormedFrom) continue;
        const c = candles[i];
        if (!c) continue;
        const close = c.close;
        const high = c.high;
        const low = c.low;
        const a = atr[i] && atr[i].value;

        if (typeof close !== 'number' || !Number.isFinite(close) ||
            typeof high !== 'number' || !Number.isFinite(high) ||
            typeof low !== 'number' || !Number.isFinite(low) ||
            a === null || typeof a !== 'number' || !Number.isFinite(a)) {
            continue;
        }

        const hl2 = (high + low) / 2;
        const basicUpper = hl2 + multiplier * a;
        const basicLower = hl2 - multiplier * a;

        const finalUpper = (prevUpper === null || basicUpper < prevUpper ||
                           (prevClose !== null && prevClose > prevUpper))
            ? basicUpper
            : prevUpper;

        const finalLower = (prevLower === null || basicLower > prevLower ||
                           (prevClose !== null && prevClose < prevLower))
            ? basicLower
            : prevLower;

        let st;
        let trend;
        if (prevSupertrend === null) {
            st = close >= hl2 ? finalLower : finalUpper;
            trend = close >= hl2 ? 1 : -1;
        } else if (prevTrend === 1) {
            st = close <= finalLower ? finalUpper : finalLower;
            trend = close <= finalLower ? -1 : 1;
        } else {
            st = close >= finalUpper ? finalLower : finalUpper;
            trend = close >= finalUpper ? 1 : -1;
        }

        value[i] = { time: c.time, value: st };
        direction[i] = { time: c.time, value: trend };

        prevUpper = finalUpper;
        prevLower = finalLower;
        prevClose = close;
        prevSupertrend = st;
        prevTrend = trend;
    }

    return { value, direction };
}
