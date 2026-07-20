// Momentum (Algo.Indicators/Momentum.cs).
//
// momentum[i] = close[i] - close[i - length]
//
// .cs details we replicate:
//   - Buffer capacity = Length + 1 (`GetCapacity() => Length + 1`).
//   - CalcIsFormed: Buffer.Count > Length (i.e. requires Length+1 pushes).
//   - On each input, returns `newValue - Buffer[0]`.
//
// Once the buffer is full (capacity Length+1), Buffer[0] is the close
// `Length` bars ago, giving the canonical `close[i] - close[i-Length]`.
//
// Warm-up: StockSharp reports the pre-form values as not-formed (IsFormed is
// `Buffer.Count > Length`), so nothing is emitted before index `length` — we
// gate output on the buffer being full to match that.

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
export function calcMomentum(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 5;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    if (length <= 0) {
        for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };
        return out;
    }

    const capacity = length + 1;
    const buf: number[] = []; // bounded to `capacity` (Length+1)

    for (let i = 0; i < n; i++) {
        const price = candles[i] && candles[i].close;
        if (typeof price !== 'number' || !Number.isFinite(price)) {
            out[i] = { time: candles[i].time, value: null };
            continue;
        }
        buf.push(price);
        if (buf.length > capacity) buf.shift();
        // Formed only once the buffer holds Length+1 values (Buffer.Count > Length);
        // before that StockSharp reports not-formed, so emit null.
        out[i] = buf.length > length
            ? { time: candles[i].time, value: price - buf[0] }
            : { time: candles[i].time, value: null };
    }
    return out;
}
