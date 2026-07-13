// Adaptive Laguerre Filter — 4-stage Laguerre cascade.
// Tests: empty input, invalid gamma → all-nulls, output shape, convergence
// on a constant series, and a regression lock-in on a small known vector.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcAdaptiveLaguerreFilter } = require('../../src/chart/indicators/calc/alf.js');

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `t${i}`, open: c, high: c, low: c, close: c, volume: 0,
    }));
}

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcAdaptiveLaguerreFilter', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcAdaptiveLaguerreFilter([], { gamma: 0.8 }), []);
    });

    it('gamma outside (0,1) → all-nulls (fail closed instead of throw)', () => {
        const candles = makeCandles([1, 2, 3, 4, 5]);
        for (const g of [0, 1, -0.1, 1.1]) {
            const r = calcAdaptiveLaguerreFilter(candles, { gamma: g });
            assert.strictEqual(r.length, 5);
            for (const p of r) assert.strictEqual(p.value, null);
        }
    });

    it('output shape: length matches input, time passed through, value at bar 0 is finite', () => {
        const candles = makeCandles([10, 11, 12, 13, 14]);
        const r = calcAdaptiveLaguerreFilter(candles, { gamma: 0.5 });
        assert.strictEqual(r.length, candles.length);
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r[i].time, candles[i].time);
            assert.ok(typeof r[i].value === 'number' && Number.isFinite(r[i].value),
                      `bar ${i} value should be finite`);
        }
    });

    it('constant series → filter converges to that constant', () => {
        const closes = new Array(200).fill(10);
        const r = calcAdaptiveLaguerreFilter(makeCandles(closes), { gamma: 0.8 });
        // After ~200 bars with gamma=0.8 we should be very close to 10.
        approxEq(r[199].value, 10, 1e-6);
    });

    it('first-bar value matches hand calc (gamma=0.8, price=10)', () => {
        // l0 = 0.2*10 + 0.8*0 = 2
        // l1 = -0.8*2 + 2 + 0.8*0 = 0.4
        // l2 = -0.8*0.4 + 0.4 + 0.8*0 = 0.08
        // l3 = -0.8*0.08 + 0.08 + 0.8*0 = 0.016
        // filt = (2 + 0.8 + 0.16 + 0.016) / 6 = 2.976 / 6 = 0.496
        const r = calcAdaptiveLaguerreFilter(makeCandles([10]), { gamma: 0.8 });
        approxEq(r[0].value, 0.496, 1e-12);
    });

    it('regression: locked-in value on a small ramp', () => {
        // Captured from a clean run of the implementation; locks the
        // recurrence so anyone editing the coefficients sees a failure.
        const r = calcAdaptiveLaguerreFilter(makeCandles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
                                             { gamma: 0.5 });
        // Hand-derived: each step is linear in the prior 4 state vars +
        // current price; over 10 bars the math is dull but determined.
        // Lock the last bar.
        assert.ok(typeof r[9].value === 'number' && Number.isFinite(r[9].value));
        approxEq(r[9].value, 7.523193359375, 1e-9);
    });
});
