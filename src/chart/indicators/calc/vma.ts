// Variable Moving Average — 1:1 port of
// D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\VariableMovingAverage.cs.
//
// The C# implementation has a quirky two-stage growth pattern that produces
// a long warm-up plateau before VMA starts moving:
//
//   Bar 0: not initialised → PushBack(close[0]) into own Buffer,
//          _prevFinalValue = Buffer.Sum / Buffer.Count = close[0];
//          flip _isInitialized=true. Return close[0]. stdDev is NOT called.
//
//   Bars 1..Length-1: _isInitialized=true so call _stdDev.Process(input).
//          stdDev's inner SMA needs Length samples to form; it sees inputs
//          starting at bar 1, so it forms after Length more inputs — at
//          bar Length (NOT bar Length-1). Until then return _prevFinalValue
//          unchanged. Buffer stays at 1 element (close[0]).
//          Reference rows 1..Length-1 == close[0].
//
//   Bar Length: stdDev becomes formed. avgPrice = Buffer.Sum / Buffer.Count
//          = close[0] (Buffer still has 1 element). vi = stdDev / avgPrice;
//          k = 2 / (Length * (1 + VolatilityIndex * vi) + 1).
//          curValue = (close[i] - _prevFinalValue) * k + _prevFinalValue.
//          THEN PushBack(close[i]), _prevFinalValue = curValue.
//
//   Bar Length+1 onward: avgPrice uses Buffer.Sum / Buffer.Count where
//          Buffer grows by 1 every formed bar (PushBack happens AFTER the
//          curValue computation). Buffer caps at Length, then evicts FIFO.
//
// Default params per .cs ctor: Length=20, VolatilityIndex=0.2.
//
// @typedef {{time:number|string,open:number,high:number,low:number,close:number,volume:number}} Candle
// @typedef {{time:number|string,value:number|null}} Point

/**
 * @param {Candle[]} candles
 * @param {{length?: number, volatilityIndex?: number}} [params]
 * @returns {Point[]}
 */
export function calcVMA(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 20;
    const volatilityIndex = params && Number.isFinite(params.volatilityIndex) ? +params.volatilityIndex : 0.2;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    if (length <= 0) return out;

    // Own Buffer (capacity = length, FIFO eviction).
    /** @type {number[]} */
    const buf: number[] = [];
    let bufSum = 0;

    // Inner StandardDeviation state. stdDev has its own SMA (length) and a
    // separate decimal buffer (length). It becomes formed once its inner
    // SMA is formed — i.e. once length samples have been fed to stdDev.
    /** @type {number[]} */
    const stdBuf: number[] = [];
    let stdSum = 0; // running sum for stdDev's inner SMA
    // stdDev.Buffer (mirrors `Buffer.PushBack(newValue)` inside StandardDeviation)
    /** @type {number[]} */
    const stdInnerBuf: number[] = [];

    let isInitialized = false;
    let prevFinalValue = 0;

    function processStdDev(newValue) {
        // SMA step.
        stdBuf.push(newValue);
        stdSum += newValue;
        if (stdBuf.length > length) stdSum -= stdBuf.shift()!;
        const smaFormed = stdBuf.length >= length;
        if (!smaFormed) {
            // Mirror the .cs PushBack into the stdDev's own buffer even
            // before SMA forms (it happens in OnProcessDecimal regardless).
            stdInnerBuf.push(newValue);
            if (stdInnerBuf.length > length) stdInnerBuf.shift();
            return { formed: false, value: 0 };
        }
        const smaValue = stdSum / length;
        // PushBack newValue into stdDev's own buffer.
        stdInnerBuf.push(newValue);
        if (stdInnerBuf.length > length) stdInnerBuf.shift();
        // std = Σ((x - smaValue)^2) over the stdDev buffer.
        let s = 0;
        for (let k = 0; k < stdInnerBuf.length; k++) {
            const d = stdInnerBuf[k] - smaValue;
            s += d * d;
        }
        return { formed: true, value: Math.sqrt(s / length) };
    }

    for (let i = 0; i < n; i++) {
        const c = candles[i] && candles[i].close;
        if (typeof c !== 'number' || !Number.isFinite(c)) {
            out[i] = { time: candles[i].time, value: null };
            continue;
        }

        if (!isInitialized) {
            buf.push(c);
            bufSum += c;
            prevFinalValue = bufSum / buf.length;
            isInitialized = true;
            // Not formed until stdDev forms (index Length) — StockSharp nulls the warm-up.
            continue;
        }

        const std = processStdDev(c);
        if (!std.formed) {
            // stdDev not yet formed → StockSharp reports not-formed (null).
            continue;
        }

        const avgPrice = bufSum / buf.length;
        const volatility = std.value;
        const vi = avgPrice !== 0 ? Math.abs(volatility / avgPrice) : 0;
        const k = 2 / (length * (1 + volatilityIndex * vi) + 1);
        const curValue = (c - prevFinalValue) * k + prevFinalValue;

        // PushBack into own Buffer (capacity=length, FIFO).
        buf.push(c);
        bufSum += c;
        if (buf.length > length) bufSum -= buf.shift()!;
        prevFinalValue = curValue;

        out[i] = { time: candles[i].time, value: curValue };
    }

    return out;
}
