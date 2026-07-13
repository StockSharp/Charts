// ALMA: shape, warm-up nulls, and constant-series convergence check.
// Reference values for the non-trivial Gaussian case are computed
// in-test from the same formula (so this is really a regression
// guard on the implementation rather than an external reference) but
// the constant-series invariant is a true mathematical property:
// for a constant input, ALMA must return the same constant once
// it warms up, regardless of offset/sigma.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcALMA } = require('../../src/chart/indicators/calc/alma.js');

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

describe('calcALMA', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcALMA([], {}), []);
    });

    it('length larger than candle count → every value null', () => {
        const r = calcALMA(makeCandles([1, 2, 3]), { length: 9, offset: 0.85, sigma: 6 });
        assert.strictEqual(r.length, 3);
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('first (length-1) outputs null, non-null lands at index length-1', () => {
        const r = calcALMA(makeCandles([1, 2, 3, 4, 5]), { length: 3, offset: 0.85, sigma: 6 });
        assert.strictEqual(r.length, 5);
        assert.strictEqual(r[0].value, null);
        assert.strictEqual(r[1].value, null);
        assert.notStrictEqual(r[2].value, null);
    });

    it('constant input → ALMA equals the constant once warmed up', () => {
        const k = 42;
        const closes = new Array(20).fill(k);
        const r = calcALMA(makeCandles(closes), { length: 9, offset: 0.85, sigma: 6 });
        for (let i = 8; i < 20; i++) approxEq(r[i].value, k);
    });

    it('length=3, offset=0.85, sigma=6 reference vector (closes=1..5)', () => {
        // Hand-compute weights with the .cs formula:
        //   m = 0.85 * (3-1) = 1.7
        //   s = 3/6 = 0.5
        //   w[i] = exp(-(i - 1.7)^2 / (2*0.25)) = exp(-2*(i-1.7)^2)
        // The .cs reads `Buffer[Length-1-i]`, where Buffer[0] is the OLDEST
        // and Buffer[Length-1] is the NEWEST close. So i=0 reads the newest
        // close at t, i=Length-1 reads the oldest at t-(Length-1).
        const m = 1.7, s = 0.5;
        const w = [0, 1, 2].map(i => Math.exp(-(((i - m) / s) ** 2) / 2));
        const wsum = w[0] + w[1] + w[2];
        // At t=2: window NEWEST→OLDEST = [3, 2, 1] (close[2]=3, close[1]=2, close[0]=1)
        const v2 = (3 * w[0] + 2 * w[1] + 1 * w[2]) / wsum;
        // At t=3: window NEWEST→OLDEST = [4, 3, 2]
        const v3 = (4 * w[0] + 3 * w[1] + 2 * w[2]) / wsum;
        // At t=4: window NEWEST→OLDEST = [5, 4, 3]
        const v4 = (5 * w[0] + 4 * w[1] + 3 * w[2]) / wsum;
        const r = calcALMA(makeCandles([1, 2, 3, 4, 5]), { length: 3, offset: 0.85, sigma: 6 });
        approxEq(r[2].value, v2);
        approxEq(r[3].value, v3);
        approxEq(r[4].value, v4);
    });

    it('linear ramp: ALMA tracks below the midpoint when offset>0.5', () => {
        // The .cs ALMA's `Buffer[Length-1-i]` indexing means a large `offset`
        // puts the Gaussian peak on i near Length-1 — which reads Buffer[0]
        // (OLDEST). So for a rising sequence, large offset weights OLDER
        // (lower) bars and ALMA[t] sits BELOW the midpoint of the window.
        // This is opposite to typical ALMA implementations but matches the
        // StockSharp reference exactly. See alma.js header for full notes.
        const closes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const r = calcALMA(makeCandles(closes), { length: 5, offset: 0.85, sigma: 6 });
        // At t=4, window=[1..5], midpoint=3 — ALMA should be < 3 (weighted toward 1).
        assert.ok(r[4].value < 3, `expected ALMA[4]=${r[4].value} < 3 with offset=0.85 (.cs lag-heavy mapping)`);
    });

    it('time field passed through unchanged', () => {
        const candles = makeCandles([1, 2, 3, 4, 5]);
        const r = calcALMA(candles, { length: 3 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r[i].time, candles[i].time);
        }
    });
});
