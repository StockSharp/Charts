// Chande Momentum Oscillator (Tushar Chande, 1994).
// Port of StockSharp Algo.Indicators ChandeMomentumOscillator.cs:
//   delta[i] = close[i] - close[i-1]
//   up[i]    = max(delta, 0)        dn[i] = max(-delta, 0)
//   sumUp    = Σ_{j=i-length+1..i} up[j]
//   sumDn    = Σ_{j=i-length+1..i} dn[j]
//   CMO[i]   = (sumUp + sumDn) == 0
//              ? 0
//              : 100 * (sumUp - sumDn) / (sumUp + sumDn)
//
// Like RSI but signed: range -100..+100, where +100 = pure up moves, -100
// pure down moves, 0 = balanced gains/losses. Default Length in
// StockSharp is **15** (not 14 like RSI) — kept here to match the desktop
// terminal exactly.
//
// Warm-up: deltas start at index 1, so a window of `length` deltas first
// becomes available at index = length. First non-null CMO lands at
// index `length`. (Same shape as RSI.)

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
export function calcCMO(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 15;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    if (length <= 0 || n <= length) return out;

    // Pre-compute per-bar up/dn from each delta (null for unusable bars).
    const ups = new Array(n);
    const dns = new Array(n);
    ups[0] = null;
    dns[0] = null;
    for (let i = 1; i < n; i++) {
        const prev = candles[i - 1] && candles[i - 1].close;
        const curr = candles[i] && candles[i].close;
        if (typeof prev !== 'number' || !Number.isFinite(prev) ||
            typeof curr !== 'number' || !Number.isFinite(curr)) {
            ups[i] = null;
            dns[i] = null;
            continue;
        }
        const d = curr - prev;
        ups[i] = d > 0 ? d : 0;
        dns[i] = d < 0 ? -d : 0;
    }

    // Rolling window sum over indices [i-length+1 .. i]. First valid window
    // covers deltas at positions [1..length], emitting at index `length`.
    for (let i = length; i < n; i++) {
        let sumUp = 0;
        let sumDn = 0;
        let bad = false;
        for (let j = i - length + 1; j <= i; j++) {
            const u = ups[j];
            const d = dns[j];
            if (u === null || d === null) { bad = true; break; }
            sumUp += u;
            sumDn += d;
        }
        if (bad) continue;
        const denom = sumUp + sumDn;
        const value = denom === 0 ? 0 : 100 * (sumUp - sumDn) / denom;
        out[i] = { time: candles[i].time, value };
    }
    return out;
}
