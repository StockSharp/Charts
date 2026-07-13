// Force Index (Alexander Elder).
//   raw[i]   = (close[i] - close[i-1]) * volume[i]      for i >= 1
//   force[i] = EMA(raw, length)[i]
// Default `length` is 13.
//
// Source mapping: StockSharp ships TWO functionally identical classes in
// Algo.Indicators:
//   • ForceIndex.cs       (LocalizedStrings "FI" / "ForceIndex")
//   • ElderForceIndex.cs  (LocalizedStrings "ElderForceIndex")
// Both inherit ExponentialMovingAverage, both default Length=13, and both
// compute exactly `(close - prevClose) * volume` then run that scalar
// through the base EMA pipeline. The only daylight between them is the
// order of `_prevClose` updates inside OnProcess — but for IsFinal=true
// inputs (which is all we ever see in our batch port) the resulting
// series are identical bar-for-bar. We treat ForceIndex.cs as the
// canonical implementation and expose ElderForceIndex as an alias
// pointing at the same code (matches the way the .cs class names are
// used interchangeably in the StockSharp docs).
//
// EMA convention: SMA-seeded over the first `length` finite raw values
// (matches calcEMA / calcBullPower / calcBearPower in this folder).
// First (length) raw samples exist starting at i=1, so the first
// non-null Force Index output lands at index `length`.

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
export function calcForceIndex(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 13;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    if (length <= 0 || n < length + 1) return out;

    // Build the raw force series. raw[0] is undefined (no prev close), so it
    // is excluded; the first usable raw lands at i=1.
    const raw = new Array(n);
    raw[0] = NaN;
    for (let i = 1; i < n; i++) {
        const c = candles[i] && candles[i].close;
        const cp = candles[i - 1] && candles[i - 1].close;
        const v = candles[i] && candles[i].volume;
        if (typeof c !== 'number' || !Number.isFinite(c) ||
            typeof cp !== 'number' || !Number.isFinite(cp) ||
            typeof v !== 'number' || !Number.isFinite(v)) {
            raw[i] = NaN;
        } else {
            raw[i] = (c - cp) * v;
        }
    }

    // EMA over raw[1..]. SMA-seed using the first `length` finite samples.
    let seedSum = 0;
    let seedCount = 0;
    let seedDone = false;
    let prev = 0;
    const k = 2 / (length + 1);

    for (let i = 1; i < n; i++) {
        const r = raw[i];
        const ok = typeof r === 'number' && Number.isFinite(r);
        if (!seedDone) {
            if (!ok) continue;
            seedSum += r;
            seedCount++;
            if (seedCount === length) {
                prev = seedSum / length;
                out[i] = { time: candles[i].time, value: prev };
                seedDone = true;
            }
            continue;
        }
        if (!ok) {
            // Hold previous EMA; emit null for this bar.
            out[i] = { time: candles[i].time, value: null };
            continue;
        }
        prev = r * k + prev * (1 - k);
        out[i] = { time: candles[i].time, value: prev };
    }
    return out;
}

// Alias — ElderForceIndex.cs is functionally identical to ForceIndex.cs
// (both default Length=13, both compute (close - prevClose) * volume then EMA).
export const calcElderForceIndex = calcForceIndex;
