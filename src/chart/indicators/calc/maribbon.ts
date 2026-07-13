// Moving Average Ribbon.
// Port of StockSharp Algo.Indicators MovingAverageRibbon.cs.
//
// The .cs builds `RibbonCount` SimpleMovingAverage inner indicators with
// lengths spaced as:
//   step = (LongPeriod - ShortPeriod) / (RibbonCount - 1)         // int division
//   lengths[i] = ShortPeriod + i * step      for i in [0..RibbonCount-1)
// Defaults: ShortPeriod=10, LongPeriod=100, RibbonCount=10
//   → step = (100-10)/9 = 10, lengths = [10,20,30,40,50,60,70,80,90,100]
//
// NB: the .cs uses C# integer division for `step`, which can leave the
// last entry below LongPeriod (e.g. Short=10, Long=99, Count=10 → step=9,
// lengths = [10,19,28,37,46,55,64,73,82,91]). We replicate that exactly.
//
// `Reset()` enforces RibbonCount >= 2 and Short/Long >= 1 — we mirror with
// `throw new Error()` on invalid params to fail loudly during dev (the
// renderer should never feed bad params, but tests can hit it).
//
// Output shape:
//   { lengths: number[], averages: IndicatorPoint[][] }
// where averages[i] is the SMA series for lengths[i]. Each series has
// length == candles.length; first (lengths[i] - 1) entries are null.

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
 * @typedef {{lengths: number[], averages: IndicatorPoint[][]}} MARibbonSeries
 */

/**
 * @param {CandlePoint[]} candles
 * @param {{shortPeriod?: number, longPeriod?: number, ribbonCount?: number}} [params]
 * @returns {MARibbonSeries}
 */
export function calcMovingAverageRibbon(candles, params) {
    const shortPeriod = params && Number.isFinite(params.shortPeriod) ? (params.shortPeriod | 0) : 10;
    const longPeriod = params && Number.isFinite(params.longPeriod) ? (params.longPeriod | 0) : 100;
    const ribbonCount = params && Number.isFinite(params.ribbonCount) ? (params.ribbonCount | 0) : 10;

    if (shortPeriod < 1) throw new Error('shortPeriod must be >= 1');
    if (longPeriod < 1) throw new Error('longPeriod must be >= 1');
    if (ribbonCount < 2) throw new Error('ribbonCount must be >= 2');

    // C# integer division (positive operands here): truncate toward zero.
    const step = ((longPeriod - shortPeriod) / (ribbonCount - 1)) | 0;
    const lengths = new Array(ribbonCount);
    for (let i = 0; i < ribbonCount; i++) lengths[i] = shortPeriod + i * step;

    if (!Array.isArray(candles) || candles.length === 0) {
        return { lengths, averages: lengths.map(() => []) };
    }

    const n = candles.length;
    const closes = new Array(n);
    for (let i = 0; i < n; i++) closes[i] = candles[i] && candles[i].close;

    const averages = new Array(ribbonCount);
    for (let s = 0; s < ribbonCount; s++) {
        const ma = simpleMA(closes, lengths[s]);
        const series = new Array(n);
        for (let i = 0; i < n; i++) series[i] = { time: candles[i].time, value: ma[i] };
        averages[s] = series;
    }
    return { lengths, averages };
}
