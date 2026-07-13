// Donchian Channels indicator (Algo.Indicators/DonchianChannels.cs).
// Multi-output { upper, lower, middle }, aligned 1:1 with input candles.
//
//   upper[i]  = highestHigh(length)  over candles[i-length+1..i]
//   lower[i]  = lowestLow(length)    over candles[i-length+1..i]
//   middle[i] = (upper[i] + lower[i]) / 2
//
// .cs uses Highest & Lowest sub-indicators that fold high/low respectively
// once `Length` samples are seen — IsFormed at index `length - 1`. We mirror
// that: first (length-1) outputs are null, then the trailing-window max/min.
//
// Notes vs .cs:
//   * DonchianMiddle.cs reads UpperBand.GetCurrentValue() and
//     LowerBand.GetCurrentValue() and emits their average, so middle is
//     formed exactly when both bands are. We compute the same way; no
//     extra warm-up.
//   * Highest/Lowest in StockSharp operate on candle high/low (the
//     IndicatorIn(typeof(CandleIndicatorValue)) attribute on the parent).

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
 * @typedef {{upper: IndicatorPoint[], lower: IndicatorPoint[], middle: IndicatorPoint[]}} DonchianSeries
 */

/**
 * @param {CandlePoint[]} candles
 * @param {{length?: number}} [params]
 * @returns {DonchianSeries}
 */
export function calcDonchian(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 20;

    if (!Array.isArray(candles) || candles.length === 0) {
        return { upper: [], lower: [], middle: [] };
    }

    const n = candles.length;
    const upper = new Array(n);
    const lower = new Array(n);
    const middle = new Array(n);
    for (let i = 0; i < n; i++) {
        upper[i] = { time: candles[i].time, value: null };
        lower[i] = { time: candles[i].time, value: null };
        middle[i] = { time: candles[i].time, value: null };
    }
    if (length <= 0) return { upper, lower, middle };

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
        if (bad) continue;
        const t = candles[i].time;
        upper[i] = { time: t, value: hi };
        lower[i] = { time: t, value: lo };
        middle[i] = { time: t, value: (hi + lo) / 2 };
    }
    return { upper, lower, middle };
}
