// Elder Ray Index (Alexander Elder).
// Port of StockSharp Algo.Indicators ElderRay.cs: a complex indicator that
// composes BullPower and BearPower over the same EMA(length) of close.
//   BullPower[i] = high[i] - EMA(close, length)[i]
//   BearPower[i] = low[i]  - EMA(close, length)[i]
// Default `length` is 13 (matches the .cs constructor).
//
// .cs deviations: none of substance. The .cs class exposes the two sub-series
// through a complex IElderRayValue with `BullPower` / `BearPower` decimals.
// We mirror this by returning { bull: IndicatorPoint[], bear: IndicatorPoint[] }
// so both lines stay aligned 1:1 with candles[] (same shape as Alligator/Aroon).
// Both sub-series share the same EMA seed/warm-up — by reusing calcBullPower
// and calcBearPower we guarantee bit-identical EMA convention with the
// standalone Bull/Bear indicators in this folder.

import { calcBullPower } from './bullpower.js';
import { calcBearPower } from './bearpower.js';

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
 * @typedef {{bull: IndicatorPoint[], bear: IndicatorPoint[]}} ElderRaySeries
 */

/**
 * @param {CandlePoint[]} candles
 * @param {{length?: number}} [params]
 * @returns {ElderRaySeries}
 */
export function calcElderRay(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 13;

    if (!Array.isArray(candles) || candles.length === 0) {
        return { bull: [], bear: [] };
    }

    const bull = calcBullPower(candles, { length });
    const bear = calcBearPower(candles, { length });
    return { bull, bear };
}
