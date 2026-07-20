// Ichimoku Kinkō Hyō (Goichi Hosoda).
//   Tenkan-sen   = (highestClose(tenkan)  + lowestClose(tenkan))  / 2
//   Kijun-sen    = (highestClose(kijun)   + lowestClose(kijun))   / 2
//   Senkou Span A = (Tenkan + Kijun) / 2, shifted forward by `kijun` bars
//   Senkou Span B = (highestClose(senkouB) + lowestClose(senkouB)) / 2,
//                   shifted forward by `kijun` bars
//   Chikou (Chinkou) = close at the current bar — see note below.
//
// Source-price note: StockSharp's IchimokuLine reads its inputs via
// `input.ToCandle()` and takes the rolling max of HighPrice / min of
// LowPrice — so Tenkan/Kijun/SenkouB midpoints are computed over HIGH/LOW,
// not the close. We match the live C# and do the same (verified bar-for-bar
// against Algo.Indicators).
//
// Forward-shift semantics: SenkouA/SenkouB buffer their raw value each final
// bar and emit the oldest once the buffer has grown to `kijun` slots — a
// `kijun`-bar forward shift. Emission starts one bar before the buffer is
// full, so the first raw value is output twice; `shiftForward` reproduces
// that exactly (see its doc). Values that would land past the last candle
// are dropped (caller can extend into the future if it wants).
//
// Chikou: IchimokuChinkouLine.cs returns `candle.ClosePrice` directly — the
// current bar's close, NOT a close from `kijun` bars ahead; the visual
// back-shift is chart-side only. The line is a DecimalLengthIndicator with
// Length = kijun, so it stays null until its buffer fills (bar kijun-1),
// then emits close[i].

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
            const h = c && c.high;
            const l = c && c.low;
            if (typeof h !== 'number' || !Number.isFinite(h) ||
                typeof l !== 'number' || !Number.isFinite(l)) { bad = true; break; }
            if (h > hi) hi = h;
            if (l < lo) lo = l;
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

    // Senkou A raw = (Tenkan + Kijun) / 2, valid only once BOTH lines are
    // formed (i.e. from max(tenkanLen, kijunLen) - 1). Senkou B raw is the
    // senkouB-window midpoint (valid from senkouBLen - 1).
    const senkouARaw = new Array(n);
    for (let k = 0; k < n; k++) {
        senkouARaw[k] = (tenkanRaw[k] !== null && kijunRaw[k] !== null)
            ? (tenkanRaw[k] + kijunRaw[k]) / 2
            : null;
    }
    const rawFirstA = Math.max(tenkanLen, kijunLen) - 1;
    const rawFirstB = senkouBLen - 1;

    const tenkan = new Array(n);
    const kijun = new Array(n);
    const senkouA = shiftForward(candles, senkouARaw, rawFirstA, kijunLen);
    const senkouB = shiftForward(candles, senkouBRaw, rawFirstB, kijunLen);
    const chikou = new Array(n);

    for (let i = 0; i < n; i++) {
        const t = candles[i].time;
        tenkan[i] = { time: t, value: tenkanRaw[i] };
        kijun[i] = { time: t, value: kijunRaw[i] };

        // Chikou (IchimokuChinkouLine, Length = kijun): returns the current
        // close, but the dumper gates each inner line on its own IsFormed, so
        // the line stays null until the buffer fills (bar kijunLen-1).
        const cc = candles[i] && candles[i].close;
        chikou[i] = {
            time: t,
            value: (i >= kijunLen - 1 && typeof cc === 'number' && Number.isFinite(cc)) ? cc : null,
        };
    }

    return { tenkan, kijun, senkouA, senkouB, chikou };
}

/**
 * Forward-shift a Senkou raw series exactly as StockSharp's
 * IchimokuSenkouA/BLine do it. Both lines buffer their raw value each final
 * bar (starting at `rawFirst`) and only start EMITTING once the buffer has
 * grown to `kijun` slots, then output the oldest buffered value (a `kijun`-bar
 * forward shift). Two consequences we reproduce bar-for-bar:
 *   - the first emit is at bar `rawFirst + (kijun - 1)`;
 *   - because the emit begins one bar before the buffer is full, the very
 *     first raw value is output TWICE (bars firstEmit and firstEmit+1) — i.e.
 *     the shifted source index is clamped at the bottom to `rawFirst`.
 * @param {CandlePoint[]} candles
 * @param {(number|null)[]} raw
 * @param {number} rawFirst first index at which `raw` is non-null
 * @param {number} kijun forward-shift length (Kijun.Length)
 * @returns {IndicatorPoint[]}
 */
function shiftForward(candles, raw, rawFirst, kijun) {
    const n = candles.length;
    const out = new Array(n);
    const firstEmit = rawFirst + (kijun - 1);
    for (let i = 0; i < n; i++) {
        const t = candles[i].time;
        if (i < firstEmit) { out[i] = { time: t, value: null }; continue; }
        let src = i - kijun;
        if (src < rawFirst) src = rawFirst;
        const v = raw[src];
        out[i] = { time: t, value: (typeof v === 'number' && Number.isFinite(v)) ? v : null };
    }
    return out;
}
