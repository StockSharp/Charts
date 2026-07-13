// Parabolic SAR (Welles Wilder) — line-by-line port of
// D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\ParabolicSar.cs.
//
// The C# implementation is unusual in several ways and we mirror them
// exactly to match the reference data:
//
//   1. The internal `candles` list starts empty. The very first IsFinal=true
//      call appends the candle TWICE (once because Count==0, again because
//      isFinal). So after bar 0 we have [c0, c0]; bar 1 yields [c0, c0, c1].
//      That means at bar 1 the list reaches Count==3 and the seed branch
//      fires. _longPosition is `candles[^1].HighPrice > candles[^2].HighPrice`
//      — i.e. c1.High > c0.High (the duplicated c0 is at index 1).
//      Max/Min over the whole 3-element list reduces to Max/Min of (c0, c1).
//
//   2. Seed SAR formula: _xp + (longPosition ? -1 : 1) * (max - min) * _af,
//      where _xp = max if long else min. Equivalent to "the opposite extreme
//      shifted by af*(range) toward the EP" — emphatically NOT the simple
//      "use opposite extreme" that a 2-bar seed would give.
//
//   3. From bar 2 onward, `_reverseBar != candles.Count` is the gate that
//      runs the normal SAR step (plus its 2-bar clamp and bidirectional
//      reversal check that can mutate state via Reverse()). On a reversal
//      bar, the result is returned directly from Reverse() (skipping the
//      regular value computation), and `_reverseBar = candles.Count` so the
//      NEXT bar takes the `else` branch instead (no fresh _todaySar; the
//      previous _prevSar is reused as `value`).
//
//   4. _prevValue is `GetCurrentValue()` (= last stored indicator output),
//      taken at the top of each Calculate call. So _prevValue is *whatever
//      we returned last bar*, not _prevSar (they can diverge after a
//      reversal: the bar that flipped returns _xp via Reverse(), while
//      _prevSar gets set to that same _xp).
//
// Default params per .cs ctor: Acceleration=0.02, AccelerationStep=0.02,
// AccelerationMax=0.2.

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
 * @param {{acceleration?: number, accelerationMax?: number, accelerationStep?: number}} [params]
 * @returns {IndicatorPoint[]}
 */
