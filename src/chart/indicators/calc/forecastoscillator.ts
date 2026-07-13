// Forecast Oscillator (FOSC).
// Port of StockSharp Algo.Indicators ForecastOscillator.cs.
//   forecast[i] = linear-regression endpoint over close[i-length+1 .. i]
//   FOSC[i]     = ((close[i] - forecast[i]) / close[i]) * 100
// Default `length` is 14 (matches the .cs constructor; the .cs class
// inherits LinearReg which itself defaults to 11, but ForecastOscillator
// overrides the constructor to 14).
//
// .cs deviation note: the .cs uses `var price = input.ToDecimal(Source)`
// which is the candle close by default. We follow that convention.
// The LinearReg endpoint is computed exactly as in LinearReg.cs:
//   slope = (L * Σxy - Σx * Σy) / (L * Σx² - (Σx)²)
//   intercept b = (Σy - slope * Σx) / L
//   forecast = slope * (L-1) + b   // value at the last x index
// where x = 0..L-1 and y = close[i-L+1..i].
//
// Warm-up: first non-null at index (length - 1) — same as LinearReg.
// When close[i] is zero or non-finite, FOSC is set to null to avoid
// the div-by-zero on the percent calculation (the .cs would throw).

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
export function calcForecastOscillator(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 14;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    if (length <= 1 || n < length) return out;

    // Precompute closes for fast access; mark non-finite as NaN.
    const closes = new Array(n);
    for (let i = 0; i < n; i++) {
        const c = candles[i] && candles[i].close;
        closes[i] = (typeof c === 'number' && Number.isFinite(c)) ? c : NaN;
    }

    // x = 0..length-1 → Σx and Σx² are constants.
    const sumX = (length * (length - 1)) / 2;
    const sumX2 = ((length - 1) * length * (2 * length - 1)) / 6;
    const divisor = length * sumX2 - sumX * sumX;

    for (let i = length - 1; i < n; i++) {
        let sumY = 0;
        let sumXy = 0;
        let bad = false;
        for (let j = 0; j < length; j++) {
            const y = closes[i - length + 1 + j];
            if (!Number.isFinite(y)) { bad = true; break; }
            sumY += y;
            sumXy += j * y;
        }
        if (bad) continue;

        let slope;
        if (divisor === 0) {
            slope = 0;
        } else {
            slope = (length * sumXy - sumX * sumY) / divisor;
        }
        const b = (sumY - slope * sumX) / length;
        const forecast = slope * (length - 1) + b;

        const price = closes[i];
        if (!Number.isFinite(price) || price === 0) continue;
        out[i] = { time: candles[i].time, value: ((price - forecast) / price) * 100 };
    }
    return out;
}
