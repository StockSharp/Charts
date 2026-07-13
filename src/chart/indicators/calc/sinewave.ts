// Sine Wave — JS port of D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\SineWave.cs.
//
// Two synthetic sine curves driven by bar index (NOT by price):
//   main[i] = sin(2*pi * i / Length)
//   lead[i] = sin(2*pi * (i + 0.5) / Length)
// IsFormed when `_currentBar >= Length`, but both inner lines emit the value
// every step — there is no warm-up gating in the output value itself, only in
// IsFormed. We mirror that: emit values from index 0.
// Deviations from .cs: none — same indices, same period.
//
// @typedef {{time:number|string,open:number,high:number,low:number,close:number,volume:number}} Candle
// @typedef {{time:number|string,value:number|null}} Point

/**
 * @param {Candle[]} candles
 * @param {{length?: number}} [params]
 * @returns {{sine: Point[], leadsine: Point[]}}
 */
export function calcSineWave(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 14;

    if (!Array.isArray(candles) || candles.length === 0) {
        return { sine: [], leadsine: [] };
    }

    const n = candles.length;
    const sine = new Array(n);
    const leadsine = new Array(n);
    const safeLen = length < 1 ? 1 : length;
    const twoPi = 2 * Math.PI;

    for (let i = 0; i < n; i++) {
        const t = candles[i] && candles[i].time;
        sine[i] = { time: t, value: Math.sin(twoPi * i / safeLen) };
        leadsine[i] = { time: t, value: Math.sin(twoPi * (i + 0.5) / safeLen) };
    }
    return { sine, leadsine };
}
