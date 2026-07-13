// Rainbow Charts — JS port of D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\RainbowCharts.cs.
//
// For Lines = N (default 10), .cs adds (N-1) SimpleMovingAverage sub-indicators
// of close, with lengths {2, 4, 6, ..., 2*(N-1)} (loop `for (i = 1; i < Lines;
// i++) AddInner(new SimpleMovingAverage { Length = i * 2 })`). The first inner
// is a length-2 SMA, not a copy of close. Series count therefore equals N - 1.
// Output keys: sma1 ... sma{N-1}.
// Deviations from .cs: none — formula and lengths are 1:1.
//
// @typedef {{time:number|string,open:number,high:number,low:number,close:number,volume:number}} Candle
// @typedef {{time:number|string,value:number|null}} Point

import { simpleMA as simpleMA_RC } from './helpers.js';

/**
 * @param {Candle[]} candles
 * @param {{lines?: number}} [params]
 * @returns {Object<string, Point[]>}
 */
export function calcRainbowCharts(candles, params) {
    const lines = params && Number.isFinite(params.lines) ? Math.max(1, params.lines | 0) : 10;

    if (!Array.isArray(candles) || candles.length === 0) {
        const empty = {};
        for (let i = 1; i < lines; i++) empty['sma' + i] = [];
        return empty;
    }

    const n = candles.length;
    const closes = new Array(n);
    for (let i = 0; i < n; i++) closes[i] = candles[i] && candles[i].close;

    const out = {};
    for (let k = 1; k < lines; k++) {
        const ma = simpleMA_RC(closes, k * 2);
        const series = new Array(n);
        for (let i = 0; i < n; i++) {
            series[i] = { time: candles[i].time, value: ma[i] };
        }
        out['sma' + k] = series;
    }
    return out;
}
