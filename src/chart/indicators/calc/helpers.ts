// Pure math helpers shared between client-side indicator calculators.
// Operate on plain number arrays; never touch candle objects directly so
// they can be reused for high/low/close/typical-price inputs alike.

type NumericInput = ReadonlyArray<number | null | undefined>;
type NumericOutput = Array<number | null>;

// Candle shape the calc helpers expect. Looser than the wire Candle type
// (no time / no volume requirement) because the helpers only read OHLC
// when present — non-finite values fall through to null output.
interface CalcCandle {
    time?: number | string;
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    volume?: number;
}

interface IndicatorPoint {
    time: number | string | undefined;
    value: number | null;
}

// Simple arithmetic moving average. Returns an array aligned 1:1 with the
// input where the first (length-1) slots are null (warm-up window) and
// each subsequent slot is the mean of the trailing `length` values.
// Values inside the window that are null/undefined/NaN propagate to null
// for that output slot — keeps downstream indicators honest about gaps.
export function simpleMA(values: NumericInput, length: number): NumericOutput {
    const n = (values && values.length) | 0;
    const len = length | 0;
    const out: NumericOutput = new Array(n);
    if (n === 0 || len <= 0) return out;

    let sum = 0;
    let invalid = 0; // count of non-finite samples in the current window
    for (let i = 0; i < n; i++) {
        const v = values[i];
        const ok = typeof v === 'number' && Number.isFinite(v);
        if (ok) sum += v as number; else invalid++;

        if (i >= len) {
            const drop = values[i - len];
            const dropOk = typeof drop === 'number' && Number.isFinite(drop);
            if (dropOk) sum -= drop as number; else invalid--;
        }

        if (i < len - 1) {
            out[i] = null;
        } else {
            out[i] = invalid === 0 ? sum / len : null;
        }
    }
    return out;
}

// Wilder's smoothing — textbook variant used by RSI, ADX, ATR. Seeds with
// the SMA of the first `length` finite samples, then recurses
// `wma[i] = (wma[i-1] * (length-1) + x[i]) / length`.
// Same null-padding rule as simpleMA: first (length-1) are null, and any
// non-finite value before the seed window aborts seeding (output stays
// null until enough valid data is available).
export function wilderMA(values: NumericInput, length: number): NumericOutput {
    const n = (values && values.length) | 0;
    const len = length | 0;
    const out: NumericOutput = new Array(n);
    if (n === 0 || len <= 0) return out;

    let seedSum = 0;
    let seedOk = true;
    for (let i = 0; i < n; i++) {
        if (i < len) {
            const v = values[i];
            if (typeof v !== 'number' || !Number.isFinite(v)) seedOk = false;
            else seedSum += v;
            out[i] = null;
            if (i === len - 1 && seedOk) out[i] = seedSum / len;
            continue;
        }
        const prev = out[i - 1];
        const v = values[i];
        if (prev === null || typeof v !== 'number' || !Number.isFinite(v)) {
            out[i] = null;
        } else {
            out[i] = (prev * (len - 1) + v) / len;
        }
    }
    return out;
}

// Smoothed Moving Average (SMMA) — the variant used inside StockSharp's
// RelativeStrengthIndex / ChandeMomentumOscillator / DirectionalIndex
// pipeline. Differs from wilderMA above by emitting a value from index 0:
// during the warm-up window (Count < length), it returns Buffer.Sum / length
// (NOT divided by the running count). Once length samples have been seen,
// it switches to Wilder recursion `prev*(length-1)/length + new/length`.
//
// This is the "SMMA matches C# 1:1" helper: at index N the output equals
// what StockSharp's SmoothedMovingAverage.cs returns after processing the
// (N+1)-th value. The first output is `value[0] / length` (a tiny seed
// that grows as the window fills), not null — that's the canonical
// StockSharp behaviour the parity-test expected files were generated with.
//
// Nulls in input produce null at the corresponding output (and DO NOT
// advance the smoothing buffer for that slot — matches IsFinal=false in
// the C# side, which doesn't PushBack).
export function smoothedMA(values: NumericInput, length: number): NumericOutput {
    const n = (values && values.length) | 0;
    const len = length | 0;
    const out: NumericOutput = new Array(n);
    if (n === 0 || len <= 0) {
        for (let i = 0; i < n; i++) out[i] = null;
        return out;
    }
    let sum = 0;
    let count = 0;
    let prev = 0;
    for (let i = 0; i < n; i++) {
        const v = values[i];
        const ok = typeof v === 'number' && Number.isFinite(v);
        if (!ok) {
            out[i] = null;
            continue;
        }
        const vNum = v as number;
        if (count < len) {
            sum += vNum;
            count++;
            prev = sum / len;
            out[i] = prev;
        } else {
            prev = (prev * (len - 1) + vNum) / len;
            out[i] = prev;
        }
    }
    return out;
}

