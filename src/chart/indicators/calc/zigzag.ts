// ZigZag (price-reversal pivots).
// Port of StockSharp Algo.Indicators ZigZag.cs. The .cs streams a 2-slot
// circular buffer of recent prices and tracks four pieces of state:
//   * _lastExtremum — the running high (in an up-trend) or low (in a
//                     down-trend) since the last confirmed pivot.
//   * _isUpTrend    — current trend direction.
//   * _shift        — bars elapsed since the last pivot; 0 means "current
//                     bar". On a pivot it's incremented as part of returning
//                     the new value, then reset to 1 for the next leg.
//   * threshold     = _lastExtremum * Deviation.
//
// Per-bar logic (after the 2-bar warm-up):
//   if up-trend:
//       lastExtremum < price                 → extend lastExtremum = price
//       else price <= lastExtremum-threshold → confirm DOWN pivot @
//                                              value=lastExtremum, shift,
//                                              flip trend, seed new
//                                              lastExtremum = price.
//   if down-trend: mirror image.
//
// The pivot value belongs to the bar `currentIndex - shift` (the actual
// extremum was reached `shift` bars ago); we emit `{time, value, shift,
// isUp}` on the bar where the pivot is CONFIRMED. Non-pivot bars get
// `{time, value: null}` so output is sparse and aligned 1:1 with input
// (the parity harness preserves blank rows in the reference data so the
// row-by-row compare works directly).
//
// Quoting the .cs's nuance: after a pivot, `_shift = 1`. That means the
// new running extremum (set to the current bar's price) is treated as if
// it's already 1 bar old for the *next* pivot. So `shift` returned at a
// later confirmation = #bars since the previous pivot ‒ matching MT4's
// ZigZag drawing logic.

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
 * @typedef {object} ZigZagPoint
 * @property {string|number} time         current bar time
 * @property {number|null} value           pivot price, or null if no pivot here
 * @property {number} [shift]              bars back from current to actual pivot
 * @property {boolean} [isUp]              true = pivot was an up-extremum (peak)
 */

/**
 * @param {CandlePoint[]} candles
 * @param {{deviation?: number}} [params]
 * @returns {ZigZagPoint[]}
 */
export function calcZigZag(candles, params) {
    // Default matches StockSharp's `_deviation = 0.001m` field initializer
    // (the value that generated the reference Tests/Resources/IndicatorsData
    // data). The terminal UI typically passes its own user-chosen deviation
    // via `params.deviation`, so the calc-side default is only consulted
    // when no override is provided.
    const deviation = params && Number.isFinite(params.deviation) ? +params.deviation : 0.001;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    // ZigZag.cs guards Deviation to (0, 1).
    if (!(deviation > 0 && deviation < 1)) return out;
    if (n < 2) return out;

    // ZigZag uses the candle's "price" — which through Source=Close maps to
    // candle close. Mirrors `input.ToDecimal(Source)`.
    const price0 = candles[0] && candles[0].close;
    if (typeof price0 !== 'number' || !Number.isFinite(price0)) return out;

    let lastExtremum: number | null = null; // set on the FIRST formed bar (index 1).
    let isUpTrend: boolean | null = null;
    let shift = 0;

    for (let i = 1; i < n; i++) {
        const price = candles[i] && candles[i].close;
        const prevPrice = candles[i - 1] && candles[i - 1].close;
        if (typeof price !== 'number' || !Number.isFinite(price) ||
            typeof prevPrice !== 'number' || !Number.isFinite(prevPrice)) {
            continue;
        }

        // Initialize on first formed bar (i.e. the second candle in input).
        if (lastExtremum === null) {
            lastExtremum = price;
            isUpTrend = price >= prevPrice;
            // _shift stays at 0 — first pivot, if any, sees shift=0.
            continue;
        }

        const threshold = lastExtremum * deviation;
        let changeTrend = false;

        if (isUpTrend) {
            if (lastExtremum < price) {
                lastExtremum = price;
            } else if (price <= lastExtremum - threshold) {
                changeTrend = true;
            }
        } else {
            if (lastExtremum > price) {
                lastExtremum = price;
            } else if (price >= lastExtremum + threshold) {
                changeTrend = true;
            }
        }

        if (changeTrend) {
            out[i] = {
                time: candles[i].time,
                value: lastExtremum,
                shift,
                isUp: isUpTrend,
            };
            // Reset for the new leg — mirrors the `finally` block in the .cs.
            isUpTrend = !isUpTrend;
            lastExtremum = price;
            shift = 1;
        } else {
            shift++;
        }
    }

    return out;
}
