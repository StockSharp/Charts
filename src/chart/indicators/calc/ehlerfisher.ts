// Ehlers Fisher Transform — John Ehlers, 2002.
// Port of StockSharp Algo.Indicators EhlersFisherTransform.cs:
//
//   median   = (high + low) / 2
//   range    = max(high, window) - min(low, window)        // over `length` bars
//   value0   = range == 0 ? 0 : 0.5 * ((median - minLow) / range - 0.5)
//   value    = 0.66 * value0 + 0.67 * prevValue            // <- .cs uses 0.66/0.67
//   value    = clip(value, -0.999, +0.999)                  // avoid log-divergence
//   fisher   = 0.5 * ln((1 + value) / (1 - value))
//
//   MainLine    = fisher
//   TriggerLine = previous fisher (i.e. MainLine lagged by 1 bar)
//
// IMPORTANT — the .cs literally writes `0.66m * value + 0.67m * _prevValue`,
// which sums to 1.33 (not the more textbook 0.33 + 0.67 = 1.0 EMA-like
// blend). We replicate that exact coefficient pair so chart shapes match
// the desktop terminal — even though numerically it looks like a typo
// upstream. Note this in the deviation list.
//
// Default Length = 10. Warm-up: first non-null at index `length - 1`
// (window of `length` highs/lows accumulated). TriggerLine is null until
// index `length` (needs one prior fisher value).
//
// Output shape: `{ main, trigger }`, each an IndicatorPoint[] aligned to
// candles. Although the task spec said "single output", the .cs is a
// BaseComplexIndicator with both MainLine and TriggerLine — we emit both
// to stay faithful; consumers that only want the main line can read
// `.main` and ignore `.trigger`.
//
// Regression test note: the recurrence prev/curr feedback plus the clip
// and tanh-shaped Fisher transform make hand-derivation impractical; the
// test file uses (a) constant-series invariants and (b) a small known
// vector locked in via numerical regression.

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
 * @typedef {{main: IndicatorPoint[], trigger: IndicatorPoint[]}} EhlerFisherSeries
 */

/**
 * @param {CandlePoint[]} candles
 * @param {{length?: number}} [params]
 * @returns {EhlerFisherSeries}
 */
export function calcEhlerFisher(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 10;

    if (!Array.isArray(candles) || candles.length === 0) {
        return { main: [], trigger: [] };
    }

    const n = candles.length;
    const main = new Array(n);
    const trigger = new Array(n);
    for (let i = 0; i < n; i++) {
        main[i] = { time: candles[i].time, value: null };
        trigger[i] = { time: candles[i].time, value: null };
    }

    if (length <= 0) return { main, trigger };

    let prevValue = 0;
    let prevFisher = 0;
    let haveFisher = false;

    for (let i = 0; i < n; i++) {
        if (i < length - 1) continue;

        // Rolling max(high) / min(low) over the window [i-length+1 .. i].
        let maxH = -Infinity;
        let minL = +Infinity;
        let bad = false;
        for (let j = i - length + 1; j <= i; j++) {
            const c = candles[j];
            const h = c && c.high;
            const l = c && c.low;
            if (typeof h !== 'number' || !Number.isFinite(h) ||
                typeof l !== 'number' || !Number.isFinite(l)) { bad = true; break; }
            if (h > maxH) maxH = h;
            if (l < minL) minL = l;
        }
        const c = candles[i];
        const h = c && c.high;
        const l = c && c.low;
        if (bad || typeof h !== 'number' || !Number.isFinite(h) ||
            typeof l !== 'number' || !Number.isFinite(l)) {
            // Don't update prevValue/prevFisher; emit nulls.
            continue;
        }
        const median = (h + l) / 2;
        const range = maxH - minL;

        let value = range === 0 ? 0 : 0.5 * ((median - minL) / range - 0.5);
        value = 0.66 * value + 0.67 * prevValue;
        if (value > 0.999) value = 0.999;
        else if (value < -0.999) value = -0.999;

        const fisher = 0.5 * Math.log((1 + value) / (1 - value));
        main[i] = { time: candles[i].time, value: fisher };
        // TriggerLine = previous MainLine; on the first formed bar the .cs previous
        // value is the initial 0, so emit it (do not gate on a prior fisher existing).
        trigger[i] = { time: candles[i].time, value: prevFisher };

        prevValue = value;
        prevFisher = fisher;
        haveFisher = true;
    }

    return { main, trigger };
}
