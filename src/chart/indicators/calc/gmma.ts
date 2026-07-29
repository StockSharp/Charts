// Guppy Multiple Moving Average (GMMA, Daryl Guppy).
// Port of StockSharp Algo.Indicators GuppyMultipleMovingAverage.cs.
//
// 12 EMAs of close price, split into "short-term trader" and "long-term
// investor" fans (exact lengths from the .cs):
//   short: 3, 5, 8, 10, 12, 15
//   long:  30, 35, 40, 45, 50, 60
//
// EMA in StockSharp seeds via SMA of the first `length` samples, then
// recurses with k = 2 / (length + 1). The first non-null value of each
// sub-line lands at index (length - 1).
//
// .cs deviation notes:
// (a) The .cs is a `BaseComplexIndicator` wrapping 12 EMAs in input
//     order — we mirror that ordering and emit `short[0..5]` for lengths
//     3, 5, 8, 10, 12, 15 and `long[0..5]` for 30, 35, 40, 45, 50, 60.
//     Both as ordered arrays.
// (b) Each inner EMA is constructed with default Source (close). We
//     reuse calcEMA which uses close too.
// (c) `IsFinal=false` (intra-bar) branch is not relevant: closed-bar batch.

import { calcEMA } from './ema.js';
import type { CandlePoint, IndicatorParams, IndicatorPoint } from './types.js';

export const GMMA_SHORT_LENGTHS = [3, 5, 8, 10, 12, 15];
export const GMMA_LONG_LENGTHS = [30, 35, 40, 45, 50, 60];

interface GuppySeries {
    short: IndicatorPoint[][];
    long: IndicatorPoint[][];
}

/**
 * `params` optionally carries { shortLengths?: number[], longLengths?: number[] }
 * for overriding the .cs defaults if a caller wants to surface a custom fan
 * in the UI.
 */
export function calcGMMA(candles: CandlePoint[], params?: IndicatorParams): GuppySeries {
    const shortLengths: number[] = (params && Array.isArray(params.shortLengths) && params.shortLengths.length > 0)
        ? params.shortLengths.map((x: number) => x | 0)
        : GMMA_SHORT_LENGTHS;
    const longLengths: number[] = (params && Array.isArray(params.longLengths) && params.longLengths.length > 0)
        ? params.longLengths.map((x: number) => x | 0)
        : GMMA_LONG_LENGTHS;

    if (!Array.isArray(candles) || candles.length === 0) {
        return {
            short: shortLengths.map(() => []),
            long: longLengths.map(() => []),
        };
    }

    return {
        short: shortLengths.map(len => calcEMA(candles, { length: len })),
        long: longLengths.map(len => calcEMA(candles, { length: len })),
    };
}

