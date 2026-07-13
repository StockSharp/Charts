// MACD — Moving Average Convergence / Divergence.
// macd = EMA(close, fastLength) − EMA(close, slowLength)
// signal = EMA(macd, signalLength)
// histogram = macd − signal
// EMAs seed with the SMA of their first `N` valid values (matches the
// StockSharp / Wilder convention used by ema.js). Signal EMA starts
// counting from the first non-null macd sample, so its warm-up stacks
// on top of the slow-EMA warm-up.

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
 * @typedef {{macd: IndicatorPoint[], signal: IndicatorPoint[], histogram: IndicatorPoint[]}} MACDSeries
 */

/**
 * Compute an EMA over an arbitrary numeric series. Returns an array of
 * (number|null), same length as input. First (length-1) entries are null;
 * the entry at index (length-1) is seeded with the SMA of the first
 * `length` finite values. Any non-finite value in the seed window
 * invalidates the whole series until enough valid data accumulates.
 * @param {(number|null)[]} values
 * @param {number} length
 * @returns {(number|null)[]}
 */
function emaArray(values, length) {
    const n = values.length;
    const out = new Array(n);
    if (n === 0 || length <= 0) {
        for (let i = 0; i < n; i++) out[i] = null;
        return out;
    }

    let seedSum = 0;
    let seedCount = 0;
    let seedDone = false;
    let prev = 0;
    const k = 2 / (length + 1);

    for (let i = 0; i < n; i++) {
        const v = values[i];
        const ok = typeof v === 'number' && Number.isFinite(v);
        if (!seedDone) {
            if (!ok) {
                out[i] = null;
                continue;
            }
            seedSum += v;
            seedCount++;
            if (seedCount === length) {
                prev = seedSum / length;
                out[i] = prev;
                seedDone = true;
            } else {
                out[i] = null;
            }
            continue;
        }
        if (!ok) {
            out[i] = null;
            continue;
        }
        prev = v * k + prev * (1 - k);
        out[i] = prev;
    }
    return out;
}

/**
 * @param {CandlePoint[]} candles
 * @param {{fastLength?: number, slowLength?: number, signalLength?: number}} [params]
 * @returns {MACDSeries}
 */
export function calcMACD(candles, params) {
    const fastLength = params && Number.isFinite(params.fastLength) ? (params.fastLength | 0) : 12;
    const slowLength = params && Number.isFinite(params.slowLength) ? (params.slowLength | 0) : 26;
    const signalLength = params && Number.isFinite(params.signalLength) ? (params.signalLength | 0) : 9;

    if (!Array.isArray(candles) || candles.length === 0) {
        return { macd: [], signal: [], histogram: [] };
    }

    const n = candles.length;
    const closes = new Array(n);
    for (let i = 0; i < n; i++) closes[i] = candles[i] && candles[i].close;

    const fast = emaArray(closes, fastLength);
    const slow = emaArray(closes, slowLength);

    const macdRaw = new Array(n);
    for (let i = 0; i < n; i++) {
        const a = fast[i];
        const b = slow[i];
        if (a === null || b === null) macdRaw[i] = null;
        else macdRaw[i] = a - b;
    }

    const signalRaw = emaArray(macdRaw, signalLength);

    const macd = new Array(n);
    const signal = new Array(n);
    const histogram = new Array(n);
    for (let i = 0; i < n; i++) {
        const t = candles[i].time;
        macd[i] = { time: t, value: macdRaw[i] };
        signal[i] = { time: t, value: signalRaw[i] };
        if (macdRaw[i] === null || signalRaw[i] === null) {
            histogram[i] = { time: t, value: null };
        } else {
            histogram[i] = { time: t, value: macdRaw[i] - signalRaw[i] };
        }
    }

    return { macd, signal, histogram };
}
