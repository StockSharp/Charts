// Elder Impulse System (Algo.Indicators/ElderImpulseSystem.cs).
// Single numeric output per bar:
//   +1 (green)   when current EMA > prev EMA AND current MACD > prev MACD
//   −1 (red)     when current EMA < prev EMA AND current MACD < prev MACD
//    0 (blue)    otherwise (mixed / flat)
//
// Inner indicators (defaults from .cs):
//   * EMA   length=13
//   * MACD  short=12, long=26 (i.e. MovingAverageConvergenceDivergence with
//                              the default ctor → ShortMa=12, LongMa=26)
//
// Per .cs, MACD's value = ShortEMA - LongEMA (the "MACD line", no signal).
// `MovingAverageConvergenceDivergence.CalcIsFormed()` returns
// `LongMa.IsFormed`, so MACD first becomes formed at bar `long.Length - 1`.
// The EMA forms at bar `Ema.Length - 1` (= 12 for the default), which is
// earlier; so MACD is the binding constraint.
//
// Output:
//   { time, value, state? }
//
//   value: numeric -1 / 0 / +1 (matches the .cs decimal return).
//   state: optional convenience string "green" / "blue" / "red" — added
//          per spec for non-numeric serialisation. Consumers may use
//          `value` directly for math or `state` for colouring.
//
// Deviation vs .cs:
//   The .cs uses `BaseIndicator.GetCurrentValue()` for `prevEma`/`prevMacd`,
//   which returns 0 if the indicator never emitted a value before. On the
//   very first bar where BOTH indicators become formed (bar
//   `max(emaFormedBar, macdFormedBar)`), MACD has no prior FORMED sample —
//   its previous emission was an unformed intermediate that the .cs would
//   coerce to 0 via `ToDecimal`. Comparing today's MACD-line value to 0
//   produces an artefact unrelated to the actual momentum.
//
//   We instead require BOTH EMA and MACD to have ≥ 2 valid (post-seed)
//   samples before emitting Elder, so the comparison is always against a
//   real prior sample. First Elder output therefore lands one bar later
//   than the .cs's first emission (bar `max(emaFormedBar, macdFormedBar)
//   + 1` instead of `max(emaFormedBar, macdFormedBar)`). This is the
//   only difference; subsequent bars match the .cs exactly.

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
 * @typedef {{time: string|number, value: number|null, state?: string}} ElderPoint
 */

/**
 * EMA on a numeric series, SMA-seeded (matches calcEMA semantics).
 * @param {(number|null|undefined)[]} values
 * @param {number} length
 * @returns {(number|null)[]}
 */
function emaArray(values, length) {
    const n = values.length;
    const out = new Array(n);
    if (n === 0 || length <= 0) {
        for (let i = 0; i < n; i++) out[i] = null;
        return out;
    }
    const k = 2 / (length + 1);
    let seedSum = 0;
    let seedCount = 0;
    let seedDone = false;
    let prev = 0;
    for (let i = 0; i < n; i++) {
        const v = values[i];
        const ok = typeof v === 'number' && Number.isFinite(v);
        if (!seedDone) {
            if (!ok) { out[i] = null; continue; }
            seedSum += v;
            seedCount++;
            if (seedCount === length) {
                prev = seedSum / length;
                out[i] = prev;
                seedDone = true;
            } else {
                out[i] = null;
            }
            continue;
        }
        if (!ok) { out[i] = null; continue; }
        prev = v * k + prev * (1 - k);
        out[i] = prev;
    }
    return out;
}

/**
 * @param {CandlePoint[]} candles
 * @param {{emaLength?: number, fastLength?: number, slowLength?: number}} [params]
 * @returns {ElderPoint[]}
 */
export function calcElderImpulse(candles, params) {
    const emaLen = params && Number.isFinite(params.emaLength) ? (params.emaLength | 0) : 13;
    const fastLen = params && Number.isFinite(params.fastLength) ? (params.fastLength | 0) : 12;
    const slowLen = params && Number.isFinite(params.slowLength) ? (params.slowLength | 0) : 26;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };
    if (emaLen <= 0 || fastLen <= 0 || slowLen <= 0) return out;

    const closes = new Array(n);
    for (let i = 0; i < n; i++) closes[i] = candles[i] && candles[i].close;

    const emaSeries = emaArray(closes, emaLen);
    const fastSeries = emaArray(closes, fastLen);
    const slowSeries = emaArray(closes, slowLen);

    const macdLine = new Array(n);
    for (let i = 0; i < n; i++) {
        const a = fastSeries[i];
        const b = slowSeries[i];
        macdLine[i] = (a === null || b === null) ? null : a - b;
    }

    for (let i = 1; i < n; i++) {
        const ema = emaSeries[i];
        const emaPrev = emaSeries[i - 1];
        const macd = macdLine[i];
        const macdPrev = macdLine[i - 1];
        if (ema === null || emaPrev === null || macd === null || macdPrev === null) continue;

        let v;
        let state;
        if (ema > emaPrev && macd > macdPrev) {
            v = 1;
            state = 'green';
        } else if (ema < emaPrev && macd < macdPrev) {
            v = -1;
            state = 'red';
        } else {
            v = 0;
            state = 'blue';
        }
        out[i] = { time: candles[i].time, value: v, state };
    }

    return out;
}