// Welles-Wilder MA matching StockSharp's WilderMovingAverage.cs (the parent
// class of AverageTrueRange). Unlike smoothedMA above, the warm-up divisor
// is the GROWING count (1, 2, 3, ..., length), so the formula at every
// step is `(prev * (count-1) + new) / count`, with `count = min(callIndex+1,
// length)`. Capped at length once the circular buffer fills, after which
// the formula is the steady-state Wilder recursion.
//
// First output at index 0 is `value[0]` itself (count=1 → (0*0+v)/1 = v).
// Nulls propagate to null and do not advance the buffer.
export function wilderWMA(values: NumericInput, length: number): NumericOutput {
    const n = (values && values.length) | 0;
    const len = length | 0;
    const out: NumericOutput = new Array(n);
    if (n === 0 || len <= 0) {
        for (let i = 0; i < n; i++) out[i] = null;
        return out;
    }
    let count = 0;
    let prev = 0;
    for (let i = 0; i < n; i++) {
        const v = values[i];
        const ok = typeof v === 'number' && Number.isFinite(v);
        if (!ok) {
            out[i] = null;
            continue;
        }
        if (count < len) count++;
        prev = (prev * (count - 1) + (v as number)) / count;
        out[i] = prev;
    }
    return out;
}

// Partial-seed Simple Moving Average matching StockSharp's
// SimpleMovingAverage.cs:34 exactly: `Buffer.Sum / Length` from bar 0. During
// warm-up (Buffer.Count < Length) Sum is still divided by Length (NOT by
// Buffer.Count), so first output is `values[0] / length` (a tiny seed that
// grows as the window fills). Once Buffer.Count == Length, the buffer
// becomes a true sliding window and Sum/Length is the classic SMA.
//
// Nulls in input produce null at the corresponding output and DO NOT
// advance the buffer for that slot — matches IsFinal=false behaviour in
// the C# side (which doesn't PushBack on intermediate values).
//
// Used by indicator calcs that need bit-for-bit parity with C# during the
// warm-up window: TSI, T3, Keltner, SuperTrend, KPO, DemandIndex, etc.
export function partialSeedSMA(values: NumericInput, length: number): NumericOutput {
    const n = (values && values.length) | 0;
    const len = length | 0;
    const out: NumericOutput = new Array(n);
    if (n === 0 || len <= 0) {
        for (let i = 0; i < n; i++) out[i] = null;
        return out;
    }

    // Circular buffer of pushed samples (oldest..newest), max size `len`.
    const buf: number[] = new Array(len);
    let head = 0; // next slot to overwrite
    let count = 0;
    let sum = 0;

    for (let i = 0; i < n; i++) {
        const v = values[i];
        const ok = typeof v === 'number' && Number.isFinite(v);
        if (!ok) {
            out[i] = null;
            continue;
        }
        const vNum = v as number;
        if (count < len) {
            buf[head] = vNum;
            head = (head + 1) % len;
            count++;
            sum += vNum;
        } else {
            // Evict the oldest sample (at `head`) and push the new one.
            sum -= buf[head];
            buf[head] = vNum;
            head = (head + 1) % len;
            sum += vNum;
        }
        out[i] = sum / len;
    }
    return out;
}

