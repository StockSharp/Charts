// Ultimate Oscillator — JS port of D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\UltimateOscillator.cs.
// Deviations from .cs: none. Periods 7/14/28 fixed (matches .cs constants).
//
// Per bar (after first close is captured as prev):
//   BP = close - min(low, prevClose)
//   TR = max(high, prevClose) - min(low, prevClose)
//   bpSum7, bpSum14, bpSum28 = rolling Σ BP over those windows
//   trSum7, trSum14, trSum28 = rolling Σ TR over those windows
//   avg7  = bpSum7 / trSum7    (all 3 ratios)
//   UO    = 100 * (4*avg7 + 2*avg14 + 1*avg28) / 7
// Formed once the 28-period sum has filled (so first non-null UO lands at
// index 28 — 1 bar to capture prevClose + 28 bars of windowed sums).
//
// @typedef {{time:number|string,open:number,high:number,low:number,close:number,volume:number}} Candle
// @typedef {{time:number|string,value:number|null}} Point

/**
 * @param {Candle[]} candles
 * @param {object} [_params]
 * @returns {Point[]}
 */
export function calcUltimateOscillator(candles, _params) {
    if (!Array.isArray(candles) || candles.length === 0) return [];
    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    const PERIOD7 = 7, PERIOD14 = 14, PERIOD28 = 28;
    const W4 = 4, W2 = 2, W1 = 1;

    // We compute BP/TR per bar starting at i=1, then maintain rolling sums.
    const bp = new Array(n);
    const tr = new Array(n);
    for (let i = 0; i < n; i++) { bp[i] = null; tr[i] = null; }

    let prevClose: number | null = null;
    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const h = c && c.high;
        const l = c && c.low;
        const cl = c && c.close;
        const ok = typeof h === 'number' && Number.isFinite(h)
            && typeof l === 'number' && Number.isFinite(l)
            && typeof cl === 'number' && Number.isFinite(cl);
        if (!ok) {
            // Don't advance prevClose; emit null at this bar (already null).
            continue;
        }
        if (prevClose !== null) {
            const min = l < prevClose ? l : prevClose;
            const max = h > prevClose ? h : prevClose;
            bp[i] = cl - min;
            tr[i] = max - min;
        }
        prevClose = cl;
    }

    // Rolling sums of bp/tr over the three windows. Sum is "ready" only when
    // we have `period` consecutive valid (non-null) bp values.
    function rollingSum(values, period) {
        const sums = new Array(n);
        for (let i = 0; i < n; i++) sums[i] = null;
        let sum = 0, valid = 0;
        const win = new Array(period);
        let head = 0; // circular index
        // We treat null as "invalid sample" and reset window when one is hit.
        // Simpler approach: count consecutive valid trailing samples.
        let consec = 0;
        for (let i = 0; i < n; i++) {
            const v = values[i];
            if (v === null) {
                consec = 0;
                sum = 0;
                continue;
            }
            // Add current; if window already full, evict oldest.
            sum += v;
            consec++;
            if (consec > period) {
                // evict bar at i - period
                sum -= values[i - period];
                consec = period;
            }
            if (consec === period) sums[i] = sum;
        }
        return sums;
    }

    const bp7  = rollingSum(bp, PERIOD7);
    const bp14 = rollingSum(bp, PERIOD14);
    const bp28 = rollingSum(bp, PERIOD28);
    const tr7  = rollingSum(tr, PERIOD7);
    const tr14 = rollingSum(tr, PERIOD14);
    const tr28 = rollingSum(tr, PERIOD28);

    for (let i = 0; i < n; i++) {
        const b7 = bp7[i], b14 = bp14[i], b28 = bp28[i];
        const t7 = tr7[i], t14 = tr14[i], t28 = tr28[i];
        if (b7 === null || b14 === null || b28 === null
            || t7 === null || t14 === null || t28 === null) continue;
        if (t7 === 0 || t14 === 0 || t28 === 0) continue;
        const a7 = b7 / t7;
        const a14 = b14 / t14;
        const a28 = b28 / t28;
        const uo = 100 * (W4 * a7 + W2 * a14 + W1 * a28) / (W4 + W2 + W1);
        out[i] = { time: candles[i].time, value: uo };
    }

    return out;
}
