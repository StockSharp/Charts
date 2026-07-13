// Intraday Momentum Index (IMI).
// Port of StockSharp Algo.Indicators IntradayMomentumIndex.cs.
//
// RSI-style oscillator that uses each bar's open/close pair (not consecutive
// closes). Default Length=14.
//
//   upMove[i]   = max(close[i] - open[i], 0)
//   downMove[i] = max(open[i]  - close[i], 0)
//   sumUp   = Σ upMove   over the trailing Length bars
//   sumDown = Σ downMove over the trailing Length bars
//   IMI     = 100 * sumUp / (sumUp + sumDown)   (0 if denom == 0)
//
// First non-null output is at index Length-1 (after Length bars accumulated).
//
// .cs deviation notes:
// (a) The .cs uses a CircularBufferEx with capacity = Length and incremental
//     running sums to keep the per-bar work O(1). We replicate the algorithm
//     using a recomputed rolling sum (clearer in JS, still O(Length) per
//     bar — fine for client-side use). Output is bit-identical.
// (b) If denom == 0 (a perfectly flat window — every bar's open == close),
//     the .cs returns 0 (NOT null/NaN). We mirror.

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
export function calcIntradayMomentumIndex(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 14;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    if (length <= 0) return out;

    // Per-bar (upMove, downMove) — NaN if open/close are bad.
    const upMove = new Array(n);
    const downMove = new Array(n);
    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const o = c && c.open;
        const cl = c && c.close;
        if (typeof o !== 'number' || !Number.isFinite(o) ||
            typeof cl !== 'number' || !Number.isFinite(cl)) {
            upMove[i] = NaN;
            downMove[i] = NaN;
        } else {
            const diff = cl - o;
            upMove[i] = diff > 0 ? diff : 0;
            downMove[i] = diff < 0 ? -diff : 0;
        }
    }

    // Rolling sums of the trailing `length` upMoves / downMoves. Mirror the
    // .cs semantics: any non-finite bar in the window invalidates the output.
    for (let i = length - 1; i < n; i++) {
        let sumUp = 0;
        let sumDown = 0;
        let bad = false;
        for (let k = i - length + 1; k <= i; k++) {
            const u = upMove[k];
            const d = downMove[k];
            if (!Number.isFinite(u) || !Number.isFinite(d)) { bad = true; break; }
            sumUp += u;
            sumDown += d;
        }
        if (bad) continue;
        const den = sumUp + sumDown;
        out[i] = { time: candles[i].time, value: den !== 0 ? 100 * (sumUp / den) : 0 };
    }

    return out;
}