// Partial-seed Exponential Moving Average matching StockSharp's
// ExponentialMovingAverage.cs: during warm-up (IsFormed=false, Buffer.Count
// < Length) emits `Buffer.Sum / Length` (partial SMA seed), then at bar
// Length-1 the buffer fills, IsFormed=true and `_prevFinalValue` is set to
// Buffer.Sum/Length (full SMA). From bar Length onward it recurses:
//   ema[i] = (value[i] - prev) * k + prev,  k = 2/(length+1)
//
// IMPORTANT: even though warm-up emits a partial-seed Sum/Length, the
// emission at bar Length-1 is the CLASSIC SMA (Sum/Length with full buffer),
// and `_prevFinalValue` is set to that classic SMA before the next recursion
// step. So this matches the C# behaviour where downstream cascades see
// non-null inputs from bar 0.
//
// Nulls in input produce null at the corresponding output; the buffer is
// not advanced for null slots (matches C# IsFinal=false branch which
// doesn't PushBack).
export function partialSeedEMA(values: NumericInput, length: number): NumericOutput {
    const n = (values && values.length) | 0;
    const len = length | 0;
    const out: NumericOutput = new Array(n);
    if (n === 0 || len <= 0) {
        for (let i = 0; i < n; i++) out[i] = null;
        return out;
    }
    const k = 2 / (len + 1);
    let count = 0;
    let sum = 0;
    let prev = 0;
    let formed = false;
    for (let i = 0; i < n; i++) {
        const v = values[i];
        const ok = typeof v === 'number' && Number.isFinite(v);
        if (!ok) {
            out[i] = null;
            continue;
        }
        const vNum = v as number;
        if (!formed) {
            sum += vNum;
            count++;
            prev = sum / len; // partial Sum/Length seed; equals classic SMA at count==len
            out[i] = prev;
            if (count >= len) formed = true;
        } else {
            prev = (vNum - prev) * k + prev;
            out[i] = prev;
        }
    }
    return out;
}

// ATR matching StockSharp's AverageTrueRange.cs (a WilderMovingAverage over
// TR series where TR[0] = high[0] - low[0] when no previous candle, and
// TR[i] = max(high-low, |high-prevClose|, |low-prevClose|) for i >= 1).
//
// WilderMovingAverage uses a growing-count divisor — at bar 0, count=1,
// returns (0*0 + TR[0])/1 = TR[0]. At bar k (k < length), returns
// cumulative average of TRs so far. At bar Length-1, buffer fills,
// IsFormed=true. From bar Length onward, the recurrence is steady-state
// Wilder: `(prev * (length-1) + tr) / length`.
//
// Returns an array of IndicatorPoint {time, value} aligned 1:1 with the
// candle array. First non-null output is at bar 0 (TR[0]).
export function csATR(candles: ReadonlyArray<CalcCandle>, length: number): IndicatorPoint[] {
    const n = (candles && candles.length) | 0;
    const len = length | 0;
    const out: IndicatorPoint[] = new Array(n);
    if (n === 0 || len <= 0) {
        for (let i = 0; i < n; i++) out[i] = { time: candles && candles[i] && candles[i].time, value: null };
        return out;
    }
    let prevClose: number | null = null;
    let prev = 0;
    let count = 0;
    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const h = c && c.high;
        const l = c && c.low;
        const cl = c && c.close;
        if (typeof h !== 'number' || !Number.isFinite(h) ||
            typeof l !== 'number' || !Number.isFinite(l)) {
            out[i] = { time: c && c.time, value: null };
            continue;
        }
        let tr: number;
        if (prevClose === null) {
            tr = h - l;
        } else {
            const a = h - l;
            const b = Math.abs(h - prevClose);
            const d = Math.abs(l - prevClose);
            tr = a > b ? a : b;
            if (d > tr) tr = d;
        }
        if (count < len) count++;
        prev = (prev * (count - 1) + tr) / count;
        out[i] = { time: c.time, value: prev };
        if (typeof cl === 'number' && Number.isFinite(cl)) prevClose = cl;
    }
    return out;
}

// All helpers are exported individually via `export function ...` above.
// Tests (`require('./helpers.js')`) read these off the tsc-CJS exports
// object directly; the browser bundle imports them by name through
// esbuild. No window-global publishing — consumers `import { simpleMA }`
// rather than `window.IndicatorCalcHelpers.simpleMA`.