export function calcParabolicSAR(candles, params) {
    const acceleration = params && Number.isFinite(params.acceleration) ? +params.acceleration : 0.02;
    const accelerationMax = params && Number.isFinite(params.accelerationMax) ? +params.accelerationMax : 0.2;
    const accelerationStep = params && Number.isFinite(params.accelerationStep) ? +params.accelerationStep : 0.02;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    // Internal state (mirrors CalcBuffer struct fields).
    /** @type {object[]} */
    const list: CandlePoint[] = []; // _candles list inside ParabolicSar (with the bar-0 double-add quirk)
    let longPosition = false;
    let xp = 0;
    let af = 0;
    let prevBar = 0;
    let afIncreased = false;
    let reverseBar = 0;
    let reverseValue = 0;
    let prevSar = 0;
    let todaySar = 0;
    // _prevValue inside Calculate is GetCurrentValue() — the last *stored*
    // indicator output. We treat 0/null as "no value" (C# returns
    // DecimalIndicatorValue with no decimal when val==0).
    let lastReturned = 0;

    // TodaySar helper. Returns the adjusted SAR; may flip the trend via
    // a Reverse() call (and mutates state accordingly).
    function todaySarFn(candidate) {
        if (longPosition) {
            const tail1Low = list[list.length - 1].low;
            const tail2Low = list[list.length - 2].low;
            const lowestSar = Math.min(candidate, tail1Low, tail2Low);
            if (list[list.length - 1].low > lowestSar) {
                return lowestSar;
            }
            return reverseFn();
        }
        const tail1High = list[list.length - 1].high;
        const tail2High = list[list.length - 2].high;
        const highestSar = Math.max(candidate, tail1High, tail2High);
        if (list[list.length - 1].high < highestSar) {
            return highestSar;
        }
        return reverseFn();
    }

    function reverseFn() {
        let result = xp;
        const tail1 = list[list.length - 1];
        const shouldFlip =
            (longPosition && prevSar > tail1.low) ||
            (!longPosition && prevSar < tail1.high) ||
            (prevBar !== list.length);
        if (shouldFlip) {
            longPosition = !longPosition;
            reverseBar = list.length;
            reverseValue = xp;
            af = acceleration;
            xp = longPosition ? tail1.high : tail1.low;
            prevSar = result;
        } else {
            result = prevSar;
        }
        return result;
    }

    function afIncrease() {
        if (afIncreased) return;
        af = Math.min(accelerationMax, af + accelerationStep);
        afIncreased = true;
    }

    for (let i = 0; i < n; i++) {
        const c = candles[i];
        if (!c || !Number.isFinite(c.high) || !Number.isFinite(c.low)) {
            out[i] = { time: c ? c.time : null, value: null };
            // Still advance the candle list so indexing stays consistent.
            // But C# would happily process NaN — we just skip emit on bad data.
            continue;
        }

        // Mirror Calculate()'s candle-list maintenance (IsFinal=true path):
        //   if (candles.Count == 0) candles.Add(candle);
        //   if (isFinal) candles.Add(candle);
        // → bar 0: appends twice; bars 1+: append once.
        if (list.length === 0) list.push(c);
        list.push(c);

        // _prevValue = currentValue at top of Calculate.
        const prevValue = lastReturned;

        if (list.length < 3) {
            // Not enough samples; return prevValue (which is 0 on bar 0).
            // C# emits empty value when val==0 — we emit null.
            // lastReturned stays at prevValue (==0).
            out[i] = { time: c.time, value: null };
            continue;
        }

        if (list.length === 3) {
            // Seed branch (fires on bar 1).
            const tailHi = list[list.length - 1].high;
            const tail2Hi = list[list.length - 2].high;
            longPosition = tailHi > tail2Hi;
            let mx = -Infinity;
            let mn = Infinity;
            for (let k = 0; k < list.length; k++) {
                if (list[k].high > mx) mx = list[k].high;
                if (list[k].low < mn) mn = list[k].low;
            }
            xp = longPosition ? mx : mn;
            af = acceleration;
            const seedSar = xp + (longPosition ? -1 : 1) * (mx - mn) * af;
            lastReturned = seedSar;
            out[i] = { time: c.time, value: seedSar };
            continue;
        }

        // Steady state.
        if (afIncreased && prevBar !== list.length) afIncreased = false;

        let value = prevValue;

        if (reverseBar !== list.length) {
            // Compute candidate SAR before clamping / reversal checks.
            todaySar = todaySarFn(prevValue + af * (xp - prevValue));

            // Clamp by the prior 2 bars' opposite extreme.
            for (let x = 1; x <= 2; x++) {
                const t = list[list.length - 1 - x];
                if (longPosition) {
                    if (todaySar > t.low) todaySar = t.low;
                } else {
                    if (todaySar < t.high) todaySar = t.high;
                }
            }

            // Reversal trigger: if today's or yesterday's price crosses SAR.
            const tail1 = list[list.length - 1];
            const tail2 = list[list.length - 2];
            const cross =
                (longPosition && (tail1.low < todaySar || tail2.low < todaySar)) ||
                (!longPosition && (tail1.high > todaySar || tail2.high > todaySar));

            if (cross) {
                const r = reverseFn();
                lastReturned = r;
                out[i] = { time: c.time, value: r };
                prevBar = list.length;
                continue;
            }

            if (longPosition) {
                if (prevBar !== list.length || tail1.low < prevSar) {
                    value = todaySar;
                    prevSar = todaySar;
                } else {
                    value = prevSar;
                }
                if (tail1.high > xp) {
                    xp = tail1.high;
                    afIncrease();
                }
            } else {
                if (prevBar !== list.length || tail1.high > prevSar) {
                    value = todaySar;
                    prevSar = todaySar;
                } else {
                    value = prevSar;
                }
                if (tail1.low < xp) {
                    xp = tail1.low;
                    afIncrease();
                }
            }
        } else {
            // Just-reversed bar — _reverseBar already equals current count.
            const tail1 = list[list.length - 1];
            if (longPosition && tail1.high > xp) {
                xp = tail1.high;
            } else if (!longPosition && tail1.low < xp) {
                xp = tail1.low;
            }
            value = prevSar;
            // Side-effect only; computed but not returned this bar.
            todaySar = todaySarFn(
                longPosition ? Math.min(reverseValue, tail1.low) : Math.max(reverseValue, tail1.high)
            );
        }

        prevBar = list.length;
        lastReturned = value;
        out[i] = { time: c.time, value };
    }

    return out;
}
