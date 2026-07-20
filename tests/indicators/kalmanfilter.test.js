// Kalman Filter: adaptive 1-D smoother with hidden state (estimate, error covariance).
// Reference vector is REGRESSION LOCK-IN (verified vs StockSharp .cs).
//
// `length` only gates IsFormed (it does not affect the estimate values), so the
// value/regression tests pass length:1 to emit from the first bar; a separate test
// covers the default warm-up null gate.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcKalmanFilter } = require('../../src/chart/indicators/calc/kalmanfilter.js');

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

function mk(c, i) {
    return { time: `t${i}`, open: c, high: c, low: c, close: c, volume: 0 };
}

describe('calcKalmanFilter', () => {
    it('empty candles → empty array', () => {
        assert.deepStrictEqual(calcKalmanFilter([], {}), []);
    });

    it('first bar output equals the close (seed) with length=1', () => {
        const r = calcKalmanFilter([mk(42, 0)], { length: 1 });
        approxEq(r[0].value, 42);
    });

    it('default length=10 → warm-up (first 9) null, then estimates', () => {
        const candles = [];
        for (let i = 0; i < 12; i++) candles.push(mk(100 + i, i));
        const r = calcKalmanFilter(candles); // default length 10
        for (let i = 0; i < 9; i++) assert.strictEqual(r[i].value, null);
        assert.notStrictEqual(r[9].value, null);
    });

    it('flat input → output stays at the constant', () => {
        const candles = [];
        for (let i = 0; i < 20; i++) candles.push(mk(100, i));
        const r = calcKalmanFilter(candles, { length: 1 });
        for (const p of r) approxEq(p.value, 100, 1e-12);
    });

    it('regression lock-in: known closes with default Q/R', () => {
        // Reference vector verified against the StockSharp .cs runtime; do
        // not re-bless without re-running the .cs. length:1 to emit from bar 0.
        const closes = [10, 12, 11, 14, 13, 15, 14, 16, 15, 17];
        const expected = [
            10,
            11.99800201796186,
            11.496765314452553,
            12.344684439264315,
            12.51412375822136,
            13.040397404901015,
            13.214538525592422,
            13.66216815369446,
            13.857239773295577,
            14.280906520992612,
        ];
        const candles = closes.map(mk);
        const r = calcKalmanFilter(candles, { processNoise: 1e-5, measurementNoise: 1e-3, length: 1 });
        for (let i = 0; i < expected.length; i++) {
            approxEq(r[i].value, expected[i], 1e-9);
        }
    });

    it('very high process noise → filter follows raw closely (K → 1)', () => {
        const candles = [mk(10, 0), mk(20, 1), mk(30, 2)];
        const r = calcKalmanFilter(candles, { processNoise: 1e9, measurementNoise: 1e-9, length: 1 });
        approxEq(r[0].value, 10);
        approxEq(r[1].value, 20, 1e-3);
        approxEq(r[2].value, 30, 1e-3);
    });

    it('very high measurement noise → filter lags heavily (K → 0)', () => {
        const candles = [mk(10, 0), mk(1000, 1), mk(1000, 2)];
        const r = calcKalmanFilter(candles, { processNoise: 1e-12, measurementNoise: 1e12, length: 1 });
        approxEq(r[0].value, 10);
        assert.ok(Math.abs(r[1].value - 10) < 1, 'filter should barely move with huge R');
    });

    it('output length matches input length and timestamps pass through', () => {
        const candles = [];
        for (let i = 0; i < 8; i++) candles.push(mk(i * 2, i));
        const r = calcKalmanFilter(candles, {});
        assert.strictEqual(r.length, 8);
        for (let i = 0; i < 8; i++) assert.strictEqual(r[i].time, candles[i].time);
    });
});
