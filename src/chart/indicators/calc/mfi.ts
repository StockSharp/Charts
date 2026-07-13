// Money Flow Index (Algo.Indicators/MoneyFlowIndex.cs).
//
// Volume-weighted RSI on typical price:
//   typical[i]   = (high + low + close) / 3
//   moneyFlow[i] = typical[i] * volume[i]
//   posFlow[i]   = moneyFlow[i] if typical[i] > typical[i-1] else 0
//   negFlow[i]   = moneyFlow[i] if typical[i] < typical[i-1] else 0
// Each flow is summed over the trailing `length` window (default 14).
// First non-null at index `length` (since flow comparison needs i-1, plus
// the Sum needs `length` values: the .cs Sum is fed starting at i=0 with
// `_previousPrice` initially 0, so the very first input contributes posFlow
// = moneyFlow (since typical > 0). We replicate that exactly.).
//
// MFI formula at output:
//   if negFlowSum == 0 → 100
//   else if (posFlowSum + negFlowSum) == 0 → null
//   else → 100 * posFlowSum / (posFlowSum + negFlowSum)
//
// Deviation vs .cs: none. The .cs Sum.IsFormed gates output and we mirror
// that with `length` push count tracking.

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
export function calcMoneyFlowIndex(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 14;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    if (length <= 0) {
        for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };
        return out;
    }

    // .cs initialises _previousPrice = 0; so on the first iteration
    // typicalPrice > 0 is essentially always true ⇒ contributes posFlow.
    let prevTypical = 0;
    const posBuf: number[] = []; // sliding window of posFlow
    const negBuf: number[] = []; // sliding window of negFlow
    let posSum = 0;
    let negSum = 0;

    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const h = c && c.high;
        const l = c && c.low;
        const cl = c && c.close;
        const v = c && c.volume;
        const finite = (x) => typeof x === 'number' && Number.isFinite(x);
        if (!finite(h) || !finite(l) || !finite(cl) || !finite(v)) {
            // Carry sliding windows forward by inserting a 0 to keep length aligned;
            // and emit null. This is a defensive choice — the .cs would NRE on
            // bad inputs but we don't want a single bad print to break the chart.
            posBuf.push(0); negBuf.push(0);
            if (posBuf.length > length) { posSum -= posBuf.shift()!; negSum -= negBuf.shift()!; }
            out[i] = { time: c ? c.time : null, value: null };
            // Reset reference so next valid bar starts with the .cs-equivalent
            // "previous typical == this typical" check via stale 0.
            continue;
        }
        const typical = (h + l + cl) / 3;
        const moneyFlow = typical * v;
        const pos = typical > prevTypical ? moneyFlow : 0;
        const neg = typical < prevTypical ? moneyFlow : 0;
        prevTypical = typical;

        posBuf.push(pos);
        negBuf.push(neg);
        posSum += pos;
        negSum += neg;
        if (posBuf.length > length) {
            posSum -= posBuf.shift()!;
            negSum -= negBuf.shift()!;
        }

        if (posBuf.length < length) {
            out[i] = { time: c.time, value: null };
            continue;
        }
        if (negSum === 0) {
            out[i] = { time: c.time, value: 100 };
        } else {
            const total = posSum + negSum;
            if (total === 0) {
                out[i] = { time: c.time, value: null };
            } else {
                out[i] = { time: c.time, value: 100 * posSum / total };
            }
        }
    }
    return out;
}
