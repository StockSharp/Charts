// Mass Index (Algo.Indicators/MassIndex.cs).
//
// Formula (default emaLength=9, length=25):
//   range[i]      = high[i] - low[i]
//   singleEma[i]  = EMA(range, emaLength) [StockSharp-style, SMA-seeded]
//   doubleEma[i]  = EMA(singleEma, emaLength)
//   ratio[i]      = singleEma[i] / doubleEma[i]      (once doubleEma is formed)
//   mass[i]       = sum of ratio over the trailing `length` values once Sum forms
//
// The reference C# uses Algo.Indicators/ExponentialMovingAverage which during
// its warm-up window returns `Buffer.Sum / Length` (partial SMA, NOT the more
// common null/undefined). Those partial values are still pushed into the
// downstream doubleEma's buffer, so to match the .cs output exactly we
// replicate this partial-SMA-during-warmup behaviour. After both EMAs are
// formed, the standard EMA recursion `(price - prev) * k + prev` (k=2/(N+1))
// drives the rest.
//
// Output is null until the Sum has accumulated `length` ratio samples, i.e.
// first non-null at candle index (emaLength + emaLength - 1) + (length - 1)
// = 2*emaLength + length - 2 (defaults: 2*9 + 25 - 2 = 41).
//
// Deviation vs .cs: none in steady-state math. The .cs intra-candle (non-final)
// path is not modelled — we treat every candle as final, which matches a
// closed-candle replay.

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
 * StockSharp-compatible EMA: returns Buffer.Sum/Length during warm-up
 * (partial SMA), Buffer.Sum/Length at warm-up complete (SMA seed), then
 * EMA recursion. Returns one value per input in `values`; entries where
 * the input value is not finite cause that slot to be null and break the
 * recursion (subsequent values restart warm-up).
 * @param {Array<number|null>} values
 * @param {number} length
 * @returns {{out: Array<number|null>, formedAt: Array<boolean>}}
 *   formedAt[i] is true once `length` finite samples have been seen and
 *   the EMA value is the SMA seed or later — i.e. IsFormed=true.
 */
function stockSharpEma(values, length) {
    const n = values.length;
    const out = new Array(n);
    const formedAt = new Array(n).fill(false);
    if (length <= 0) {
        for (let i = 0; i < n; i++) out[i] = null;
        return { out, formedAt };
    }
    const k = 2 / (length + 1);
    let bufferSum = 0;
    let bufferCount = 0;
    let prev: number | null = null;
    let formed = false;
    for (let i = 0; i < n; i++) {
        const v = values[i];
        if (typeof v !== 'number' || !Number.isFinite(v)) {
            out[i] = null;
            // .cs would crash on a non-finite input; we restart warm-up so
            // a single bad print doesn't poison the whole series.
            bufferSum = 0;
            bufferCount = 0;
            prev = null;
            formed = false;
            continue;
        }
        if (!formed) {
            bufferSum += v;
            bufferCount += 1;
            if (bufferCount === length) {
                prev = bufferSum / length;
                out[i] = prev;
                formed = true;
                formedAt[i] = true;
            } else {
                // .cs partial-SMA: Buffer.Sum / Length (not / Count).
                out[i] = bufferSum / length;
            }
        } else if (prev !== null) {
            const cur = (v - prev) * k + prev;
            prev = cur;
            out[i] = cur;
            formedAt[i] = true;
        }
    }
    return { out, formedAt };
}

/**
 * @param {CandlePoint[]} candles
 * @param {{length?: number, emaLength?: number}} [params]
 * @returns {IndicatorPoint[]}
 */
export function calcMassIndex(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 25;
    const emaLength = params && Number.isFinite(params.emaLength) ? (params.emaLength | 0) : 9;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
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

    const { out: singleEma, formedAt: singleFormed } = stockSharpEma(ranges, emaLength);
    // doubleEma is fed singleEma values (including its warm-up partial-SMA).
    const { out: doubleEma, formedAt: doubleFormed } = stockSharpEma(singleEma, emaLength);

    // Trailing sum of singleEma/doubleEma ratio, but only counted once both
    // EMAs are formed (which the C# guards via `_doubleEma.IsFormed`).
    const out = new Array(n);
    const ratios: number[] = [];
    let sumRatio = 0;
    let bothFormedSeen = 0;
    for (let i = 0; i < n; i++) {
        const sv = singleEma[i];
        const dv = doubleEma[i];
        let ratio: number | null = null;
        if (doubleFormed[i] && singleFormed[i] && sv !== null && dv !== null && dv !== 0) {
            ratio = sv / dv;
        }
        if (ratio !== null) {
            ratios.push(ratio);
            sumRatio += ratio;
            bothFormedSeen += 1;
            if (ratios.length > length) {
                sumRatio -= ratios.shift()!;
            }
        }
        if (bothFormedSeen >= length && ratios.length === length) {
            out[i] = { time: candles[i].time, value: sumRatio };
        } else {
            out[i] = { time: candles[i].time, value: null };
        }
    }
    return out;
}
