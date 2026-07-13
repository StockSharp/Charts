// Market Meanness Index (Algo.Indicators/MarketMeannessIndex.cs).
//
// Slides a window of `length` (default 200) close prices and counts:
//   priceChanges     — number of bars in [1..length-1] where price differed
//                      from previous bar (sign != 0)
//   directionChanges — within the same range, number of bars where the
//                      direction sign flipped vs the prior non-zero direction
// MMI = 100 * directionChanges / priceChanges   (0 if priceChanges==0)
// Returns null until `length` candles have been buffered (IsFormed).
//
// Note on the .cs sliding logic:
//   When the buffer is full (Count==Length), the .cs first removes the
//   contribution of the oldest pair (Buffer[0], Buffer[1]) BEFORE pushing
//   the new price; then it adds the contribution of (Buffer[^2], price).
//   We mirror this exactly. _prevDirection is updated only on inserts (the
//   "isRemoving=false" branch), which means the state effectively tracks
//   the direction at index ^1 of the window (last-but-one transition) — we
//   replicate that.
//
// Deviation vs .cs: none in steady-state math. The .cs non-final
// (intra-candle preview) branch is not modelled — we treat every input as
// final, which matches a closed-candle replay.

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

function sign(x) {
    if (x > 0) return 1;
    if (x < 0) return -1;
    return 0;
}

/**
 * @param {CandlePoint[]} candles
 * @param {{length?: number}} [params]
 * @returns {IndicatorPoint[]}
 */
export function calcMarketMeannessIndex(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 200;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    if (length <= 0) {
        for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };
        return out;
    }

    const buffer: number[] = []; // sliding window of close prices, max size = length
    let priceChanges = 0;
    let directionChanges = 0;
    let prevDirection = 0;

    for (let i = 0; i < n; i++) {
        const price = candles[i] && candles[i].close;
        if (typeof price !== 'number' || !Number.isFinite(price)) {
            out[i] = { time: candles[i].time, value: null };
            continue;
        }

        // .cs: if (Buffer.Count == Length) { remove (Buffer[0], Buffer[1]) }
        // then PushBack(price); then if (Buffer.Count > 1) add (Buffer[^2], price).
        // We replicate the order exactly.
        if (buffer.length === length) {
            const oldPrice = buffer[0];
            const nextPrice = buffer[1];
            const removedDir = sign(nextPrice - oldPrice);
            if (removedDir !== 0) priceChanges -= 1;
            if (removedDir !== prevDirection && prevDirection !== 0) directionChanges -= 1;
            // .cs doesn't touch _prevDirection on removal.
            buffer.shift();
        }

        if (buffer.length > 0) {
            // Add contribution of (buffer[^1], price) — but .cs adds it AFTER
            // pushing the new value, looking at Buffer[^2] vs price. After we
            // push, Buffer[^2] == old last element == current buffer[^1].
            const prevPrice = buffer[buffer.length - 1];
            const addedDir = sign(price - prevPrice);
            if (addedDir !== 0) priceChanges += 1;
            if (addedDir !== prevDirection && prevDirection !== 0) directionChanges += 1;
            // .cs updates _prevDirection on insert.
            prevDirection = addedDir;
        }
        buffer.push(price);

        if (buffer.length >= length) {
            const mmi = priceChanges > 0 ? (100 * directionChanges) / priceChanges : 0;
            out[i] = { time: candles[i].time, value: mmi };
        } else {
            out[i] = { time: candles[i].time, value: null };
        }
    }
    return out;
}
