// Trix: warm-up shape and flat-series invariant.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcTrix } = require('../../src/chart/indicators/calc/trix.js');

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `2025-01-01T00:${String(i).padStart(2, '0')}:00Z`,
        open: c,
        high: c,
        low: c,
        close: c,
        volume: 0,
    }));
}

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcTrix', () => {
    it('empty candles → empty result', () => {
        assert.deepStrictEqual(calcTrix([], { length: 5 }), []);
    });

    it('not enough data → every value null', () => {
        // length=5 → first non-null at index 3*(length-1) = 12 (the bar
        // when ema3 first becomes available; mirrors Trix.cs / Momentum
        // cap-Length+1 behaviour that emits 0 at the first formed bar).
        // With 10 candles we never get there → all null.
        const out = calcTrix(makeCandles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), { length: 5 });
        for (const p of out) assert.strictEqual(p.value, null);
    });

    it('first non-null at index 3*length - 2 (ROC(1) formed)', () => {
        // length=3 → ema3 first forms at 3*(length-1)=6, but ROC(1) needs a second
        // input, so Trix.cs is not formed until index 3*length-2 = 7 (StockSharp
        // nulls the earlier bars, including the first ROC bar where Momentum==0).
        const closes = [];
        for (let i = 1; i <= 12; i++) closes.push(i);
        const out = calcTrix(makeCandles(closes), { length: 3 });
        for (let i = 0; i < 7; i++) assert.strictEqual(out[i].value, null);
        approxEq(out[7].value, 250);
        approxEq(out[8].value, 200);
    });

    it('flat close series → Trix = 0 once warm (no rate of change)', () => {
        const closes = [];
        for (let i = 0; i < 20; i++) closes.push(42);
        const out = calcTrix(makeCandles(closes), { length: 3 });
        // First non-null at i=7 (3*length-2). From there on ema3 stays at 42 and
        // (ema3[i]-ema3[i-1])/ema3[i-1] = 0.
        for (let i = 0; i < 7; i++) assert.strictEqual(out[i].value, null);
        for (let i = 7; i < closes.length; i++) approxEq(out[i].value, 0);
    });

    it('time field passed through unchanged', () => {
        const candles = makeCandles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        const out = calcTrix(candles, { length: 3 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });
});
