// Psychological Line — JS port of D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\PsychologicalLine.cs.
// Deviations from .cs: none — preserves the unusual buffer-drop check the
// .cs performs (Buffer[0] vs Buffer[^1] rather than Buffer[1]).
//
//   Sliding window of `length` closes. `_upCount` is an integer counter
//   updated incrementally:
//     when buffer full, drop step: if oldest (Buffer[0]) < newest (Buffer[^1])
//         then upCount--
//     add step: if current price > newest before push (Buffer[^1])
//         then upCount++
//     push price into buffer
//   Output once formed: upCount / length (a [0..1] ratio per the .cs's
//   MinusOnePlusOne measure; not multiplied by 100).
//
// @typedef {{time:number|string,open:number,high:number,low:number,close:number,volume:number}} Candle
// @typedef {{time:number|string,value:number|null}} Point

/**
 * @param {Candle[]} candles
 * @param {{length?: number}} [params]
 * @returns {Point[]}
 */
export function calcPsychologicalLine(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 20;
    if (!Array.isArray(candles) || candles.length === 0) return [];
    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };
    if (length <= 0) return out;

    /** @type {number[]} */
    const buffer: number[] = [];
    let upCount = 0;

    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const price = c && c.close;
        if (typeof price !== 'number' || !Number.isFinite(price)) {
            // Skip update; carry null at this slot.
            continue;
        }

        // Drop step: if buffer is full, remove the oldest's contribution.
        if (buffer.length === length) {
            if (buffer[0] < buffer[buffer.length - 1]) upCount--;
        }

        // Add step: if buffer non-empty and price beats the latest, count it.
        if (buffer.length > 0 && price > buffer[buffer.length - 1]) upCount++;

        // Push new price; drop oldest if over capacity.
        buffer.push(price);
        if (buffer.length > length) buffer.shift();

        // Formed once we have `length` samples in the buffer.
        if (buffer.length === length) {
            out[i] = { time: c.time, value: upCount / length };
        }
    }

    return out;
}
