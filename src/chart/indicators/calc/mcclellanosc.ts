// McClellan Oscillator.
// Port of StockSharp Algo.Indicators McClellanOscillator.cs.
//
// The .cs is a BaseIndicator with two fixed-length EMAs over the input
// value (close by default):
//   Ema19 = ExponentialMovingAverage { Length = 19 }
//   Ema39 = ExponentialMovingAverage { Length = 39 }
// Output:
//   oscillator = Ema19 - Ema39    once both EMAs are formed
// otherwise empty (null). EMA lengths are not exposed as parameters on
// the .cs class — they are hard-coded — so we keep the same defaults and
// only allow overriding via params for testability and dev-tweaks.
//
// .cs deviation note: the .cs reuses ExponentialMovingAverage which seeds
// its first value via SMA of the first `length` finite samples. We use
// the existing calcEMA which follows the same convention.

import { calcEMA } from './ema.js';

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
 * @param {{shortLength?: number, longLength?: number}} [params]
 * @returns {IndicatorPoint[]}
 */
export function calcMcClellanOscillator(candles, params) {
    const shortLength = params && Number.isFinite(params.shortLength) ? (params.shortLength | 0) : 19;
    const longLength = params && Number.isFinite(params.longLength) ? (params.longLength | 0) : 39;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const fast = calcEMA(candles, { length: shortLength });
    const slow = calcEMA(candles, { length: longLength });

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
        const a = fast[i] && fast[i].value;
        const b = slow[i] && slow[i].value;
        if (a === null || a === undefined || b === null || b === undefined) {
            out[i] = { time: candles[i].time, value: null };
        } else {
            out[i] = { time: candles[i].time, value: a - b };
        }
    }
    return out;
}
