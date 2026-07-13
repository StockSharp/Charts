// Endpoint Moving Average (EPMA).
// Port of StockSharp Algo.Indicators EndpointMovingAverage.cs.
// Default `length` is 10. The indicator buffers the most recent `length`
// input prices (close, by default) and emits the .cs formula:
//   firstPoint = oldest in buffer
//   lastPoint  = newest in buffer
//   slope = (lastPoint - firstPoint) / (length - 1)
//   epma  = firstPoint + slope * (length - 1)
//
// .cs deviation note: the algebraic simplification of the .cs body
// is `epma == lastPoint`, i.e. the indicator effectively returns the
// current close once the warm-up window is filled. We intentionally do
// NOT short-circuit to `lastPoint` — we replicate the formula verbatim
// so any future fix in StockSharp (e.g. switching to a real linear-
// regression endpoint à la LinearReg.cs) can land here without a
// behavioural change in the meantime. If you want the "true" EPMA
// (regression endpoint) use ForecastOscillator's underlying LinearReg.

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
export function calcEndpointMovingAverage(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 10;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    if (length <= 0) return out;
    if (length === 1) {
        // Degenerate: divisor (length-1) is zero. Match the .cs behaviour
        // which would crash on div-by-zero; we emit null to stay safe.
        return out;
    }

    for (let i = length - 1; i < n; i++) {
        const first = candles[i - length + 1] && candles[i - length + 1].close;
        const last = candles[i] && candles[i].close;
        if (typeof first !== 'number' || !Number.isFinite(first) ||
            typeof last !== 'number' || !Number.isFinite(last)) {
            continue;
        }
        const slope = (last - first) / (length - 1);
        const epma = first + slope * (length - 1);
        out[i] = { time: candles[i].time, value: epma };
    }
    return out;
}
