// Demand Index indicator (Algo.Indicators/DemandIndex.cs).
// Single-output. Per-bar a raw "demand" value is computed from price &
// volume deltas, then fed to an SMA of length `Length` (default 14).
//
// Per-bar logic (after the 1-bar init for prevClose/prevVolume):
//   deltaP = close[i] - prevClose
//   deltaV = volume[i] - prevVolume
//   if deltaP == 0 || deltaV == 0: return prevValue (NO push to SMA)
//   logDP = log(|deltaP|);  logDV = log(|deltaV|)
//   a = logDP * logDV;       b = logDP - logDV
//   raw = (b != 0 ? a / b : 0) * sign(deltaP)
//   smaValue = SMA(raw, Length)
//   update prevValue = smaValue when non-null
//   update prevClose / prevVolume
//   return smaValue
//
// Important .cs nuances:
//   * When prevClose==0 or prevVolume==0 initially, the bar is consumed
//     for state only and returns null (output null too).
//   * The "deltaP==0 || deltaV==0" early return keeps the SMA buffer
//     unchanged for that bar — we mirror that here. We still output the
//     last produced SMA value (prevValue), even though it's a stale
//     repeat. Once prevValue is unset (still pre-warm-up) we output null.
//   * `IsFormed` follows the inherited SMA: first non-null SMA output
//     lands `Length` real samples in. Real samples start arriving from
//     bar index 1, and bars with deltaP|deltaV == 0 are skipped — so the
//     first formed bar can be later than `Length` if there are zero-delta
//     gaps.

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
export function calcDemandIndex(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 14;

    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };
    if (length <= 0) return out;

    // Trailing SMA buffer (samples not yet evicted). C# DemandIndex extends
    // SimpleMovingAverage whose OnProcessDecimal returns `Buffer.Sum/Length`
    // from bar 0 (partial seed; Sum still divided by Length even when
    // Buffer.Count < Length). `_prevValue` in the .cs is updated every time
    // base.OnProcessDecimal returns non-null — i.e., every bar a push
    // happens (no gap). On a deltaP==0 / deltaV==0 gap bar the .cs returns
    // the stored `_prevValue` WITHOUT pushing. We mirror that here:
    // partial Sum/Length emission from the first non-gap bar onwards;
    // gap bars repeat the last formed value.
    //
    // Note: outer IsFormed = SMA.IsFormed = Buffer.Count >= Length, so the
    // parity harness only compares rows once Length non-gap samples have
    // been pushed. Before that the .cs still updates `_prevValue` and the
    // gap branch returns partial Sum/Length values, but those rows are
    // skipped (`!indicator.IsFormed return`) so we don't need to emit
    // them — keeping the warm-up emission null until the buffer fills is
    // fine for parity.
    const window: number[] = [];
    let sum = 0;
    let pushed = 0; // total non-gap samples pushed since reset

    let prevClose = 0;
    let prevVolume = 0;
    let prevValue: number | null = null; // last SMA value (partial-seed Sum/Length) — tracks _prevValue in .cs
    let initialized = false;

    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const close = c && c.close;
        const vol = c && c.volume;
        if (typeof close !== 'number' || !Number.isFinite(close) ||
            typeof vol !== 'number' || !Number.isFinite(vol)) {
            // Pass through null; do NOT touch state (gap-tolerant).
            continue;
        }

        // .cs gate: `_prevClose == 0 || _prevVolume == 0`. We map "not yet
        // initialised" to the first parseable bar, mirroring the field
        // initialiser (both fields start at 0).
        if (!initialized || prevClose === 0 || prevVolume === 0) {
            prevClose = close;
            prevVolume = vol;
            initialized = true;
            continue;
        }

        const deltaP = close - prevClose;
        const deltaV = vol - prevVolume;

        if (deltaP === 0 || deltaV === 0) {
            // No new SMA sample. Output stored _prevValue (the most recent
            // partial-Sum/Length emission). Per .cs the gap branch is an
            // early return — it does NOT update _prevClose / _prevVolume,
            // so the next deltaP is computed against the LAST non-gap
            // close (not against this gap-bar close). Only emit once the
            // SMA is formed (Buffer.Count >= Length) to match the .cs
            // IsFormed gate the parity harness compares against.
            if (prevValue !== null && pushed >= length) {
                out[i] = { time: c.time, value: prevValue };
            }
            continue;
        }

        const logDP = Math.log(Math.abs(deltaP));
        const logDV = Math.log(Math.abs(deltaV));
        const a = logDP * logDV;
        const b = logDP - logDV;
        let raw = b !== 0 ? a / b : 0;
        raw *= Math.sign(deltaP);

        // Push into SMA buffer (capacity=length, circular).
        window.push(raw);
        sum += raw;
        if (window.length > length) sum -= window.shift()!;
        pushed++;

        // C# base SimpleMovingAverage.OnProcessDecimal returns
        // Buffer.Sum / Length on every push — track that as _prevValue.
        const smaVal = sum / length;
        prevValue = smaVal;

        // Only emit once the SMA is formed (Buffer.Count >= Length) so the
        // parity harness, which skips rows where outer is not formed,
        // doesn't compare partial-seed values.
        if (pushed >= length) {
            out[i] = { time: c.time, value: smaVal };
        }
        prevClose = close;
        prevVolume = vol;
    }

    return out;
}
