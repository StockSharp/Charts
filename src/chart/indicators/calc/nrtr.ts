// Nick Rypock Trailing Reverse (Algo.Indicators/NickRypockTrailingReverse.cs).
//
// Stateful trailing-reverse line. The state machine carries:
//   k          — adaptive "step" amount, smoothed by length and multiplied
//                by the multiplication factor each bar
//   reverse    — the reversal line (output value)
//   trend      — current trend sign (+1 up / -1 down / 0 unknown)
//   highPrice  — running max of price in the current up-trend
//   lowPrice   — running min of price in the current down-trend
//
// Initialisation on the very first input (price == p0):
//   k = p0, highPrice = p0, lowPrice = p0
//
// Per-bar update:
//   k = (k + (price - k) / length) * multiple
//   newTrend = 0
//   if (trend >= 0):
//       if price > highPrice: highPrice = price
//       reverse = highPrice - k
//       if price <= reverse: newTrend = -1; lowPrice = price; reverse = lowPrice + k
//       else:               newTrend = +1
//   if (trend <= 0):
//       if price < lowPrice: lowPrice = price
//       reverse = lowPrice + k
//       if price >= reverse: newTrend = +1; highPrice = price; reverse = highPrice - k
//       else:               newTrend = -1
//   if newTrend != 0: trend = newTrend
//   return reverse
//
// Note: when `trend == 0` (only the very first bar) both branches run, and
// because `newTrend != 0` after each branch the second branch overwrites
// the first. The final `trend` and `reverse` are whatever the second branch
// produced.
//
// Parameters:
//   length   — period for the smoothing of k (default 50)
//   multiple — multiplication factor in *thousandths* (default 100, i.e.
//              internally scaled to 0.1). The .cs clamps `multiple <= 1` up
//              to 1, then divides by 1000; we do the same.
//
// .cs deviation: none. We emit a value for every bar (the .cs always
// returns _reverse, even before "formation" — DecimalLengthIndicator's
// `IsFormed` only flips after Buffer fills, but the .cs returns the value
// regardless of formation).

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
 * @param {{length?: number, multiple?: number}} [params]
 *   `multiple` is in thousandths (.cs convention). Default 100 ⇒ 0.1.
 *   Values <= 1 are clamped to 1 (per .cs setter).
 * @returns {IndicatorPoint[]}
 */
export function calcNickRypockTrailingReverse(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 50;
    let multipleRaw = params && Number.isFinite(params.multiple) ? params.multiple : 100;
    if (multipleRaw <= 1) multipleRaw = 1;
    const multiple = multipleRaw / 1000;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    if (length <= 0) {
        for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };
        return out;
    }

    let initialized = false;
    let k = 0;
    let reverse = 0;
    let price = 0;
    let highPrice = 0;
    let lowPrice = 0;
    let newTrend = 0;
    let trend = 0;

    for (let i = 0; i < n; i++) {
        const p = candles[i] && candles[i].close;
        if (typeof p !== 'number' || !Number.isFinite(p)) {
            out[i] = { time: candles[i].time, value: null };
            continue;
        }
        if (!initialized) {
            k = p;
            highPrice = p;
            lowPrice = p;
            initialized = true;
        }
        price = p;
        k = (k + (price - k) / length) * multiple;
        newTrend = 0;

        if (trend >= 0) {
            if (price > highPrice) highPrice = price;
            reverse = highPrice - k;
            if (price <= reverse) {
                newTrend = -1;
                lowPrice = price;
                reverse = lowPrice + k;
            } else {
                newTrend = +1;
            }
        }
        if (trend <= 0) {
            if (price < lowPrice) lowPrice = price;
            reverse = lowPrice + k;
            if (price >= reverse) {
                newTrend = +1;
                highPrice = price;
                reverse = highPrice - k;
            } else {
                newTrend = -1;
            }
        }
        if (newTrend !== 0) trend = newTrend;

        out[i] = { time: candles[i].time, value: reverse };
    }
    return out;
}
