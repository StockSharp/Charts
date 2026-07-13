// MACD with explicit Signal line — standalone variant.
// Port of StockSharp Algo.Indicators MovingAverageConvergenceDivergenceSignal.cs.
//
// The .cs is a BaseComplexIndicator that composes:
//   * inner MovingAverageConvergenceDivergence
//       (LongMa = EMA Length=26, ShortMa = EMA Length=12)
//   * inner ExponentialMovingAverage (Length=9) over the MACD line
// and emits a 2-value composite: { macd, signal } via
// IMovingAverageConvergenceDivergenceSignalValue.
//
// We re-use calcMACD which already produces { macd, signal, histogram }
// with identical math (EMA seeded via SMA), but expose a narrower shape
// here matching the .cs's composite output (no histogram):
//   { macd: IndicatorPoint[], signal: IndicatorPoint[] }
//
// Parameter names follow the .cs property tree (Macd.LongMa.Length,
// Macd.ShortMa.Length, SignalMa.Length). Defaults: long=26, short=12,
// signal=9.

import { calcMACD } from './macd.js';

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
 * @typedef {{macd: IndicatorPoint[], signal: IndicatorPoint[]}} MACDSignalSeries
 */

/**
 * @param {CandlePoint[]} candles
 * @param {{longLength?: number, shortLength?: number, signalLength?: number}} [params]
 * @returns {MACDSignalSeries}
 */
export function calcMovingAverageConvergenceDivergenceSignal(candles, params) {
    const longLength = params && Number.isFinite(params.longLength) ? (params.longLength | 0) : 26;
    const shortLength = params && Number.isFinite(params.shortLength) ? (params.shortLength | 0) : 12;
    const signalLength = params && Number.isFinite(params.signalLength) ? (params.signalLength | 0) : 9;

    if (!Array.isArray(candles) || candles.length === 0) {
        return { macd: [], signal: [] };
    }

    // calcMACD's parameter names map: fastLength = short EMA, slowLength = long EMA.
    const m = calcMACD(candles, {
        fastLength: shortLength,
        slowLength: longLength,
        signalLength,
    });
    return { macd: m.macd, signal: m.signal };
}

