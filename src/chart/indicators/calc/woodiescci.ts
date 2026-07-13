// Woodies CCI — JS port of D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\WoodiesCCI.cs.
// Composite indicator with two lines:
//   cci    = CCI(Length)              (default 14)
//   signal = SMA(cci, SMALength)      (default 6)
// .cs uses ComplexIndicatorModes.Sequence: the SMA receives the CCI value
// as input (i.e. SMA(cci)) only when CCI is formed. Warm-up: CCI emits
// from index Length-1; signal then emits from index Length-1 + SMALength-1.
//
// Deviations from .cs: none.
//
// @typedef {{time:number|string,open:number,high:number,low:number,close:number,volume:number}} Candle
// @typedef {{time:number|string,value:number|null}} Point

import { calcCCI } from './cci.js';

/**
 * @param {Candle[]} candles
 * @param {{length?: number, smaLength?: number}} [params]
 * @returns {{cci: Point[], signal: Point[]}}
 */
export function calcWoodiesCCI(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 14;
    const smaLength = params && Number.isFinite(params.smaLength) ? (params.smaLength | 0) : 6;

    if (!Array.isArray(candles) || candles.length === 0) {
        return { cci: [], signal: [] };
    }
    const n = candles.length;
    const cciSeries = calcCCI(candles, { length });

    const signal = new Array(n);
    for (let i = 0; i < n; i++) signal[i] = { time: candles[i].time, value: null };

    if (smaLength <= 0) return { cci: cciSeries, signal };

    // .cs Sequence mode: SMA is fed only when CCI is formed. Find first
    // index where CCI is non-null and run an SMA over the consecutive
    // non-null cci stream from that point.
    const cciValues: number[] = [];
    const cciIndices: number[] = [];
    for (let i = 0; i < n; i++) {
        if (cciSeries[i].value !== null) {
            cciValues.push(cciSeries[i].value);
            cciIndices.push(i);
        }
    }
    for (let k = smaLength - 1; k < cciValues.length; k++) {
        let s = 0;
        for (let j = k - smaLength + 1; j <= k; j++) s += cciValues[j];
        const i = cciIndices[k];
        signal[i] = { time: candles[i].time, value: s / smaLength };
    }
    return { cci: cciSeries, signal };
}
