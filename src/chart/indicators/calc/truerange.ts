// True Range — JS port of D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\TrueRange.cs.
// TR[i] = max(|h-l|, |prevClose-h|, |prevClose-l|) for i >= 1. The first bar has no
// previous candle, so TrueRange.cs is NOT formed there (IsFormed flips to true only on
// the second candle) — StockSharp reports it as not-formed, so index 0 is emitted as null.
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
        if (prevClose === null) {
            // First candle: no previous close -> TrueRange.cs is not formed here.
            out[i] = { time: t, value: null };
            if (typeof cl === 'number' && Number.isFinite(cl)) prevClose = cl;
            continue;
        }
        const a = h - l;
        const b = Math.abs(prevClose - h);
        const d = Math.abs(prevClose - l);
        let tr = a > b ? a : b;
        if (d > tr) tr = d;
        out[i] = { time: t, value: tr };
        if (typeof cl === 'number' && Number.isFinite(cl)) prevClose = cl;
    }
    return out;
}
