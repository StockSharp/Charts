// Relative Vigor Index — JS port of
// D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\RelativeVigorIndex.cs
// (Average + Signal sub-indicators).
// Average length defaults to 4 (matches `_buffer = new(4)` plus `Length =
// _buffer.Capacity` in .cs). Signal length defaults to 4 as well (matches
// `Length = 4` in RelativeVigorIndexSignal.cs).
//
// For each window of 4 candles ending at index i:
//   num = (close-open)[i-3] + 2*(close-open)[i-2] + 2*(close-open)[i-1] + (close-open)[i]
//   den = (high-low)[i-3]   + 2*(high-low)[i-2]   + 2*(high-low)[i-1]   + (high-low)[i]
//   rvi[i] = den == 0 ? num/6 : num / den   (per .cs:
//                                            `valueDn == 0 ? valueUp : valueUp/valueDn`
//                                            where each is /6m — the /6m cancels in the
//                                            division but stays for the den==0 fallback,
//                                            so we apply /6 only there)
// signal[i] = (rvi[i-3] + 2*rvi[i-2] + 2*rvi[i-1] + rvi[i]) / 6
// Both series same length as input; null in warm-up.
// Deviations from .cs: none — formula and weights match 1:1.
//
// @typedef {{time:number|string,open:number,high:number,low:number,close:number,volume:number}} Candle
// @typedef {{time:number|string,value:number|null}} Point

/**
 * @param {Candle[]} candles
 * @param {{length?: number, signalLength?: number}} [params]
 * @returns {{rvi: Point[], signal: Point[]}}
 */
export function calcRelativeVigorIndex(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 4;
    const signalLength = params && Number.isFinite(params.signalLength) ? (params.signalLength | 0) : 4;

    if (!Array.isArray(candles) || candles.length === 0) {
        return { rvi: [], signal: [] };
    }

    const n = candles.length;
    const rvi = new Array(n);
    const signal = new Array(n);
    for (let i = 0; i < n; i++) {
        const t = candles[i] && candles[i].time;
        rvi[i] = { time: t, value: null };
        signal[i] = { time: t, value: null };
    }

    if (length < 4 || signalLength < 4) return { rvi, signal };

    // Length is .cs's buffer capacity. The formula uses exactly 4 weighted
    // taps regardless of Length (1,2,2,1/6). We honour Length as the warm-up
    // size matching .cs `IsFormed = buffer.Count >= Length` — first non-null
    // RVI lands at index (length - 1).
    const rviRaw = new Array(n);
    for (let i = 0; i < n; i++) rviRaw[i] = null;

    for (let i = length - 1; i < n; i++) {
        const c0 = candles[i - 3];
        const c1 = candles[i - 2];
        const c2 = candles[i - 1];
        const c3 = candles[i];
        if (!finiteCandle(c0) || !finiteCandle(c1) || !finiteCandle(c2) || !finiteCandle(c3)) continue;

        const up = ((c0.close - c0.open) +
                    2 * (c1.close - c1.open) +
                    2 * (c2.close - c2.open) +
                    (c3.close - c3.open)) / 6;
        const dn = ((c0.high - c0.low) +
                    2 * (c1.high - c1.low) +
                    2 * (c2.high - c2.low) +
                    (c3.high - c3.low)) / 6;

        rviRaw[i] = dn === 0 ? up : up / dn;
        rvi[i] = { time: candles[i].time, value: rviRaw[i] };
    }

    // Signal: weighted SMA of last 4 RVI values with the same 1,2,2,1/6
    // taps. signalLength is treated like .cs Length — warm-up needs
    // `signalLength` RVI values (which already need `length - 1` candle
    // warm-up themselves).
    for (let i = length - 1 + signalLength - 1; i < n; i++) {
        const v0 = rviRaw[i - 3];
        const v1 = rviRaw[i - 2];
        const v2 = rviRaw[i - 1];
        const v3 = rviRaw[i];
        if (v0 === null || v1 === null || v2 === null || v3 === null) continue;
        signal[i] = { time: candles[i].time, value: (v0 + 2 * v1 + 2 * v2 + v3) / 6 };
    }

    return { rvi, signal };
}

function finiteCandle(c) {
    return c &&
        typeof c.open === 'number' && Number.isFinite(c.open) &&
        typeof c.high === 'number' && Number.isFinite(c.high) &&
        typeof c.low === 'number' && Number.isFinite(c.low) &&
        typeof c.close === 'number' && Number.isFinite(c.close);
}
