// Peak — local-maximum detector built on the ZigZag engine.
// Port of StockSharp Algo.Indicators Peak.cs.
//
// .cs is a thin subclass of ZigZag:
//   protected override OnProcess(input) {
//       var candle = input.ToCandle();
//       if (candle is null) return empty;
//       var value = CalcZigZag(input, candle.HighPrice);   // feed = HIGH
//       if (!value.IsEmpty && !value.IsUp) return empty;   // suppress troughs
//       return value;                                      // emit only peaks
//   }
//
// Two key differences from our existing zigzag.js calc:
//   (a) Price feed is `candle.HighPrice`, not `candle.ClosePrice`. ZigZag
//       in StockSharp routes through `input.ToDecimal(Source)` where Source
//       defaults to Close; Peak overrides that to High.
//   (b) Only up-pivots (peaks) are emitted — down-pivots become null so
//       the output series is sparse (non-null only at confirmed peak bars,
//       with the peak's high price as the value). Output length always
//       equals candles.length; the parity harness preserves the empty
//       rows in the reference data for the row-by-row compare.
//
// We re-implement the ZigZag state machine inline rather than calling
// calcZigZag — calcZigZag is close-fixed; threading a price source through
// it would be intrusive. Re-implementing here is a few dozen lines and
// keeps both files focused.
//
// Deviation parameter default: 0.001 — matches StockSharp's ZigZag.cs
// `_deviation = 0.001m` field initialiser. This is the value that generated
// the reference Tests/Resources/IndicatorsData/Peak.txt data. Callers
// supply their own override via `params.deviation` for live charts.
//
// .cs deviation notes:
//   (a) The .cs returns `value.Time` (rather than current input time) when
//       suppressing a down-pivot. That's just the time of the ZigZag value;
//       in practice it equals input.Time on the bar where the pivot is
//       confirmed. We use the candle's own time consistently — same
//       observable shape.
//   (b) Output points carry `shift` (bars back from confirmation to the
//       actual peak), same convention as our zigzag.js.

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
 * @typedef {object} PeakPoint
 * @property {string|number} time
 * @property {number|null} value   peak high price, or null if no peak here
 * @property {number} [shift]      bars back to the actual peak bar
 */

/**
 * @param {CandlePoint[]} candles
 * @param {{deviation?: number}} [params]
 * @returns {PeakPoint[]}
 */
export function calcPeak(candles, params) {
    const deviation = params && Number.isFinite(params.deviation) ? +params.deviation : 0.001;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    // Same guard as ZigZag.cs: Deviation must be in (0, 1).
    if (!(deviation > 0 && deviation < 1)) return out;
    if (n < 2) return out;

    const price0 = candles[0] && candles[0].high;
    if (typeof price0 !== 'number' || !Number.isFinite(price0)) return out;

    let lastExtremum: number | null = null;
    let isUpTrend: boolean | null = null;
    let shift = 0;

    for (let i = 1; i < n; i++) {
        const price = candles[i] && candles[i].high;
        const prevPrice = candles[i - 1] && candles[i - 1].high;
        if (typeof price !== 'number' || !Number.isFinite(price) ||
            typeof prevPrice !== 'number' || !Number.isFinite(prevPrice)) {
            continue;
        }

        if (lastExtremum === null) {
            lastExtremum = price;
            isUpTrend = price >= prevPrice;
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
            // Only emit when the *just-closed* leg was an up-leg (a peak).
            // .cs: `if (!typed.IsUp) return empty;`. IsUp on the ZigZag
            // value is "the leg that just confirmed was an up-leg" — i.e.
            // we were in an up-trend and now reversed down.
            if (isUpTrend) {
                out[i] = {
                    time: candles[i].time,
                    value: lastExtremum,
                    shift,
                };
            }
            isUpTrend = !isUpTrend;
            lastExtremum = price;
            shift = 1;
        } else {
            shift++;
        }
    }

    return out;
}
