// Price Channels — JS port of D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\PriceChannels.cs.
// Deviations from .cs: none. Donchian-style upper/lower bands without a
// middle line.
//   upper[i] = max(high) over candles[i-length+1..i]
//   lower[i] = min(low)  over candles[i-length+1..i]
// First (length-1) bars are null on both series (warm-up window).
//
// @typedef {{time:number|string,open:number,high:number,low:number,close:number,volume:number}} Candle
// @typedef {{time:number|string,value:number|null}} Point
// @typedef {{upper: Point[], lower: Point[]}} PriceChannelsSeries

/**
 * @param {Candle[]} candles
 * @param {{length?: number}} [params]
 * @returns {PriceChannelsSeries}
 */
export function calcPriceChannels(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 20;
    if (!Array.isArray(candles) || candles.length === 0) {
        return { upper: [], lower: [] };
    }
    const n = candles.length;
    const upper = new Array(n);
    const lower = new Array(n);
    for (let i = 0; i < n; i++) {
        upper[i] = { time: candles[i].time, value: null };
        lower[i] = { time: candles[i].time, value: null };
    }
    if (length <= 0) return { upper, lower };

    for (let i = length - 1; i < n; i++) {
        let hi = -Infinity;
        let lo = +Infinity;
        let bad = false;
        for (let j = i - length + 1; j <= i; j++) {
            const c = candles[j];
            const h = c && c.high;
            const l = c && c.low;
            if (typeof h !== 'number' || !Number.isFinite(h)
                || typeof l !== 'number' || !Number.isFinite(l)) {
                bad = true;
                break;
            }
            if (h > hi) hi = h;
            if (l < lo) lo = l;
        }
        if (bad) continue;
        const t = candles[i].time;
        upper[i] = { time: t, value: hi };
        lower[i] = { time: t, value: lo };
    }
    return { upper, lower };
}
