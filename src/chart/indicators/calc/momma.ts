// Momentum of Moving Average (Algo.Indicators/MomentumOfMovingAverage.cs).
//
// The .cs implementation inherits SimpleMovingAverage and overrides
// OnProcessDecimal. SMA uses a CircularBufferEx of capacity=Length with
// running Sum. MomentumOfMovingAverage calls `base.OnProcessDecimal` (which
// pushes price into Buffer and returns Buffer.Sum/Length), then — once
// IsFormed — pushes the *MA value* into the SAME Buffer and reads
// `firstBuffer = Buffer[0]`.
//
// Because Buffer capacity is Length, this push evicts the oldest stored
// value. From candle index `length-1` onward each iteration alternates: SMA
// pushes price, then MomMA pushes ma, mixing two different value kinds into
// one buffer. The "SMA" sum (used for subsequent outputs) becomes
// `sum of recent prices and recent MA values`, NOT a true SMA. The
// "previous MA value" `Buffer[0]` is whichever item (price or MA) is the
// oldest still in the buffer after eviction.
//
// .cs DEVIATION NOTE: this is a quirk/bug of the upstream .cs implementation
// and we replicate it byte-for-byte so the JS output matches what a user
// running the .cs indicator on the same data would see. The `MomentumPeriod`
// property on the .cs class is only saved/loaded/printed — it does NOT
// affect the math (the lookback is determined by Buffer.Capacity = Length).
// We accept it as a param for surface compatibility but ignore it.
//
// Result is null until both of the .cs gates open:
//   1. base.IsFormed (Buffer.Count >= Length) ⇒ index `length-1`.
//   2. After the first MomMA push, `firstBuffer = Buffer[0]` is the oldest
//      of the now-`length` items.

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
 * @param {{length?: number, momentumPeriod?: number}} [params]
 *   `momentumPeriod` is accepted for API parity with .cs but unused in math.
 * @returns {IndicatorPoint[]}
 */
export function calcMomentumOfMovingAverage(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 14;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    if (length <= 0) {
        for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };
        return out;
    }

    // Faithful model of the .cs Buffer: bounded array of size `length`,
    // running sum maintained for the SMA result.
    const buf: number[] = [];
    let sum = 0;
    function push(v) {
        buf.push(v);
        sum += v;
        if (buf.length > length) {
            sum -= buf.shift()!;
        }
    }

    for (let i = 0; i < n; i++) {
        const price = candles[i] && candles[i].close;
        if (typeof price !== 'number' || !Number.isFinite(price)) {
            out[i] = { time: candles[i].time, value: null };
            continue;
        }

        // base.OnProcessDecimal: Buffer.PushBack(price); return Buffer.Sum / Length.
        push(price);
        const ma = sum / length;

        // CalcIsFormed: Buffer.Count >= Length.
        if (buf.length < length) {
            out[i] = { time: candles[i].time, value: null };
            continue;
        }

        // .cs: Buffer.PushBack(ma); firstBuffer = Buffer[0].
        push(ma);
        const firstBuffer = buf[0];

        if (firstBuffer === 0) {
            out[i] = { time: candles[i].time, value: null };
            continue;
        }
        out[i] = { time: candles[i].time, value: (ma - firstBuffer) / firstBuffer * 100 };
    }
    return out;
}
