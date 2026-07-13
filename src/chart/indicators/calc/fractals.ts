// Bill Williams' Fractals.
// Port of StockSharp Algo.Indicators Fractals.cs + FractalPart.cs.
// Length must be > 2 and odd (validated in FractalPart.Length setter); the
// default in Fractals.cs is 5, giving the classic 5-bar pivot.
//
// Up-fractal at the center bar (index of `mid = Length/2` inside a sliding
// window of size Length) is detected when:
//   Buffer[0]   <  Buffer[1]   <  ... <  Buffer[mid]
//   Buffer[mid] >  Buffer[mid+1] > ... >  Buffer[Length-1]
// using high prices. Down-fractal mirrors on lows.
//
// Quirk worth highlighting (quoted from FractalPart.OnProcess):
//
//   var counter = _counter + 1;
//   if (input.IsFinal) _counter = counter;
//   if (counter < Length) return empty;
//   // ...check pivot pattern, may emit value...
//   if (input.IsFinal) _counter = default;   // reset to 0 only on pivot
//
// `_counter` resets to 0 ONLY when a pivot is emitted; non-pivot bars leave
// `_counter` ≥ Length, so the very next bar can fire another pivot. The
// `counter < Length` guard ONLY suppresses checks during the initial
// warm-up and the (Length-1) bars immediately after a pivot. Net effect:
// consecutive pivots are separated by at least Length-1 bars.
//
// Confirmation lag: when a 5-bar up-fractal fires at "current bar" i, the
// actual pivot lives at bar i - mid (= i - 2 for Length=5). The .cs
// returns this through a ShiftedIndicatorValue with `shift = numCenter`.
//
// Output shape:
//   { up:   IndicatorPoint[],   // sparse, value=high of pivot bar
//     down: IndicatorPoint[] }  // sparse, value=low of pivot bar
// up[i].value is non-null *only on the bar i where the up-fractal was
// confirmed*; the actual extremum is bar i - mid. Caller can plot the
// markers either at the confirmation bar or shift them back by `mid`.

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
 * @typedef {{time: string|number, value: number|null, shift?: number}} IndicatorPoint
 */

/**
 * @typedef {{up: IndicatorPoint[], down: IndicatorPoint[]}} FractalsSeries
 */

/**
 * @param {CandlePoint[]} candles
 * @param {{length?: number}} [params]
 * @returns {FractalsSeries}
 */
export function calcFractals(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 5;
    if (!Array.isArray(candles) || candles.length === 0) return { up: [], down: [] };

    const n = candles.length;
    const up = new Array(n);
    const down = new Array(n);
    for (let i = 0; i < n; i++) {
        up[i] = { time: candles[i].time, value: null };
        down[i] = { time: candles[i].time, value: null };
    }

    // Validation mirrors FractalPart.Length setter: must be > 2 and odd.
    if (length <= 2 || (length % 2) === 0) return { up, down };

    const mid = (length / 2) | 0;

    // Two independent counters to mirror two FractalPart instances (Up + Down).
    let upCounter = 0;
    let downCounter = 0;

    for (let i = 0; i < n; i++) {
        upCounter++;
        downCounter++;

        // Validate the trailing window of `length` candles.
        if (i < length - 1) continue;

        // --- Up fractal check (highs) ---
        if (upCounter >= length) {
            let ok = true;
            for (let k = 0; k < mid; k++) {
                const left = candles[i - length + 1 + k] && candles[i - length + 1 + k].high;
                const right = candles[i - length + 1 + k + 1] && candles[i - length + 1 + k + 1].high;
                if (typeof left !== 'number' || !Number.isFinite(left) ||
                    typeof right !== 'number' || !Number.isFinite(right) ||
                    left >= right) { ok = false; break; }
            }
            if (ok) {
                for (let k = mid; k < length - 1; k++) {
                    const left = candles[i - length + 1 + k] && candles[i - length + 1 + k].high;
                    const right = candles[i - length + 1 + k + 1] && candles[i - length + 1 + k + 1].high;
                    if (typeof left !== 'number' || !Number.isFinite(left) ||
                        typeof right !== 'number' || !Number.isFinite(right) ||
                        left <= right) { ok = false; break; }
                }
            }
            if (ok) {
                const pivotIdx = i - mid;
                up[i] = {
                    time: candles[i].time,
                    value: candles[pivotIdx].high,
                    shift: mid,
                };
                upCounter = 0; // mirror `_counter = default`
            }
        }

        // --- Down fractal check (lows) ---
        if (downCounter >= length) {
            let ok = true;
            for (let k = 0; k < mid; k++) {
                const left = candles[i - length + 1 + k] && candles[i - length + 1 + k].low;
                const right = candles[i - length + 1 + k + 1] && candles[i - length + 1 + k + 1].low;
                if (typeof left !== 'number' || !Number.isFinite(left) ||
                    typeof right !== 'number' || !Number.isFinite(right) ||
                    left <= right) { ok = false; break; }
            }
            if (ok) {
                for (let k = mid; k < length - 1; k++) {
                    const left = candles[i - length + 1 + k] && candles[i - length + 1 + k].low;
                    const right = candles[i - length + 1 + k + 1] && candles[i - length + 1 + k + 1].low;
                    if (typeof left !== 'number' || !Number.isFinite(left) ||
                        typeof right !== 'number' || !Number.isFinite(right) ||
                        left >= right) { ok = false; break; }
                }
            }
            if (ok) {
                const pivotIdx = i - mid;
                down[i] = {
                    time: candles[i].time,
                    value: candles[pivotIdx].low,
                    shift: mid,
                };
                downCounter = 0;
            }
        }
    }

    return { up, down };
}
