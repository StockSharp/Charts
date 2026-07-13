// Linear Regression R-Squared — JS port of D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\LinearRegRSquared.cs.
// Deviations from .cs: none. Default Length = 10 per .cs (task spec mentions
// 11 but the C# constructor sets Length = 10 — we follow .cs).
//
// Per bar (when window of `length` closes is full):
//   x = 0..length-1, y = trailing closes.
//   slope = (length*Σxy - Σx*Σy) / (length*Σx² - Σx²)
//   intercept b = (Σy - slope*Σx) / length
//   y_avg = mean(y)
//   SS_tot = Σ(y - y_avg)²
//   SS_err = Σ(y - (slope*x + b))²
//   R² = 1 - SS_err / SS_tot  (returns 0 if SS_tot = 0)
//
// First (length-1) bars are null (warm-up).
//
// @typedef {{time:number|string,open:number,high:number,low:number,close:number,volume:number}} Candle
// @typedef {{time:number|string,value:number|null}} Point

/**
 * @param {Candle[]} candles
 * @param {{length?: number}} [params]
 * @returns {Point[]}
 */
export function calcLinearRegRSquared(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 10;
    if (!Array.isArray(candles) || candles.length === 0) return [];
    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };
    if (length <= 0) return out;

    for (let i = length - 1; i < n; i++) {
        // Gather trailing window of closes.
        let bad = false;
        const y = new Array(length);
        for (let k = 0; k < length; k++) {
            const cl = candles[i - length + 1 + k] && candles[i - length + 1 + k].close;
            if (typeof cl !== 'number' || !Number.isFinite(cl)) { bad = true; break; }
            y[k] = cl;
        }
        if (bad) continue;

        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        for (let x = 0; x < length; x++) {
            sumX += x;
            sumY += y[x];
            sumXY += x * y[x];
            sumX2 += x * x;
        }

        const divisor = length * sumX2 - sumX * sumX;
        const slope = divisor === 0 ? 0 : (length * sumXY - sumX * sumY) / divisor;
        const b = (sumY - slope * sumX) / length;
        const yAvg = sumY / length;

        let ssTot = 0, ssErr = 0;
        for (let x = 0; x < length; x++) {
            const yEst = slope * x + b;
            const dy = y[x] - yAvg;
            const dr = y[x] - yEst;
            ssTot += dy * dy;
            ssErr += dr * dr;
        }

        const r2 = ssTot === 0 ? 0 : 1 - ssErr / ssTot;
        out[i] = { time: candles[i].time, value: r2 };
    }

    return out;
}
