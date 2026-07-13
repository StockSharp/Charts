// Percentage Volume Oscillator —
// JS port of D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\PercentageVolumeOscillator.cs.
//   shortEma = EMA(volume, ShortPeriod)   (default 12)
//   longEma  = EMA(volume, LongPeriod)    (default 26)
//   pvo      = (shortEma - longEma) / longEma * 100
//
// PVO is a BaseComplexIndicator with three child outputs: shortEma,
// longEma and the pvo line itself. The .cs emits all three columns; we
// match that by returning the same shape as a multi-series object.
// shortEma / longEma start emitting as soon as their own seeds fill
// (rows shortPeriod-1 / longPeriod-1); pvo emits only when both EMAs
// are formed.
//
// Deviations from .cs: none.
//
// @typedef {{time:number|string,open:number,high:number,low:number,close:number,volume:number}} Candle
// @typedef {{time:number|string,value:number|null}} Point

function emaArr(values, length) {
    const n = values.length;
    const out = new Array(n);
    if (n === 0 || length <= 0) { for (let i = 0; i < n; i++) out[i] = null; return out; }
    let seedSum = 0, seedCnt = 0, seedDone = false, prev = 0;
    const k = 2 / (length + 1);
    for (let i = 0; i < n; i++) {
        const v = values[i];
        const ok = typeof v === 'number' && Number.isFinite(v);
        if (!seedDone) {
            if (!ok) { out[i] = null; continue; }
            seedSum += v; seedCnt++;
            if (seedCnt === length) {
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
 * @param {{shortPeriod?: number, longPeriod?: number}} [params]
 * @returns {{shortEma: Point[], longEma: Point[], pvo: Point[]}}
 */
export function calcPVO(candles, params) {
    const shortPeriod = params && Number.isFinite(params.shortPeriod) ? (params.shortPeriod | 0) : 12;
    const longPeriod = params && Number.isFinite(params.longPeriod) ? (params.longPeriod | 0) : 26;
    if (!Array.isArray(candles) || candles.length === 0) {
        return { shortEma: [], longEma: [], pvo: [] };
    }

    const n = candles.length;
    const vols = new Array(n);
    for (let i = 0; i < n; i++) vols[i] = candles[i] && candles[i].volume;

    const s = emaArr(vols, shortPeriod);
    const l = emaArr(vols, longPeriod);

    const shortEma = new Array(n);
    const longEma = new Array(n);
    const pvo = new Array(n);
    for (let i = 0; i < n; i++) {
        const t = candles[i].time;
        shortEma[i] = { time: t, value: s[i] };
        longEma[i] = { time: t, value: l[i] };
        if (s[i] === null || l[i] === null) {
            pvo[i] = { time: t, value: null };
        } else if (l[i] === 0) {
            pvo[i] = { time: t, value: 0 };
        } else {
            pvo[i] = { time: t, value: (s[i] - l[i]) / l[i] * 100 };
        }
    }
    return { shortEma, longEma, pvo };
}
