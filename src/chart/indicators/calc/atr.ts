// Average True Range (Welles Wilder, 1978) — matches StockSharp AverageTrueRange,
// which is a WilderMovingAverage over TrueRange.
//
// TrueRange (StockSharp TrueRange.cs):
//   TR[0] = high[0] - low[0]            (first candle: no prior close, just the range)
//   TR[i] = max(high[i] - low[i], |prevClose - high[i]|, |prevClose - low[i]|)  for i >= 1
// So the TR series starts at candle[0] — the previous JS port dropped TR[0], which shifted
// the whole ATR by one bar and drifted every value versus StockSharp.
//
// WilderMovingAverage seed/recursion (StockSharp WilderMovingAverage.cs): during the first
// `length` values it returns the cumulative mean (which equals the SMA of the first `length`
// TRs at the moment it forms), then Wilder recursion (prev * (length-1) + tr) / length.
//
// Warm-up: first non-null ATR lands at index `length - 1` (SMA seed of TR[0..length-1]).

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

// True range for candle i (null on any non-finite input). i===0 has no prior close.
function trueRange(candles, i) {
    const c = candles[i];
    const h = c && c.high;
    const l = c && c.low;
    if (typeof h !== 'number' || !Number.isFinite(h) || typeof l !== 'number' || !Number.isFinite(l))
        return null;
    if (i === 0)
        return h - l;
    const pc = candles[i - 1] && candles[i - 1].close;
    if (typeof pc !== 'number' || !Number.isFinite(pc))
        return null;
    return Math.max(h - l, Math.abs(pc - h), Math.abs(pc - l));
}

/**
 * @param {CandlePoint[]} candles
 * @param {{length?: number}} [params]
 * @returns {IndicatorPoint[]}
 */
export function calcATR(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 14;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    // Need `length` true ranges (candles 0..length-1) to seed.
    if (length <= 0 || n < length) return out;

    // Seed = SMA of TR[0..length-1]; the WilderMovingAverage forms at index length-1.
    let seedSum = 0;
    for (let i = 0; i < length; i++) {
        const tr = trueRange(candles, i);
        if (tr === null) return out;
        seedSum += tr;
    }

    let prevAtr = seedSum / length;
    out[length - 1] = { time: candles[length - 1].time, value: prevAtr };

    for (let i = length; i < n; i++) {
        const tr = trueRange(candles, i);
        if (tr === null) {
            // Gap in input: Wilder smoothing can't continue without a fresh seed.
            for (let j = i; j < n; j++) out[j] = { time: candles[j].time, value: null };
            return out;
        }
        prevAtr = (prevAtr * (length - 1) + tr) / length;
        out[i] = { time: candles[i].time, value: prevAtr };
    }
    return out;
}
