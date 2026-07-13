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

    it('first non-null at index 3*(length - 1)', () => {
        // length=3 → first non-null at i=6 (when ema3 first forms). The
        // first formed sample mirrors Trix.cs's `10 * ROC(...)` where the
        // ROC.Buffer has just one element so result=0 and Trix=0.
        const closes = [];
        for (let i = 1; i <= 12; i++) closes.push(i);
        const out = calcTrix(makeCandles(closes), { length: 3 });
        for (let i = 0; i < 6; i++) assert.strictEqual(out[i].value, null);
        // index 6 is the first formed bar; Trix.cs emits 0 there.
        assert.strictEqual(out[6].value, 0);
        // index 7 onwards holds the actual rate-of-change values.
        assert.notStrictEqual(out[7].value, null);
    });

    it('flat close series → Trix = 0 once warm (no rate of change)', () => {
        const closes = [];
        for (let i = 0; i < 20; i++) closes.push(42);
        const out = calcTrix(makeCandles(closes), { length: 3 });
        // First non-null at i=6 (Trix.cs emits 0 there). From there on
        // ema3 stays at 42 and (ema3[i]-ema3[i-1])/ema3[i-1] = 0.
        for (let i = 6; i < closes.length; i++) approxEq(out[i].value, 0);
    });

    it('time field passed through unchanged', () => {
        const candles = makeCandles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        const out = calcTrix(candles, { length: 3 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });
});
