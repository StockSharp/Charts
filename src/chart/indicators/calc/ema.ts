// Exponential Moving Average — close-price based.
// Seeded with SMA over the first `length` closes (classic Wilder/StockSharp
// convention), then ema[i] = close[i]*k + ema[i-1]*(1-k) where k=2/(N+1).
// First (length-1) outputs are null to match SMA warm-up behaviour.

export function calcEMA(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 14;
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    if (length <= 0 || n < length) {
        for (let i = 0; i < n; i++) out[i] = { time: candles[i].time, value: null };
        return out;
    }

    const k = 2 / (length + 1);

    // Seed: SMA over the first `length` closes. Any non-finite value in the
    // seed window invalidates the entire series until we cross past it —
    // mirrors what StockSharp does with `IsFormed` on the server.
    let seedSum = 0;
    let seedOk = true;
    for (let i = 0; i < length; i++) {
        const c = candles[i] && candles[i].close;
        if (typeof c !== 'number' || !Number.isFinite(c)) seedOk = false;
        else seedSum += c;
        out[i] = { time: candles[i].time, value: null };
    }
    if (!seedOk) {
        for (let i = length; i < n; i++) out[i] = { time: candles[i].time, value: null };
        return out;
    }

    let prev = seedSum / length;
    out[length - 1] = { time: candles[length - 1].time, value: prev };

    for (let i = length; i < n; i++) {
        const c = candles[i] && candles[i].close;
        if (typeof c !== 'number' || !Number.isFinite(c)) {
            // Gap in input. Hold previous EMA so it doesn't poison the
            // rest of the series; emit null for the gap itself.
            out[i] = { time: candles[i].time, value: null };
            continue;
        }
        const v = c * k + prev * (1 - k);
        out[i] = { time: candles[i].time, value: v };
        prev = v;
    }
    return out;
}
