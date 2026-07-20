// Fractal Dimension Index (FDI).
// Port of StockSharp Algo.Indicators FractalDimension.cs.
//
// For each final bar:
//   1. Push close into a length-bounded circular buffer (capacity = length).
//   2. If buffer.count < 2, emit 1.5 (the .cs neutral mid-value).
//   3. Else compute:
//        maxHigh    = max(buffer)
//        minLow     = min(buffer)
//        pathLength = Σ |buffer[i] - buffer[i-1]|   for i = 1..count-1
//        range      = maxHigh - minLow
//        if pathLength == 0 OR range == 0:
//          fd = 1.5
//        else:
//          logDen = log(2 * (length - 1))
//          if logDen == 0: fd = 1.5            // length == 1 / 1.5 etc.
//          else:           fd = 1 + (log(pathLength) - log(range)) / logDen
//   4. Clamp fd into [1.0, 2.0].
//
// .cs deviation notes:
// (a) Source: the .cs reads `input.GetValue<decimal>()`, which for a
//     plain non-candle input would be the price scalar; for our candle
//     input pipeline this resolves to the candle close (default Source).
//     We use close.
// (b) Warm-up: the .cs emits 1.5 starting at the very FIRST bar (when
//     buffer.Count == 1, it falls through the `count < 2` early return).
//     We mirror this — the first output is 1.5, NOT null. This matches
//     the .cs behaviour bit-for-bit.
// (c) `IsFinal=false` (intra-bar) branch from the .cs is ignored: this
//     calculator only processes a homogenous batch of closed bars.

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
 * @param {CandlePoint[]} candles
 * @param {{length?: number}} [params]
 * @returns {IndicatorPoint[]}
 */
export function calcFractalDimension(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 30;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    if (length <= 0) return out;

    // Sliding window of the last `length` finite closes. Stored as a plain
    // array; we keep it bounded by shifting from the front when it grows
    // beyond `length`, mirroring DecimalBuffer.Capacity behaviour.
    const buffer: number[] = [];
    let logDen: number | null = null;
    if (length > 1) {
        const d = 2 * (length - 1);
        logDen = d > 0 ? Math.log(d) : null;
    }

    for (let i = 0; i < n; i++) {
        const c = candles[i] && candles[i].close;
        if (typeof c !== 'number' || !Number.isFinite(c)) {
            // Bad input bar: hold the buffer, emit null. (Matches "no
            // PushBack happened, no usable value" intuition.)
            continue;
        }

        buffer.push(c);
        if (buffer.length > length) buffer.shift();

        // Not formed until the buffer holds `length` closes (DecimalLengthIndicator
        // IsFormed = Buffer.Count == Length) — null the warm-up to match StockSharp.
        if (buffer.length < length) continue;

        if (buffer.length < 2) {
            out[i] = { time: candles[i].time, value: 1.5 };
            continue;
        }

        let maxHigh = buffer[0];
        let minLow = buffer[0];
        let pathLength = 0;
        for (let k = 1; k < buffer.length; k++) {
            const prev = buffer[k - 1];
            const curr = buffer[k];
            if (curr > maxHigh) maxHigh = curr;
            if (curr < minLow) minLow = curr;
            pathLength += Math.abs(curr - prev);
        }

        let fd;
        const range = maxHigh - minLow;
        if (pathLength === 0 || range === 0 || logDen === null) {
            fd = 1.5;
        } else {
            fd = 1 + (Math.log(pathLength) - Math.log(range)) / logDen;
        }

        // Clamp into [1, 2].
        if (fd < 1) fd = 1;
        else if (fd > 2) fd = 2;

        out[i] = { time: candles[i].time, value: fd };
    }
    return out;
}
