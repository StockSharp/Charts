// Vidya (Variable Index Dynamic Average, Chande) — 1:1 port of
// D:\stocksharp\StockSharp (GitHub)\Algo.Indicators\Vidya.cs.
//
// Why the previous "two-stage" port was wrong: the C# Vidya is a
// DecimalLengthIndicator whose own Buffer grows once per IsFinal call
// only *while* the not-yet-formed branch runs, but the not-yet-formed
// branch itself only fires once the inner CMO becomes formed. CMO is
// formed when its inner Sum's Buffer.Count >= Length (15 deltas). CMO
// returns null on bar 0 (initialise) and feeds deltas on bars 1..15;
// it forms on bar 15 (delta #15). So Vidya emits null for bars 0..14,
// and from bar 15 onward enters the not-formed branch which:
//   - PushBacks close[i] to its own Buffer (Buffer grows 1 per bar);
//   - emits Buffer.Sum / Length — a partial-seed value because the
//     denominator stays at Length while the numerator only contains
//     the bars pushed so far.
// At bar 15 that's close[15] / 15  ≈ 462.8 (close[15]≈6942 in the ohlcv).
// At bar 29 the Buffer fills (15 closes) → SMA over close[15..29].
// From bar 30 onward IsFormed is true and we run the variable-smoothing
// recurrence with _prevFinalValue carried bar-to-bar.
//
// CMO formula (matches ChandeMomentumOscillator.cs):
//   up sum = Σ(max(delta, 0))   over the last Length deltas
//   dn sum = Σ(max(-delta, 0))  over the last Length deltas
//   cmo = (up - dn) == 0 ? 0 : 100 * (up - dn) / (up + dn)
// CMO becomes formed after Length deltas have been pushed.
//
// Vidya recurrence (IsFormed branch):
//   curValue = (close[i] - _prevFinalValue) * multiplier * |cmo/100| + _prevFinalValue
//   multiplier = 2 / (Length + 1)
//
// Default Length = 15 (from .cs ctor).
//
// @typedef {{time:number|string,open:number,high:number,low:number,close:number,volume:number}} Candle
// @typedef {{time:number|string,value:number|null}} Point

/**
 * @param {Candle[]} candles
 * @param {{length?: number}} [params]
 * @returns {Point[]}
 */
export function calcVidya(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 15;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };

    if (length <= 0) return out;

    const multiplier = 2 / (length + 1);

    // Inner CMO state (Sum<delta+>, Sum<delta->). Both have capacity=length.
    let cmoInit = false;
    let lastClose = 0;
    /** @type {number[]} */
    const upBuf: number[] = []; // delta>0 ? delta : 0
    /** @type {number[]} */
    const dnBuf: number[] = []; // delta<0 ? -delta : 0
    let upSum = 0;
    let dnSum = 0;

    // Vidya's own Buffer + state.
    /** @type {number[]} */
    const buf: number[] = [];
    let bufSum = 0;
    let prevFinalValue = 0;
    let isFormed = false;

    for (let i = 0; i < n; i++) {
        const c = candles[i] && candles[i].close;
        if (typeof c !== 'number' || !Number.isFinite(c)) {
            out[i] = { time: candles[i].time, value: null };
            continue;
        }

        // CMO step.
        let cmoValueValid = false;
        let cmoValue = 0;
        if (!cmoInit) {
            // Bar 0 (or first valid bar): set _last and emit empty.
            lastClose = c;
            cmoInit = true;
        } else {
            const delta = c - lastClose;
            const upDelta = delta > 0 ? delta : 0;
            const dnDelta = delta > 0 ? 0 : -delta;
            // PushBack into inner Sum buffers (capacity=length).
            upBuf.push(upDelta);
            upSum += upDelta;
            if (upBuf.length > length) upSum -= upBuf.shift()!;
            dnBuf.push(dnDelta);
            dnSum += dnDelta;
            if (dnBuf.length > length) dnSum -= dnBuf.shift()!;
            lastClose = c;
            // CMO IsFormed when Sum.Buffer.Count >= length.
            if (upBuf.length >= length) {
                const sumBoth = upSum + dnSum;
                cmoValue = sumBoth === 0 ? 0 : 100 * (upSum - dnSum) / sumBoth;
                cmoValueValid = true;
            }
        }

        if (!cmoValueValid) {
            out[i] = { time: candles[i].time, value: null };
            continue;
        }

        // Vidya step.
        if (!isFormed) {
            buf.push(c);
            bufSum += c;
            if (buf.length > length) bufSum -= buf.shift()!;
            prevFinalValue = bufSum / length;
            // Not formed until the Buffer holds `length` closes; StockSharp reports
            // the partial-seed bars as not-formed (null) and emits only the SMA seed.
            if (buf.length >= length) {
                isFormed = true;
                out[i] = { time: candles[i].time, value: prevFinalValue };
            }
            continue;
        }

        // IsFormed branch: variable-smoothing recurrence.
        const f = multiplier * Math.abs(cmoValue / 100);
        const curValue = (c - prevFinalValue) * f + prevFinalValue;
        prevFinalValue = curValue;
        out[i] = { time: candles[i].time, value: curValue };
    }

    return out;
}
