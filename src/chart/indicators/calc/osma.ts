// Oscillator of Moving Average (OMA / OsMA).
// Port of StockSharp Algo.Indicators OscillatorOfMovingAverage.cs.
//
// Formula:
//   shortMA = SMA(close, shortPeriod)
//   longMA  = SMA(close, longPeriod)
//   OMA[i]  = (shortMA[i] - longMA[i]) / longMA[i] * 100      (longMA != 0)
//           = 0                                                (longMA == 0)
//   null   if either SMA isn't formed yet.
//
// Defaults (per .cs ctor):
//   shortPeriod = 10
//   longPeriod  = 30
//
// Note this is NOT the MetaTrader-style "MACD oscillator histogram"
// (sometimes called OsMA = MACD - signal). It's literally `(SMA_short -
// SMA_long) / SMA_long * 100` — a percentage divergence between two SMAs.
//
// .cs deviation notes:
//   (a) The .cs uses `Source` (default Close). We hardcode close — same
//       as every other close-driven indicator in this calc layer.
//   (b) Warm-up: the .cs returns "empty" until both SMAs are formed. We
//       emit null there.

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
 * @param {{shortPeriod?: number, longPeriod?: number}} [params]
 * @returns {IndicatorPoint[]}
 */
export function calcOscillatorOfMovingAverage(candles, params) {
    const shortPeriod = params && Number.isFinite(params.shortPeriod) ? (params.shortPeriod | 0) : 10;
    const longPeriod = params && Number.isFinite(params.longPeriod) ? (params.longPeriod | 0) : 30;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    if (shortPeriod <= 0 || longPeriod <= 0) return out;

    const closes = new Array(n);
    for (let i = 0; i < n; i++) closes[i] = candles[i] && candles[i].close;

    const shortMa = simpleMA(closes, shortPeriod);
    const longMa = simpleMA(closes, longPeriod);

    for (let i = 0; i < n; i++) {
        const s = shortMa[i];
        const l = longMa[i];
        if (s === null || l === null) continue;
        if (l === 0) {
            out[i] = { time: candles[i].time, value: 0 };
        } else {
            out[i] = { time: candles[i].time, value: (s - l) / l * 100 };
        }
    }

    return out;
}
