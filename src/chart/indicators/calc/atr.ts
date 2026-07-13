// Average True Range (Welles Wilder, 1978).
// TR[i] = max(high[i] - low[i], |high[i] - close[i-1]|, |low[i] - close[i-1]|)
// for i >= 1; TR[0] is undefined because there is no prior close. ATR is
// then a Wilder smoothing of TR over `length`:
//   seed = SMA of TR over the first `length` valid TRs (i.e. indices 1..length)
//   step = (prev * (length - 1) + tr[i]) / length
//
// Warm-up: outputs at indices 0..length stay null (need 1 prev-close + length
// TRs); first non-null ATR lands at index `length`.

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
export function calcATR(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 14;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    if (length <= 0 || n <= length) return out;

    // TR[0] is undefined (no prev close); TRs are computed for i=1..n-1.
    // Seed ATR with SMA of TR[1..length].
    let seedSum = 0;
    let seedOk = true;
    for (let i = 1; i <= length; i++) {
        const c = candles[i];
        const p = candles[i - 1];
        const h = c && c.high;
        const l = c && c.low;
        const pc = p && p.close;
        if (typeof h !== 'number' || !Number.isFinite(h) ||
            typeof l !== 'number' || !Number.isFinite(l) ||
            typeof pc !== 'number' || !Number.isFinite(pc)) {
            seedOk = false;
            break;
        }
        const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
        seedSum += tr;
    }
    if (!seedOk) return out;

    let prevAtr = seedSum / length;
    out[length] = { time: candles[length].time, value: prevAtr };

    for (let i = length + 1; i < n; i++) {
        const c = candles[i];
        const p = candles[i - 1];
        const h = c && c.high;
        const l = c && c.low;
        const pc = p && p.close;
        if (typeof h !== 'number' || !Number.isFinite(h) ||
            typeof l !== 'number' || !Number.isFinite(l) ||
            typeof pc !== 'number' || !Number.isFinite(pc)) {
            out[i] = { time: candles[i].time, value: null };
            // Once we hit a gap we can't continue Wilder smoothing without a
            // fresh seed. Subsequent outputs stay null to flag the break.
            for (let j = i + 1; j < n; j++) out[j] = { time: candles[j].time, value: null };
            return out;
        }
        const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
        prevAtr = (prevAtr * (length - 1) + tr) / length;
        out[i] = { time: candles[i].time, value: prevAtr };
    }
    return out;
}
