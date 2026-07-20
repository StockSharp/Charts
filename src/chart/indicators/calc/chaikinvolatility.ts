// Chaikin Volatility (Marc Chaikin).
// Port of StockSharp Algo.Indicators ChaikinVolatility.cs — a two-stage
// pipeline:
//   1. EMA over per-bar (high - low) with length `emaLength`.
//   2. Rate-of-change of that EMA with length `rocLength`:
//      CV[i] = (ema[i] - ema[i - rocLength]) / ema[i - rocLength] * 100
//
// The .cs constructs both inner indicators with `new()`, so they take their own
// StockSharp defaults: ExponentialMovingAverage.Length = 32 and RateOfChange
// (Momentum) default Length = 5. Match those here so the periods line up with the
// live C# (NumValuesToInitialize = 32 + 6 - 1 = 37 → first value at index 36).
//
// EMA uses calcEMA's seeding convention (SMA over first `emaLength` values), which
// equals the StockSharp EMA at its first formed bar. Output first non-null at index
// `emaLength + rocLength - 1`.

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
 * Local EMA over a (number|null)[] series. Seeded by SMA over the first
 * `length` finite values. Returns an array of (number|null), same length
 * as input. Any non-finite gap before seeding aborts the seed; after
 * seeding a non-finite value emits null at that position but keeps `prev`
 * intact for the next valid bar.
 * @param {(number|null)[]} values
 * @param {number} length
 * @returns {(number|null)[]}
 */
function emaSeries(values, length) {
    const n = values.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = null;
    if (length <= 0) return out;

    let seedSum = 0;
    let seedCount = 0;
    let seedDone = false;
    let prev = 0;
    const k = 2 / (length + 1);

    for (let i = 0; i < n; i++) {
        const v = values[i];
        const ok = typeof v === 'number' && Number.isFinite(v);
        if (!seedDone) {
            if (!ok) continue;
            seedSum += v;
            seedCount++;
            if (seedCount === length) {
                prev = seedSum / length;
                out[i] = prev;
                seedDone = true;
            }
            continue;
        }
        if (!ok) continue;
        prev = v * k + prev * (1 - k);
        out[i] = prev;
    }
    return out;
}

/**
 * @param {CandlePoint[]} candles
 * @param {{emaLength?: number, rocLength?: number}} [params]
 * @returns {IndicatorPoint[]}
 */
export function calcChaikinVolatility(candles, params) {
    const emaLength = params && Number.isFinite(params.emaLength) ? (params.emaLength | 0) : 32;
    const rocLength = params && Number.isFinite(params.rocLength) ? (params.rocLength | 0) : 5;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    if (emaLength <= 0 || rocLength <= 0) return out;

    // Stage 1: EMA over per-bar (high - low).
    const ranges = new Array(n);
    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const h = c && c.high;
        const l = c && c.low;
        if (typeof h === 'number' && Number.isFinite(h) &&
            typeof l === 'number' && Number.isFinite(l)) {
            ranges[i] = h - l;
        } else {
            ranges[i] = null;
        }
    }
    const ema = emaSeries(ranges, emaLength);

    // Stage 2: ROC across rocLength bars of the EMA series.
    //   ROC[i] = (ema[i] - ema[i - rocLength]) / ema[i - rocLength] * 100
    for (let i = rocLength; i < n; i++) {
        const cur = ema[i];
        const old = ema[i - rocLength];
        if (cur === null || old === null) continue;
        if (old === 0) continue; // divide-by-zero guard, matches ROC.cs (returns null)
        out[i] = { time: candles[i].time, value: (cur - old) / old * 100 };
    }
    return out;
}
