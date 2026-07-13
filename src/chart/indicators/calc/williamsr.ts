// Williams %R (Larry Williams) — momentum oscillator scaled to -100..0.
//   %R[i] = -100 * (highestHigh(N) - close[i]) / (highestHigh(N) - lowestLow(N))
// where N == `length` and the window is the last N bars ending at i.
// Null until index `length-1` (warm-up). When highestHigh == lowestLow over
// the window (perfectly flat), the formula is undefined — we emit -100
// (bottom of range) to mirror what StockSharp's WilliamsRange does and
// keep the series numerically meaningful for charting.

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
export function calcWilliamsR(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 14;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    if (length <= 0) return out;

    for (let i = length - 1; i < n; i++) {
        let hi = -Infinity;
        let lo = +Infinity;
        let bad = false;
        for (let j = i - length + 1; j <= i; j++) {
            const c = candles[j];
            const h = c && c.high;
            const l = c && c.low;
            if (typeof h !== 'number' || !Number.isFinite(h) ||
                typeof l !== 'number' || !Number.isFinite(l)) { bad = true; break; }
            if (h > hi) hi = h;
            if (l < lo) lo = l;
        }
        const close = candles[i] && candles[i].close;
        if (bad || typeof close !== 'number' || !Number.isFinite(close)) {
            out[i] = { time: candles[i].time, value: null };
            continue;
        }
        const range = hi - lo;
        let v;
        if (range === 0) {
            // Flat window — formula undefined; emit bottom of range (-100).
            v = -100;
        } else {
            v = -100 * (hi - close) / range;
        }
        out[i] = { time: candles[i].time, value: v };
    }
    return out;
}
