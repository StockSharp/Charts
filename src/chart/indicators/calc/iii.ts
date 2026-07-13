// Intraday Intensity Index (III).
// Port of StockSharp Algo.Indicators IntradayIntensityIndex.cs.
//
// Per-bar raw III:
//   denom = (high - low) * volume
//   iii   = denom != 0 ? 2 * ((close - low) - (high - close)) / denom : 0
// The class subclasses SimpleMovingAverage(Length=14), so the published value
// is SMA(iii, length). First (length-1) outputs are null (SMA warm-up).
//
// .cs deviation notes:
// (a) When (high-low)*volume is zero (e.g. flat doji or zero volume), the .cs
//     emits 0 for the raw III for that bar — still pushed into the SMA
//     window. We mirror that (no null propagation on zero denom).
// (b) Volume — the .cs reads candle.TotalVolume. We use candles[i].volume,
//     defaulting to 0 if missing. Missing volume effectively zeroes the
//     denom and forces that bar's iii to 0.

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
export function calcIntradayIntensityIndex(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 14;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    if (length <= 0) return out;

    const raw = new Array(n);
    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const h = c && c.high;
        const l = c && c.low;
        const cl = c && c.close;
        const v = c && typeof c.volume === 'number' && Number.isFinite(c.volume) ? c.volume : 0;
        if (typeof h !== 'number' || !Number.isFinite(h) ||
            typeof l !== 'number' || !Number.isFinite(l) ||
            typeof cl !== 'number' || !Number.isFinite(cl)) {
            raw[i] = NaN;
            continue;
        }
        const denom = (h - l) * v;
        raw[i] = denom !== 0 ? (2 * ((cl - l) - (h - cl))) / denom : 0;
    }

    // SMA(raw, length) — bars before length-1 stay null; any NaN in the
    // window invalidates that output slot.
    for (let i = length - 1; i < n; i++) {
        let sum = 0;
        let bad = false;
        for (let k = i - length + 1; k <= i; k++) {
            const r = raw[k];
            if (!Number.isFinite(r)) { bad = true; break; }
            sum += r;
        }
        if (bad) continue;
        out[i] = { time: candles[i].time, value: sum / length };
    }

    return out;
}
