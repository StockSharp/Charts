// Historical Volatility Ratio (HVR).
// Port of StockSharp Algo.Indicators HistoricalVolatilityRatio.cs.
//
// HVR = StdDev(close, shortPeriod) / StdDev(close, longPeriod)
//
// Both StdDevs are POPULATION standard deviations (the .cs StandardDeviation.cs
// computes Σ(x − mean)^2 / N then takes sqrt — note divisor N, not N-1).
// Inputs to both StdDevs are the raw close prices (NOT log returns) — the .cs
// `OnProcessDecimal` reads `input.ToDecimal(Source)` straight from the source
// without any return transform. The "log-returns" intuition in the indicator's
// name is not reflected in the StockSharp implementation we're porting; if you
// want a log-return-based HVR you'd subclass and pre-transform inputs.
//
// Defaults: shortPeriod=5, longPeriod=20.
// IsFormed when both StdDevs are formed, i.e. at bar index max(short, long)-1.
// If long stddev is 0 the .cs returns 0 (not NaN/null) — we mirror that.
//
// .cs deviation notes:
// (a) StandardDeviation in StockSharp uses population variance (÷N). We do
//     the same. Some indicator libs default to sample (÷N-1); using sample
//     here would silently disagree with the server runtime.
// (b) HVR output is unitless (a ratio); the .cs labels its Measure as
//     Percent, but the value itself is not multiplied by 100. We follow.

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

// Population standard deviation of `values` over a trailing window of length
// `len`. Mirrors StockSharp's StandardDeviation: emits null until the window
// is full, then sqrt(Σ(x - mean)^2 / len). Any non-finite sample in the
// window emits null for that output slot.
function popStdDev(values, len) {
    const n = values.length;
    const out = new Array(n);
    if (len <= 0) { for (let i = 0; i < n; i++) out[i] = null; return out; }

    for (let i = 0; i < n; i++) {
        if (i < len - 1) { out[i] = null; continue; }
        let sum = 0;
        let ok = true;
        for (let k = i - len + 1; k <= i; k++) {
            const v = values[k];
            if (typeof v !== 'number' || !Number.isFinite(v)) { ok = false; break; }
            sum += v;
        }
        if (!ok) { out[i] = null; continue; }
        const mean = sum / len;
        let acc = 0;
        for (let k = i - len + 1; k <= i; k++) {
            const d = values[k] - mean;
            acc += d * d;
        }
        out[i] = Math.sqrt(acc / len);
    }
    return out;
}

/**
 * @param {CandlePoint[]} candles
 * @param {{shortPeriod?: number, longPeriod?: number}} [params]
 * @returns {IndicatorPoint[]}
 */
export function calcHistoricalVolatilityRatio(candles, params) {
    const shortPeriod = params && Number.isFinite(params.shortPeriod) ? (params.shortPeriod | 0) : 5;
    const longPeriod = params && Number.isFinite(params.longPeriod) ? (params.longPeriod | 0) : 20;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    if (shortPeriod <= 0 || longPeriod <= 0) return out;

    const closes = new Array(n);
    for (let i = 0; i < n; i++) closes[i] = candles[i] && candles[i].close;

    const shortSd = popStdDev(closes, shortPeriod);
    const longSd = popStdDev(closes, longPeriod);

    for (let i = 0; i < n; i++) {
        const s = shortSd[i];
        const l = longSd[i];
        if (s === null || l === null) continue;
        // Mirror .cs: if longSd is 0 the result is forced to 0 (avoids /0).
        out[i] = { time: candles[i].time, value: l !== 0 ? s / l : 0 };
    }

    return out;
}
