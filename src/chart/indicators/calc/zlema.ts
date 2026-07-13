// Zero Lag Exponential Moving Average —
// JS port of D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\ZeroLagExponentialMovingAverage.cs.
// Standard ZLEMA per Ehlers/Ratcliffe:
//   lag       = (Length - 1) / 2     (integer division)
//   k         = 2 / (Length + 1)
//   priceLag  = close[i - lag]       (from a Length-deep rolling buffer)
//   zlema[i]  = k * (2*close[i] - priceLag) + (1 - k) * zlema[i-1]
// .cs uses a CircularBuffer of size Length and only emits once the buffer
// is full (IsFormed). The recurrence uses buffer[lag] which equals the
// element pushed `Length - lag - 1` bars ago. With a size-Length buffer
// indexed from oldest=0, the lagged price is close[i - (Length - 1 - lag)].
//
// Reading the .cs once more:
//   Buffer.PushBack(price);
//   buffer = Buffer;
//   var lagPrice = buffer[_lag];
// CircularBuffer in StockSharp is "oldest-first": index 0 is the oldest.
// After PushBack we have a window [close[i-Length+1] .. close[i]]; index
// `_lag` therefore picks close[i - Length + 1 + _lag] = close[i - lag*]
// where lag* = Length - 1 - _lag. For Length=14, _lag = 6, so lag* = 7.
// That's the convention we follow here.
//
// First valid emit at index Length-1 (buffer first filled). For Length=14
// the .cs IsFormed = (buffer.Count >= Length) after PushBack — first emit
// at i=13. _prevZlema starts at 0, so the first emitted value follows the
// recurrence with prev=0 — mirrors .cs exactly.
//
// Default Length = 14 per .cs ctor.
//
// Deviations from .cs: none.
//
// @typedef {{time:number|string,open:number,high:number,low:number,close:number,volume:number}} Candle
// @typedef {{time:number|string,value:number|null}} Point

/**
 * @param {Candle[]} candles
 * @param {{length?: number}} [params]
 * @returns {Point[]}
 */
export function calcZLEMA(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 14;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    if (length <= 0 || n < length) return out;

    const lagInternal = ((length - 1) / 2) | 0;  // _lag in .cs
    const k = 2 / (length + 1);
    // Index offset to pull lagged close from current i: lagBars = (length - 1) - lagInternal.
    const lagBars = (length - 1) - lagInternal;

    let prev = 0;
    for (let i = length - 1; i < n; i++) {
        const cur = candles[i] && candles[i].close;
        const lagged = candles[i - lagBars] && candles[i - lagBars].close;
        if (typeof cur !== 'number' || !Number.isFinite(cur) ||
            typeof lagged !== 'number' || !Number.isFinite(lagged)) {
            out[i] = { time: candles[i].time, value: null };
            continue;
        }
        const z = k * (2 * cur - lagged) + (1 - k) * prev;
        prev = z;
        out[i] = { time: candles[i].time, value: z };
    }
    return out;
}
