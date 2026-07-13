// Detrended Price Oscillator (DPO).
// Port of StockSharp Algo.Indicators DetrendedPriceOscillator.cs:
//   lookBack = Length / 2 + 1     (integer division)
//   SMA      = SimpleMovingAverage(close, Length)
//   buffer   = circular history of SMA values (capacity = Length)
//             pushed only once SMA is formed
//   IsFormed = buffer.Count >= Length         // i.e. `Length` SMA values pushed
//   DPO[i]   = close[i] - buffer[max(0, count - 1 - lookBack)]
//            = close[i] - SMA[i - lookBack]   (once IsFormed)
//
// So DPO compares the *current* close to the SMA of a window centred on
// an earlier bar — it "detrends" the series by removing a delayed average.
// Note the closing price is NOT shifted: only the SMA reference is older.
//
// Default Length in StockSharp = 3 (kept here for parity). Warm-up:
//   * SMA forms at index `length - 1` (first push).
//   * Buffer needs `length` pushes to be formed → first valid DPO at
//     index `2 * length - 2`.
//
// Worked example (length=3, lookBack = 3/2+1 = 2):
//   i=2 → first SMA, push#1, buffer.Count=1, not formed.
//   i=3 → push#2, count=2, not formed.
//   i=4 → push#3, count=3, formed.
//          buffer[max(0, 3-1-2)] = buffer[0] = SMA[2]
//          DPO[4] = close[4] - SMA[2]   (SMA over close[0..2])

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
export function calcDPO(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 3;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };
    if (length <= 0) return out;

    // SMA of close, aligned to candle index (null until i >= length-1).
    const sma = new Array(n);
    for (let i = 0; i < n; i++) sma[i] = null;
    let sum = 0;
    let invalid = 0;
    for (let i = 0; i < n; i++) {
        const c = candles[i] && candles[i].close;
        const ok = typeof c === 'number' && Number.isFinite(c);
        if (ok) sum += c; else invalid++;
        if (i >= length) {
            const drop = candles[i - length] && candles[i - length].close;
            const dropOk = typeof drop === 'number' && Number.isFinite(drop);
            if (dropOk) sum -= drop; else invalid--;
        }
        if (i >= length - 1) {
            sma[i] = invalid === 0 ? sum / length : null;
        }
    }

    const lookBack = ((length / 2) | 0) + 1;
    // .cs buffer has capacity = Length and only receives pushes once SMA
    // is formed. IsFormed when buffer.Count >= Length, which happens at
    // candle index `2*length - 2` (length-1 to first-push, then length
    // pushes). After that, buffer[max(0, count-1-lookBack)] = the SMA
    // value pushed `lookBack` bars ago = SMA at candle index `i - lookBack`.
    const firstValidIdx = 2 * length - 2;
    for (let i = firstValidIdx; i < n; i++) {
        const target = i - lookBack;
        if (target < 0) continue; // shouldn't happen for i >= 2*length-2 with lookBack <= length
        const ref = sma[target];
        const cl = candles[i] && candles[i].close;
        if (ref === null || typeof cl !== 'number' || !Number.isFinite(cl)) continue;
        out[i] = { time: candles[i].time, value: cl - ref };
    }
    return out;
}
