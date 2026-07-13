// Stochastic %K — JS port of D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\StochasticK.cs.
//
// %K[i] = 100 * (close[i] - lowestLow(length)[i]) / (highestHigh(length)[i] - lowestLow(length)[i])
// If high == low across the window, .cs returns 0 (not 100 — see line
// `if (diff == 0) return 0;` in StochasticK.cs; note the full Stochastic
// oscillator returns 100 in that case, but StochasticK alone returns 0).
// Default Length = 14. Warm-up: first (length-1) values null.
// Deviations from .cs: none — formula 1:1 (including the flat-range fallback
// to 0, which differs from the StochasticOscillator companion class).
//
// @typedef {{time:number|string,open:number,high:number,low:number,close:number,volume:number}} Candle
// @typedef {{time:number|string,value:number|null}} Point

/**
 * @param {Candle[]} candles
 * @param {{length?: number}} [params]
 * @returns {Point[]}
 */
export function calcStochasticK(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 14;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i] && candles[i].time, value: null };

    if (length <= 0) return out;

    for (let i = length - 1; i < n; i++) {
        let lo = +Infinity;
        let hi = -Infinity;
        let bad = false;
        for (let j = i - length + 1; j <= i; j++) {
            const c = candles[j];
            const h = c && c.high;
            const l = c && c.low;
            if (typeof h !== 'number' || !Number.isFinite(h) ||
                typeof l !== 'number' || !Number.isFinite(l)) { bad = true; break; }
            if (l < lo) lo = l;
            if (h > hi) hi = h;
        }
        const close = candles[i] && candles[i].close;
        if (bad || typeof close !== 'number' || !Number.isFinite(close)) continue;

        const diff = hi - lo;
        if (diff === 0) {
            out[i] = { time: candles[i].time, value: 0 };
        } else {
            out[i] = { time: candles[i].time, value: 100 * (close - lo) / diff };
        }
    }
    return out;
}
