// Pivot Points (classic / floor-trader style).
// Port of StockSharp Algo.Indicators PivotPoints.cs.
//
// Per-candle formulas (using the just-closed candle's HLC):
//   pivot = (H + L + C) / 3                  // typical price
//   range = H - L                            // candle.GetLength()
//   R1    = 2*pivot - L
//   R2    = pivot + range
//   S1    = 2*pivot - H
//   S2    = pivot - range
//
// No warm-up: every bar emits a complete set of five levels from its own
// HLC. (Many charting packages use *previous* bar's HLC and hold the
// levels flat through the next bar — but StockSharp's PivotPoints.cs
// computes from the CURRENT candle, no shift. We mirror that.)
//
// Output shape (multi-output, mirrors PivotPointsValue.cs):
//   { pp: IndicatorPoint[], r1: IndicatorPoint[], r2: IndicatorPoint[],
//     s1: IndicatorPoint[], s2: IndicatorPoint[] }
// All five arrays are aligned 1:1 with input candles.
//
// .cs deviation notes:
//   (a) The .cs is a BaseComplexIndicator with five PivotPointPart inner
//       indicators (each just a pass-through). We don't need that scaffold
//       for the calc layer — we emit the five series directly.
//   (b) Bad bars (non-finite H/L/C) emit null on all five outputs for that
//       slot.

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
 * @typedef {object} PivotPointsSeries
 * @property {IndicatorPoint[]} pp
 * @property {IndicatorPoint[]} r1
 * @property {IndicatorPoint[]} r2
 * @property {IndicatorPoint[]} s1
 * @property {IndicatorPoint[]} s2
 */

/**
 * @param {CandlePoint[]} candles
 * @param {object} [_params] No tunables — accepted for registry uniformity.
 * @returns {PivotPointsSeries}
 */
export function calcPivotPoints(candles, _params) {
    if (!Array.isArray(candles) || candles.length === 0) {
        return { pp: [], r1: [], r2: [], s1: [], s2: [] };
    }

    const n = candles.length;
    const pp = new Array(n);
    const r1 = new Array(n);
    const r2 = new Array(n);
    const s1 = new Array(n);
    const s2 = new Array(n);

    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const t = c && c.time;
        const h = c && c.high;
        const l = c && c.low;
        const cl = c && c.close;

        if (typeof h !== 'number' || !Number.isFinite(h) ||
            typeof l !== 'number' || !Number.isFinite(l) ||
            typeof cl !== 'number' || !Number.isFinite(cl)) {
            pp[i] = { time: t, value: null };
            r1[i] = { time: t, value: null };
            r2[i] = { time: t, value: null };
            s1[i] = { time: t, value: null };
            s2[i] = { time: t, value: null };
            continue;
        }

        const pivot = (h + l + cl) / 3;
        const range = h - l;

        pp[i] = { time: t, value: pivot };
        r1[i] = { time: t, value: 2 * pivot - l };
        r2[i] = { time: t, value: pivot + range };
        s1[i] = { time: t, value: 2 * pivot - h };
        s2[i] = { time: t, value: pivot - range };
    }

    return { pp, r1, r2, s1, s2 };
}
