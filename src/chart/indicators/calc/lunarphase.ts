// Lunar Phase indicator (Algo.Indicators/LunarPhase.cs).
// Emits an integer 0..7 per candle, derived from the candle's timestamp.
// No parameters.
//
// Phase numbering (Ecng.Common.LunarPhases enum):
//   0 = NewMoon
//   1 = WaxingCrescent
//   2 = FirstQuarter
//   3 = WaxingGibbous
//   4 = FullMoon
//   5 = WaningGibbous
//   6 = LastQuarter
//   7 = WaningCrescent
//
// Algorithm (Ecng.Common.TimeHelper.GetLunarPhase):
//   julianDate    = date.ToOADate() + 2415018.5
//   daysSinceNew  = julianDate - 2451549.5         // Jan 6, 2000 12:00
//   newMoons      = daysSinceNew / 29.53           // synodic month, days
//   phase         = newMoons - floor(newMoons)     // 0..1
//   phaseIndex    = floor(phase * 8)               // 0..7
//
// .cs DateTime.ToOADate() returns days since 1899-12-30 (treating the value
// as local time; for UTC DateTimeOffset values this is the same numeric).
// In JS we substitute: julian = (utcMs - Date.UTC(1899,11,30)) / 86_400_000 + 2415018.5.
//
// Deviation note vs .cs: none in the math. We do treat each candle.time as
// UTC ISO/ms; the .cs uses input.Time which is the candle's open time as
// stored by the framework. For minute/hour timeframes this rounds to the
// nearest 8-way bucket the same way the .cs does — we mirror the
// simplified 29.53-day cycle exactly, so Ecng's own ±1-phase tolerance
// note applies here too.

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

const OA_EPOCH_MS = Date.UTC(1899, 11, 30, 0, 0, 0); // 1899-12-30 00:00 UTC
const MS_PER_DAY = 86400000;

/**
 * Parse a candle.time value to a millisecond UTC timestamp. Accepts
 * numbers (ms or s — heuristic), Date instances, and ISO strings.
 * Returns NaN on unparseable input.
 * @param {string|number|Date} t
 * @returns {number}
 */
function timeToMs(t) {
    if (t instanceof Date) return t.getTime();
    if (typeof t === 'number') {
        // Heuristic: seconds-since-epoch fits within ~10 digits for "modern"
        // dates; milliseconds is ~13 digits. We pick a threshold around the
        // year 2286 in seconds (1e10) which is comfortably out of normal range.
        return t < 1e11 ? t * 1000 : t;
    }
    if (typeof t === 'string') {
        const ms = Date.parse(t);
        return ms;
    }
    return NaN;
}

/**
 * Compute the lunar phase 0..7 for a given UTC ms timestamp.
 * @param {number} ms
 * @returns {number|null}
 */
// Exported under a leading-underscore name to make it explicit that
// callers outside the test suite shouldn't rely on it — calcLunarPhase
// is the supported public surface.
export function _lunarPhaseFromMs(ms) {
    if (!Number.isFinite(ms)) return null;
    const oa = (ms - OA_EPOCH_MS) / MS_PER_DAY;
    const julian = oa + 2415018.5;
    const daysSinceNew = julian - 2451549.5;
    const newMoons = daysSinceNew / 29.53;
    let phase = newMoons - Math.floor(newMoons);
    // Guard against negative phase from floating-point edge cases
    if (phase < 0) phase += 1;
    return Math.floor(phase * 8);
}

/**
 * @param {CandlePoint[]} candles
 * @param {object} [_params] unused
 * @returns {IndicatorPoint[]}
 */
export function calcLunarPhase(candles, _params) {
    if (!Array.isArray(candles) || candles.length === 0) return [];
    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
        const ms = timeToMs(candles[i] && candles[i].time);
        const v = _lunarPhaseFromMs(ms);
        out[i] = { time: candles[i].time, value: v };
    }
    return out;
}
