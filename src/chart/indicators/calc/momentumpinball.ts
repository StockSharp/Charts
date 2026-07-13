// Momentum Pinball (Algo.Indicators/MomentumPinball.cs).
//
// On a buffer of the last `length` close prices (capacity = Length, default
// 14, with running Min/Max stats):
//   momentum = price - buffer[0]
//   range    = bufferMax - bufferMin
//   result   = range != 0 ? momentum / range * 100 : 0
//
// Output is null until the buffer is full (Buffer.Count >= Length), then
// buffer[0] is the price `Length - 1` bars ago.
//
// Deviation vs .cs: none in steady state. Non-final intra-candle handling
// is not modelled (we treat every input as final).

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
export function calcMomentumPinball(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 14;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    if (length <= 0) {
        for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };
        return out;
    }

    const buf: number[] = []; // bounded to `length`

    for (let i = 0; i < n; i++) {
        const price = candles[i] && candles[i].close;
        if (typeof price !== 'number' || !Number.isFinite(price)) {
            out[i] = { time: candles[i].time, value: null };
            continue;
        }
        buf.push(price);
        if (buf.length > length) buf.shift();
        if (buf.length < length) {
            out[i] = { time: candles[i].time, value: null };
            continue;
        }
        // Compute min/max over the buffer. O(length) per bar — fine for our
        // batch-recompute sizes; the .cs has incremental stats but the
        // numeric result is identical.
        let mn = buf[0];
        let mx = buf[0];
        for (let j = 1; j < buf.length; j++) {
            const v = buf[j];
            if (v < mn) mn = v;
            if (v > mx) mx = v;
        }
        const momentum = price - buf[0];
        const range = mx - mn;
        const value = range !== 0 ? (momentum / range) * 100 : 0;
        out[i] = { time: candles[i].time, value };
    }
    return out;
}
