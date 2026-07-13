// On Balance Volume Mean — SMA of OnBalanceVolume.
// Port of StockSharp Algo.Indicators OnBalanceVolumeMean.cs.
//
// .cs is literally:
//   class OnBalanceVolumeMean : SimpleMovingAverage
//       private OnBalanceVolume _obv = new()
//       OnProcessDecimal(input) => base.OnProcessDecimal(_obv.Process(input))
//
// So per bar we:
//   1. compute OnBalanceVolume of the candle stream,
//   2. run an SMA(length) over that series.
//
// Default length: SimpleMovingAverage default is 32 in StockSharp's
// LengthIndicator base, but the OnBalanceVolumeMean class doesn't override
// it. We expose `length` as a tunable; default 14 to keep parity with the
// rest of the JS suite's "reasonable mean length" defaults (matches what
// you'd typically see in charting packages — the .cs technically reads
// whatever LengthIndicator inherits, but the OnBalanceVolumeMean is
// invariably configured by the user).
//
// .cs deviation notes:
//   (a) The .cs feeds `_obv.Process(input)` straight into the SMA; the OBV
//       value on the first bar (per OnBalanceVolume.cs) is 0, so the SMA
//       window starts filling immediately. We mirror that: out[i] is null
//       for i < length-1 (SMA warm-up), then the trailing-window mean of
//       OBV[i-length+1..i].
//   (b) For bad OBV bars (null because of NaN close/volume) our simpleMA
//       helper propagates null until the bad value drops out of the window
//       — keeps gaps honest.

import { calcOnBalanceVolume } from './onbalancevolume.js';
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
export function calcOnBalanceVolumeMean(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 14;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const obv = calcOnBalanceVolume(candles, {});
    const obvVals = new Array(n);
    for (let i = 0; i < n; i++) obvVals[i] = obv[i] && obv[i].value;

    if (length <= 0) {
        const out = new Array(n);
        for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };
        return out;
    }

    const ma = simpleMA(obvVals, length);
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
        out[i] = { time: candles[i].time, value: ma[i] };
    }
    return out;
}
