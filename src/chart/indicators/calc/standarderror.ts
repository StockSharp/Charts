// Standard Error of Linear Regression — JS port of
// D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\StandardError.cs.
//
// Fits y = slope * x + intercept over the last `Length` close prices
// (x = 0..Length-1), then computes the residual standard error:
//   stderr[i] = sqrt( sum((y - yEst)^2) / (Length - 2) )
// Special cases (per .cs):
//   - Length == 2: returns 0 (line passes through both points exactly).
//   - Length == 1: not used; warm-up returns null.
// Warm-up: first (length-1) values null.
// Deviations from .cs: none — formula 1:1.
//
// @typedef {{time:number|string,open:number,high:number,low:number,close:number,volume:number}} Candle
// @typedef {{time:number|string,value:number|null}} Point

/**
 * @param {Candle[]} candles
 * @param {{length?: number}} [params]
 * @returns {Point[]}
 */
export function calcStandardError(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 10;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i] && candles[i].time, value: null };

    if (length <= 1) return out;

    for (let i = length - 1; i < n; i++) {
        let sumX = 0;
        let sumY = 0;
        let sumXY = 0;
        let sumX2 = 0;
        let bad = false;
        for (let k = 0; k < length; k++) {
            const v = candles[i - length + 1 + k] && candles[i - length + 1 + k].close;
            if (typeof v !== 'number' || !Number.isFinite(v)) { bad = true; break; }
            sumX += k;
            sumY += v;
            sumXY += k * v;
            sumX2 += k * k;
        }
        if (bad) continue;

        const divisor = length * sumX2 - sumX * sumX;
        const slope = divisor === 0 ? 0 : (length * sumXY - sumX * sumY) / divisor;
        const intercept = (sumY - slope * sumX) / length;

        if (length === 2) {
            out[i] = { time: candles[i].time, value: 0 };
            continue;
        }

        let sumErr2 = 0;
        for (let k = 0; k < length; k++) {
            const y = candles[i - length + 1 + k].close;
            const yEst = slope * k + intercept;
            const e = y - yEst;
            sumErr2 += e * e;
        }
        out[i] = { time: candles[i].time, value: Math.sqrt(sumErr2 / (length - 2)) };
    }
    return out;
}
