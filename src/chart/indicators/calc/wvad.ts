// Williams Variable Accumulation/Distribution — JS port of D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\WilliamsVariableAccumulationDistribution.cs.
// Cumulative: wvad[i] = wvad[i-1] + ((close - open) / (high - low)) * volume.
// If high == low the bar contributes 0. .cs has wvad start at 0.
//
// Deviations from .cs: none.
//
// @typedef {{time:number|string,open:number,high:number,low:number,close:number,volume:number}} Candle
// @typedef {{time:number|string,value:number|null}} Point

/**
 * @param {Candle[]} candles
 * @param {{}} [_params]
 * @returns {Point[]}
 */
export function calcWVAD(candles, _params) {
    if (!Array.isArray(candles) || candles.length === 0) return [];
    const n = candles.length;
    const out = new Array(n);
    let acc = 0;
    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const o = c && c.open, h = c && c.high, l = c && c.low, cl = c && c.close, v = c && c.volume;
        if (typeof o !== 'number' || !Number.isFinite(o) ||
            typeof h !== 'number' || !Number.isFinite(h) ||
            typeof l !== 'number' || !Number.isFinite(l) ||
            typeof cl !== 'number' || !Number.isFinite(cl) ||
            typeof v !== 'number' || !Number.isFinite(v)) {
            out[i] = { time: c.time, value: acc };
            continue;
        }
        const range = h - l;
        if (range !== 0) acc += (cl - o) / range * v;
        out[i] = { time: c.time, value: acc };
    }
    return out;
}
