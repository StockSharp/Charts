// Twiggs Money Flow — JS port of D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\TwiggsMoneyFlow.cs.
// Deviations from .cs: none.
//
// Per bar:
//   tp = (high + low + close) / 3
//   cl = high - low                     (candle.GetLength)
//   ad = volume * (2*tp - high - low) / cl  if cl != 0
//      = prevAd                              otherwise
//   tmf = EMA(ad, length) / EMA(volume, length)
// (.cs does NOT multiply by 100; returns null when tmf == 0.)
//
// Default length = 21.
//
// @typedef {{time:number|string,open:number,high:number,low:number,close:number,volume:number}} Candle
// @typedef {{time:number|string,value:number|null}} Point

/**
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
    let seedSum = 0, seedCount = 0, seedDone = false, prev = 0;
    const k = 2 / (length + 1);
    for (let i = 0; i < n; i++) {
        const v = values[i];
        const ok = typeof v === 'number' && Number.isFinite(v);
        if (!seedDone) {
            if (!ok) { out[i] = null; continue; }
            seedSum += v;
            seedCount++;
            if (seedCount === length) {
                prev = seedSum / length;
                out[i] = prev;
                seedDone = true;
            } else out[i] = null;
            continue;
        }
        if (!ok) { out[i] = null; continue; }
        prev = v * k + prev * (1 - k);
        out[i] = prev;
    }
    return out;
}

/**
 * @param {Candle[]} candles
 * @param {{length?: number}} [params]
 * @returns {Point[]}
 */
export function calcTwiggsMoneyFlow(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 21;
    if (!Array.isArray(candles) || candles.length === 0) return [];
    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };
    if (length <= 0) return out;

    const ads = new Array(n);
    const vols = new Array(n);
    let prevAd = 0;

    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const h = c && c.high;
        const l = c && c.low;
        const cl = c && c.close;
        const v = c && c.volume;
        const ok = typeof h === 'number' && Number.isFinite(h)
            && typeof l === 'number' && Number.isFinite(l)
            && typeof cl === 'number' && Number.isFinite(cl)
            && typeof v === 'number' && Number.isFinite(v);
        if (!ok) {
            ads[i] = null;
            vols[i] = null;
            continue;
        }
        const range = h - l;
        let ad;
        if (range !== 0) {
            const tp = (h + l + cl) / 3;
            ad = v * (2 * tp - h - l) / range;
        } else {
            ad = prevAd;
        }
        ads[i] = ad;
        vols[i] = v;
        prevAd = ad;
    }

    const adEma = emaArray(ads, length);
    const volEma = emaArray(vols, length);

    for (let i = 0; i < n; i++) {
        const a = adEma[i];
        const b = volEma[i];
        if (a === null || b === null || b === 0) continue;
        const tmf = a / b;
        if (tmf === 0) continue; // .cs returns null when tmf==0
        out[i] = { time: candles[i].time, value: tmf };
    }
    return out;
}
