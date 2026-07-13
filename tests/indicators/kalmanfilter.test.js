// Kalman Filter: adaptive 1-D smoother with hidden state (estimate, error covariance).
// Reference vector is REGRESSION LOCK-IN (verified vs StockSharp .cs).

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

    it('first bar output equals the close (seed)', () => {
        const candles = [mk(42, 0)];
        const r = calcKalmanFilter(candles, {});
        approxEq(r[0].value, 42);
    });

    it('flat input → output stays at the constant', () => {
        const candles = [];
        for (let i = 0; i < 20; i++) candles.push(mk(100, i));
        const r = calcKalmanFilter(candles, {});
        for (const p of r) approxEq(p.value, 100, 1e-12);
    });

    it('regression lock-in: known closes with default Q/R', () => {
        // Reference vector verified against the StockSharp .cs runtime; do
        // not re-bless without re-running the .cs.
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
        const r = calcKalmanFilter(candles, { processNoise: 1e-5, measurementNoise: 1e-3 });
        for (let i = 0; i < expected.length; i++) {
            approxEq(r[i].value, expected[i], 1e-9);
        }
    });

    it('very high process noise → filter follows raw closely (K → 1)', () => {
        // With Q huge, prior uncertainty dominates and K ≈ 1, so newEstimate ≈ z.
        const candles = [mk(10, 0), mk(20, 1), mk(30, 2)];
        const r = calcKalmanFilter(candles, { processNoise: 1e9, measurementNoise: 1e-9 });
        approxEq(r[0].value, 10);
        approxEq(r[1].value, 20, 1e-3);
        approxEq(r[2].value, 30, 1e-3);
    });

    it('very high measurement noise → filter lags heavily (K → 0)', () => {
        // With R huge and Q tiny, K is near 0, so newEstimate ≈ prior. The
        // filter barely budges from its seed.
        const candles = [mk(10, 0), mk(1000, 1), mk(1000, 2)];
        const r = calcKalmanFilter(candles, { processNoise: 1e-12, measurementNoise: 1e12 });
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
