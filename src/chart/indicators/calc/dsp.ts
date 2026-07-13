// Detrended Synthetic Price (DSP) indicator
// (Algo.Indicators/DetrendedSyntheticPrice.cs).
//
// Single-output. Midpoint of the trailing window:
//
//   DSP[i] = (highestHigh(length)[i] + lowestLow(length)[i]) / 2
//
// .cs uses Highest+Lowest sub-indicators (folded over high/low), so warm-up
// follows the Highest IsFormed semantics: first non-null at index `length - 1`.
//
// Note: despite the name "detrended synthetic price", the .cs implementation
// is literally `(highestHigh + lowestLow)/2` — i.e. it's the midpoint of the
// Donchian channel. It's identical to DonchianChannels.Middle modulo
// indicator wrapping. We port it verbatim — caller is responsible for using
// the right algorithm.

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
export function calcDSP(candles, params) {
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
        if (bad) continue;
        out[i] = { time: candles[i].time, value: (hi + lo) / 2 };
    }
    return out;
}
