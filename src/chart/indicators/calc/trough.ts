// Trough — JS port of D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\Trough.cs.
// Mirror of Peak: runs the same ZigZag engine but on candle LOW prices
// and emits only DOWN-pivots (troughs) — up-pivots are suppressed.
//
// Default deviation = 0.001 — matches StockSharp's ZigZag.cs field init
// (the value that generated the reference Trough.txt). The terminal UI
// passes its own user-chosen value via `params.deviation` for live charts.
// Output shape: dense, aligned 1:1 with input candles. Non-trough bars
// carry `value: null`; only confirmed troughs have a numeric value. The
// parity harness preserves blank rows in the reference data so this
// dense-with-null shape lines up row-by-row.
//
// Deviations from .cs: terminal default deviation differs from .cs ZigZag
// field initialiser (0.001) — same convention as our zigzag.js/peak.js.
//
// @typedef {{time:number|string,open:number,high:number,low:number,close:number,volume:number}} Candle
// @typedef {{time:number|string,value:number,shift?:number}} Point

/**
 * @param {Candle[]} candles
 * @param {{deviation?: number}} [params]
 * @returns {Point[]}
 */
export function calcTrough(candles, params) {
    const deviation = params && Number.isFinite(params.deviation) ? +params.deviation : 0.001;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    if (!(deviation > 0 && deviation < 1)) return out;
    if (n < 2) return out;

    const price0 = candles[0] && candles[0].low;
    if (typeof price0 !== 'number' || !Number.isFinite(price0)) return out;

    let lastExtremum: number | null = null;
    let isUpTrend: boolean | null = null;
    let shift = 0;

    for (let i = 1; i < n; i++) {
        const price = candles[i] && candles[i].low;
        const prevPrice = candles[i - 1] && candles[i - 1].low;
        if (typeof price !== 'number' || !Number.isFinite(price) ||
            typeof prevPrice !== 'number' || !Number.isFinite(prevPrice)) {
            continue;
        }
        if (lastExtremum === null) {
            lastExtremum = price;
            isUpTrend = price >= prevPrice;
            continue;
        }
        const threshold = lastExtremum * deviation;
        let changeTrend = false;
        if (isUpTrend) {
            if (lastExtremum < price) lastExtremum = price;
            else if (price <= lastExtremum - threshold) changeTrend = true;
        } else {
            if (lastExtremum > price) lastExtremum = price;
            else if (price >= lastExtremum + threshold) changeTrend = true;
        }
        if (changeTrend) {
            // Trough: emit only on DOWN-pivot confirmation (i.e. the
            // just-closed leg was a down-leg => we were in a down-trend
            // and now flip to up).
            if (!isUpTrend) {
                out[i] = { time: candles[i].time, value: lastExtremum, shift };
            }
            isUpTrend = !isUpTrend;
            lastExtremum = price;
            shift = 1;
        } else {
            shift++;
        }
    }
    return out;
}
