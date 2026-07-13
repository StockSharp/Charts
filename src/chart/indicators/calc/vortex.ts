// Vortex Indicator — JS port of D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\VortexIndicator.cs.
// VI+ = sum(|high - prev_low|, N) / sum(TR, N)
// VI- = sum(|low  - prev_high|, N) / sum(TR, N)
// where TR = max(high-low, |high-prev_close|, |low-prev_close|).
// Default Length = 14 per .cs ctor. First non-null bar at index N
// (need prev_close from bar 0 and N rolling TR/VM samples thereafter).
//
// Deviations from .cs: none — when sums of TR is 0 we emit 0 to match the
// .cs behaviour at extreme zero-range conditions.
//
// @typedef {{time:number|string,open:number,high:number,low:number,close:number,volume:number}} Candle
// @typedef {{time:number|string,value:number|null}} Point

/**
 * @param {Candle[]} candles
 * @param {{length?: number}} [params]
 * @returns {{viPlus: Point[], viMinus: Point[]}}
 */
export function calcVortex(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 14;
    if (!Array.isArray(candles) || candles.length === 0) {
        return { viPlus: [], viMinus: [] };
    }

    const n = candles.length;
    const viPlus = new Array(n);
    const viMinus = new Array(n);
    for (let i = 0; i < n; i++) {
        viPlus[i] = { time: candles[i].time, value: null };
        viMinus[i] = { time: candles[i].time, value: null };
    }

    if (length <= 0 || n < 2) return { viPlus, viMinus };

    // Per-bar TR, VM+ and VM- — null on the first bar (no prev).
    const tr = new Array(n);
    const vmPlus = new Array(n);
    const vmMinus = new Array(n);
    tr[0] = null;
    vmPlus[0] = null;
    vmMinus[0] = null;
    for (let i = 1; i < n; i++) {
        const c = candles[i], p = candles[i - 1];
        const h = c && c.high, l = c && c.low;
        const pH = p && p.high, pL = p && p.low, pC = p && p.close;
        if (typeof h !== 'number' || !Number.isFinite(h) ||
            typeof l !== 'number' || !Number.isFinite(l) ||
            typeof pH !== 'number' || !Number.isFinite(pH) ||
            typeof pL !== 'number' || !Number.isFinite(pL) ||
            typeof pC !== 'number' || !Number.isFinite(pC)) {
            tr[i] = null;
            vmPlus[i] = null;
            vmMinus[i] = null;
            continue;
        }
        tr[i] = Math.max(h - l, Math.abs(h - pC), Math.abs(l - pC));
        vmPlus[i] = Math.abs(h - pL);
        vmMinus[i] = Math.abs(l - pH);
    }

    // Rolling sums. First emit at index = length (need length samples from
    // index 1 inclusive, so last sample is at index `length`).
    for (let i = length; i < n; i++) {
        let sumTr = 0, sumVp = 0, sumVm = 0, bad = false;
        for (let j = i - length + 1; j <= i; j++) {
            if (tr[j] === null || vmPlus[j] === null || vmMinus[j] === null) { bad = true; break; }
            sumTr += tr[j];
            sumVp += vmPlus[j];
            sumVm += vmMinus[j];
        }
        if (bad) continue;
        const vp = sumTr !== 0 ? sumVp / sumTr : 0;
        const vm = sumTr !== 0 ? sumVm / sumTr : 0;
        viPlus[i] = { time: candles[i].time, value: vp };
        viMinus[i] = { time: candles[i].time, value: vm };
    }
    return { viPlus, viMinus };
}
