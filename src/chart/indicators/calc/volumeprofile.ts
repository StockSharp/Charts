// Volume Profile — JS port of D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\VolumeProfileIndicator.cs.
// Cumulative histogram of volume bucketed by price. Each candle adds its
// `volume` (or per-trade volume if PriceLevels are present — not available
// client-side, so we always use total volume as if UseTotalVolume=true).
// Bucketing key: floor(price / Step) * Step where price = candle.close.
//
// Output for each bar: `{time, buckets: [{price, volume}], value}` where
// `buckets` is the CUMULATIVE histogram up to and including that bar
// (sorted ascending by price), and `value` mirrors the running total
// volume so single-series charts have something numeric to plot. First
// bar's bucket list contains a single entry.
//
// Deviations from .cs: .cs always emits PriceLevels-driven buckets when
// available; we use close-price total-volume buckets unconditionally
// because client-side candle data lacks per-trade PriceLevels.
//
// @typedef {{time:number|string,open:number,high:number,low:number,close:number,volume:number}} Candle
// @typedef {{price:number,volume:number}} Bucket
// @typedef {{time:number|string,value:number|null,buckets:Bucket[]}} Point

/**
 * @param {Candle[]} candles
 * @param {{step?: number}} [params]
 * @returns {Point[]}
 */
export function calcVolumeProfile(candles, params) {
    const step = params && Number.isFinite(params.step) && params.step > 0 ? +params.step : 1;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    const levels = new Map(); // key -> { price, volume }
    let totalVolume = 0;

    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const price = c && c.close;
        const vol = c && c.volume;
        if (typeof price === 'number' && Number.isFinite(price) &&
            typeof vol === 'number' && Number.isFinite(vol)) {
            // .cs: var level = (int)(price / Step) * Step;
            const key = Math.trunc(price / step) * step;
            const prev = levels.get(key);
            if (prev) prev.volume += vol;
            else levels.set(key, { price: key, volume: vol });
            totalVolume += vol;
        }
        // Snapshot — sorted by price ascending.
        const buckets = Array.from(levels.values())
            .map(b => ({ price: b.price, volume: b.volume }))
            .sort((a, b) => a.price - b.price);
        out[i] = { time: c.time, value: totalVolume, buckets };
    }
    return out;
}
