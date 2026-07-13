// True Range — JS port of D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\TrueRange.cs.
// Deviations from .cs: none — first bar uses (high - low) because there is
// no previous candle, subsequent bars use max(|h-l|, |prevClose-h|, |prevClose-l|).
//
// @typedef {{time:number|string,open:number,high:number,low:number,close:number,volume:number}} Candle
// @typedef {{time:number|string,value:number|null}} Point

/**
 * @param {Candle[]} candles
 * @param {object} [_params]
 * @returns {Point[]}
 */
export function calcTrueRange(candles, _params) {
    if (!Array.isArray(candles) || candles.length === 0) return [];
    const n = candles.length;
    const out = new Array(n);

    let prevClose: number | null = null;
    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const t = c && c.time;
        const h = c && c.high;
        const l = c && c.low;
        const cl = c && c.close;
        const okHL = typeof h === 'number' && Number.isFinite(h)
            && typeof l === 'number' && Number.isFinite(l);
        if (!okHL) {
            out[i] = { time: t, value: null };
            // do not advance prevClose on bad bar
            continue;
        }
        let tr;
        if (prevClose === null) {
            tr = h - l;
        } else {
            const a = h - l;
            const b = Math.abs(prevClose - h);
            const d = Math.abs(prevClose - l);
            tr = a > b ? a : b;
            if (d > tr) tr = d;
        }
        out[i] = { time: t, value: tr };
        if (typeof cl === 'number' && Number.isFinite(cl)) prevClose = cl;
    }
    return out;
}
