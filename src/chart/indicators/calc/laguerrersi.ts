// Laguerre RSI (Algo.Indicators/LaguerreRSI.cs).
// Four-stage Laguerre filter chained off the candle close, then an RSI-style
// up/down accumulator across the four filter stages, smoothed by the same
// gamma. Output ranges 0..100.
//
// .cs state: l0, l1, l2, l3 (filter stages) and prevCU, prevCD (smoothed
// up/down). Single parameter: Gamma ∈ (0, 1), default 0.7.
//
// Per-bar update (verbatim from .cs):
//   l0 = (1 - gamma) * price + gamma * l0_prev
//   l1 = -gamma * l0 + l0_prev + gamma * l1_prev
//   l2 = -gamma * l1 + l1_prev + gamma * l2_prev
//   l3 = -gamma * l2 + l2_prev + gamma * l3_prev
//
//   cu = 0; cd = 0
//   if l0 >= l1: cu += l0 - l1 else cd += l1 - l0
//   if l1 >= l2: cu += l1 - l2 else cd += l2 - l1
//   if l2 >= l3: cu += l2 - l3 else cd += l3 - l2
//
//   smoothCU = (1 - gamma) * cu + gamma * prevCU
//   smoothCD = (1 - gamma) * cd + gamma * prevCD
//
//   lrsi = (smoothCU + smoothCD) != 0 ? smoothCU / (smoothCU + smoothCD) * 100 : 50
//
// .cs sets IsFormed = true on the FIRST final input, so there is no warm-up
// — every candle emits a value starting from index 0. We mirror that
// behaviour: no null padding at the head.

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
 * @param {{gamma?: number}} [params]
 * @returns {IndicatorPoint[]}
 */
export function calcLaguerreRSI(candles, params) {
    if (!Array.isArray(candles) || candles.length === 0) return [];
    const n = candles.length;

    let gamma = params && Number.isFinite(params.gamma) ? +params.gamma : 0.7;
    // Match the .cs Range(0.000001, 0.999999): clamp without throwing — JS
    // indicator calculators are best-effort.
    if (!(gamma > 0 && gamma < 1)) gamma = 0.7;

    const gamma1 = 1 - gamma;

    let l0 = 0, l1 = 0, l2 = 0, l3 = 0;
    let prevCU = 0, prevCD = 0;

    const out = new Array(n);
    for (let i = 0; i < n; i++) {
        const price = candles[i] && candles[i].close;
        if (typeof price !== 'number' || !Number.isFinite(price)) {
            // Hold state, emit null for the gap.
            out[i] = { time: candles[i].time, value: null };
            continue;
        }

        const newL0 = gamma1 * price + gamma * l0;
        const newL1 = -gamma * newL0 + l0 + gamma * l1;
        const newL2 = -gamma * newL1 + l1 + gamma * l2;
        const newL3 = -gamma * newL2 + l2 + gamma * l3;

        let cu = 0, cd = 0;
        if (newL0 >= newL1) cu += newL0 - newL1; else cd += newL1 - newL0;
        if (newL1 >= newL2) cu += newL1 - newL2; else cd += newL2 - newL1;
        if (newL2 >= newL3) cu += newL2 - newL3; else cd += newL3 - newL2;

        const smoothCU = gamma1 * cu + gamma * prevCU;
        const smoothCD = gamma1 * cd + gamma * prevCD;

        const denom = smoothCU + smoothCD;
        const lrsi = denom !== 0 ? (smoothCU / denom) * 100 : 50;

        out[i] = { time: candles[i].time, value: lrsi };

        // Commit state — equivalent to .cs `if (input.IsFinal) { ... }`.
        l0 = newL0; l1 = newL1; l2 = newL2; l3 = newL3;
        prevCU = smoothCU; prevCD = smoothCD;
    }

    return out;
}
