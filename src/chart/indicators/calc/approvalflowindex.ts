// Approval Flow Index (AFI).
// Port of StockSharp Algo.Indicators ApprovalFlowIndex.cs:
//
//   bar 0:          seed prevClose = close, emit null.
//   bars 1..Length: count++. each bar adds candle.TotalVolume to either
//                   _totalUpVolume (close > prevClose), _totalDownVolume
//                   (close < prevClose), or neither (==). prevClose is
//                   updated to current close. Emit null.
//   bar Length:     count reaches Length → IsFormed = true. STILL update
//                   totals on this bar, but do NOT update prevClose.
//                   Emit AFI = 100 * (totalUp - totalDown) / (totalUp + totalDown).
//   bar > Length:   IsFormed already true. The .cs code path is:
//                     - compute upVolume/downVolume against the FROZEN
//                       _prevClose (the close from bar Length-1).
//                     - update _totalUpVolume / _totalDownVolume.
//                     - return afi using the new totals.
//                     - prevClose is NOT touched any more.
//                   This is a quirk of the .cs (the `if (IsFormed) return`
//                   short-circuit skips the `_prevClose = candle.ClosePrice`
//                   write at the bottom). We replicate it verbatim so chart
//                   values match the desktop terminal.
//
// Output: { time, value } where value is in percent, range [-100..+100].
// Returns null when totals sum to zero (e.g. flat close series).
//
// .cs deviation note: the prevClose-freeze quirk described above is the
// only non-obvious behaviour; everything else is a straight port.

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
export function calcApprovalFlowIndex(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 14;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    if (length <= 0) return out;

    let prevClose = 0;          // .cs uses decimal 0 as "uninitialised" sentinel
    let totalUp = 0;
    let totalDown = 0;
    let count = 0;
    let isFormed = false;

    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const close = c && c.close;
        const vol = c && c.volume;
        if (typeof close !== 'number' || !Number.isFinite(close)) {
            // Gap in input — skip, keep state, emit null.
            continue;
        }
        const v = typeof vol === 'number' && Number.isFinite(vol) ? vol : 0;

        // Seed branch — .cs treats prevClose == 0 as "not yet seeded".
        if (prevClose === 0) {
            prevClose = close;
            continue;
        }

        if (!isFormed) {
            count++;
            if (count === length) isFormed = true;
        }

        const upVolume = close > prevClose ? v : 0;
        const downVolume = close < prevClose ? v : 0;

        totalUp += upVolume;
        totalDown += downVolume;

        if (isFormed) {
            const totalVolume = totalUp + totalDown;
            if (totalVolume !== 0) {
                out[i] = { time: c.time, value: 100 * (totalUp - totalDown) / totalVolume };
            }
            // .cs short-circuits here; prevClose stays frozen.
            continue;
        }

        // Only reached on bars where IsFormed is still false.
        prevClose = close;
    }

    return out;
}
