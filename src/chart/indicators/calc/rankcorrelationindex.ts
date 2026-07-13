// Rank Correlation Index (Spearman) — JS port of
// D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\RankCorrelationIndex.cs.
//
// For each window of `Length` closes, compute the Pearson correlation between
// the rank of each close in the window (average-rank tie-handling) and the
// trivial period ranks 1..Length. The result is Spearman's rho, in [-1, 1].
// Warm-up: first (length-1) values null.
// Deviations from .cs: none — same tie-handling, same Pearson-of-ranks
// computation.
//
// @typedef {{time:number|string,open:number,high:number,low:number,close:number,volume:number}} Candle
// @typedef {{time:number|string,value:number|null}} Point

/**
 * Build rank array with average rank for ties — direct port of .cs GetRanks.
 * @param {number[]} values
 * @returns {number[]}
 */
function ranksWithTies(values) {
    const n = values.length;
    const ranks = new Array(n);
    const indices = new Array(n);
    for (let i = 0; i < n; i++) indices[i] = i;
    indices.sort((a, b) => values[a] - values[b]);

    for (let i = 0; i < n; ) {
        let j = i;
        let sum = 0;
        let cnt = 0;
        const val = values[indices[i]];
        while (j < n && values[indices[j]] === val) {
            sum += j + 1;
            cnt++;
            j++;
        }
        const avgRank = sum / cnt;
        for (let k = i; k < j; k++) ranks[indices[k]] = avgRank;
        i = j;
    }
    return ranks;
}

function pearsonOfRanks(r1, r2) {
    const n = r1.length;
    if (n <= 1) return 0;
    let m1 = 0;
    let m2 = 0;
    for (let i = 0; i < n; i++) { m1 += r1[i]; m2 += r2[i]; }
    m1 /= n; m2 /= n;
    let num = 0;
    let sq1 = 0;
    let sq2 = 0;
    for (let i = 0; i < n; i++) {
        const d1 = r1[i] - m1;
        const d2 = r2[i] - m2;
        num += d1 * d2;
        sq1 += d1 * d1;
        sq2 += d2 * d2;
    }
    const den = Math.sqrt(sq1 * sq2);
    if (den === 0) return 0;
    return num / den;
}

/**
 * @param {Candle[]} candles
 * @param {{length?: number}} [params]
 * @returns {Point[]}
 */
export function calcRankCorrelationIndex(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 14;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i] && candles[i].time, value: null };

    if (length <= 1 || n < length) return out;

    const periodRanks = new Array(length);
    for (let i = 0; i < length; i++) periodRanks[i] = i + 1;

    for (let i = length - 1; i < n; i++) {
        const window = new Array(length);
        let bad = false;
        for (let k = 0; k < length; k++) {
            const v = candles[i - length + 1 + k] && candles[i - length + 1 + k].close;
            if (typeof v !== 'number' || !Number.isFinite(v)) { bad = true; break; }
            window[k] = v;
        }
        if (bad) continue;
        const valueRanks = ranksWithTies(window);
        out[i] = { time: candles[i].time, value: pearsonOfRanks(valueRanks, periodRanks) };
    }
    return out;
}
