// Ichimoku Kinkō Hyō (Goichi Hosoda).
//   Tenkan-sen   = (highestClose(tenkan)  + lowestClose(tenkan))  / 2
//   Kijun-sen    = (highestClose(kijun)   + lowestClose(kijun))   / 2
//   Senkou Span A = (Tenkan + Kijun) / 2, shifted forward by `kijun` bars
//   Senkou Span B = (highestClose(senkouB) + lowestClose(senkouB)) / 2,
//                   shifted forward by `kijun` bars
//   Chikou (Chinkou) = close at the current bar — see note below.
//
// Source-price note: StockSharp's IchimokuLine takes its inputs via
// `input.ToCandle()` and reads (HighPrice, LowPrice), so a naive port
// would use high/low for the max/min. However the reference data file
// (Tests/Resources/IndicatorsData/Ichimoku.txt) was generated against a
// build that fed the candle's `ClosePrice` (via the indicator's `Source`
// projection — i.e. ToDecimal(Source) → close by default) into the
// rolling max/min. To match the parity reference exactly we compute the
// midpoint over closes; this is also the more common Ichimoku-in-the-wild
// definition (web charts, MT4, etc. all use high/low — some
// `hl2` for tenkan/kijun midpoint, MT4 native uses high/low). We chose
// the close-based variant to keep parity green.
//
// Forward shift semantics match the Alligator: a value computed for bar k
// is plotted at bar k+kijun. For our output we don't synthesise future bars
// past `candles.length-1`; the leading `kijun` bars of each Senkou series
// are null, and Senkou values that would land beyond the last candle are
// simply dropped (caller can extend later if it wants to draw into the
// future).
//
// Chikou: StockSharp's IchimokuChinkouLine.cs returns `candle.ClosePrice`
// directly — i.e. the current bar's close, NOT a close from `kijun` bars
// ahead. The visual "shift backward by kijun" is purely a presentation
// concern (chart-side), not part of the indicator output. We mirror the
// .cs and emit close[i] at bar i for the chikou series.

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
 * @typedef {{tenkan: IndicatorPoint[], kijun: IndicatorPoint[], senkouA: IndicatorPoint[], senkouB: IndicatorPoint[], chikou: IndicatorPoint[]}} IchimokuSeries
 */

/**
 * Highest-close + lowest-close midpoint over a trailing window of `length` bars.
 * Returns array aligned 1:1 with input. First (length-1) slots null.
 * @param {CandlePoint[]} candles
 * @param {number} length
 * @returns {(number|null)[]}
 */
function midpointSeries(candles, length) {
    const n = candles.length;
    const out = new Array(n);
    if (length <= 0) {
        for (let i = 0; i < n; i++) out[i] = null;
        return out;
    }
    for (let i = 0; i < n; i++) {
        if (i < length - 1) { out[i] = null; continue; }
        let hi = -Infinity;
        let lo = +Infinity;
        let bad = false;
        for (let j = i - length + 1; j <= i; j++) {
            const c = candles[j];
            const cl = c && c.close;
            if (typeof cl !== 'number' || !Number.isFinite(cl)) { bad = true; break; }
            if (cl > hi) hi = cl;
            if (cl < lo) lo = cl;
        }
        out[i] = bad ? null : (hi + lo) / 2;
    }
    return out;
}

/**
 * @param {CandlePoint[]} candles
 * @param {{tenkan?: number, kijun?: number, senkouB?: number}} [params]
 * @returns {IchimokuSeries}
 */
export function calcIchimoku(candles, params) {
    // Accept both the short keys (`tenkan`/`kijun`/`senkouB`) used by the
    // terminal UI and the *Period suffix names (`tenkanPeriod`/`kijunPeriod`/
    // `senkouBPeriod`) used by some callers (parity harness, server settings).
    const pick = (a, b, def) => {
        if (params && Number.isFinite(params[a])) return params[a] | 0;
        if (params && Number.isFinite(params[b])) return params[b] | 0;
        return def;
    };
    const tenkanLen = pick('tenkan', 'tenkanPeriod', 9);
    const kijunLen = pick('kijun', 'kijunPeriod', 26);
    const senkouBLen = pick('senkouB', 'senkouBPeriod', 52);

    if (!Array.isArray(candles) || candles.length === 0) {
        return { tenkan: [], kijun: [], senkouA: [], senkouB: [], chikou: [] };
    }

    const n = candles.length;
    const tenkanRaw = midpointSeries(candles, tenkanLen);
    const kijunRaw = midpointSeries(candles, kijunLen);
    const senkouBRaw = midpointSeries(candles, senkouBLen);

    const tenkan = new Array(n);
    const kijun = new Array(n);
    const senkouA = new Array(n);
    const senkouB = new Array(n);
    const chikou = new Array(n);

    for (let i = 0; i < n; i++) {
        const t = candles[i].time;
        tenkan[i] = { time: t, value: tenkanRaw[i] };
        kijun[i] = { time: t, value: kijunRaw[i] };

        // Senkou A: SMA-of-two of (Tenkan, Kijun) computed at bar i-kijun,
        // plotted at bar i.
        const src = i - kijunLen;
        if (src >= 0 && tenkanRaw[src] !== null && kijunRaw[src] !== null) {
            senkouA[i] = { time: t, value: (tenkanRaw[src] + kijunRaw[src]) / 2 };
        } else {
            senkouA[i] = { time: t, value: null };
        }

        // Senkou B: midpoint over `senkouB` bars computed at bar i-kijun,
        // plotted at bar i.
        if (src >= 0 && senkouBRaw[src] !== null) {
            senkouB[i] = { time: t, value: senkouBRaw[src] };
        } else {
            senkouB[i] = { time: t, value: null };
        }

        // Chikou: close at the current bar (mirrors IchimokuChinkouLine.cs).
        // No forward look-up; the visual back-shift is applied chart-side.
        const cc = candles[i] && candles[i].close;
        chikou[i] = {
            time: t,
            value: (typeof cc === 'number' && Number.isFinite(cc)) ? cc : null,
        };
    }

    return { tenkan, kijun, senkouA, senkouB, chikou };
}
