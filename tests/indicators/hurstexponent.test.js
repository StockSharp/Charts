// Hurst Exponent (R/S over a rolling window of `length` closes).

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcHurstExponent } = require('../../src/chart/indicators/calc/hurstexponent.js');

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

function makeCloses(closes) {
    return closes.map((c, i) => ({
        time: `t${i}`, open: c, high: c, low: c, close: c, volume: 0,
    }));
}

describe('calcHurstExponent', () => {
    it('empty candles → empty array', () => {
        assert.deepStrictEqual(calcHurstExponent([], { length: 100 }), []);
    });

    it('fewer candles than length → all null of correct length', () => {
        const candles = makeCloses([1, 2, 3, 4, 5]);
        const r = calcHurstExponent(candles, { length: 100 });
        assert.strictEqual(r.length, 5);
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('length <= 1 → all null (degenerate log(N))', () => {
        const candles = makeCloses([1, 2, 3, 4, 5, 6]);
        const r0 = calcHurstExponent(candles, { length: 0 });
        const r1 = calcHurstExponent(candles, { length: 1 });
        for (const p of r0) assert.strictEqual(p.value, null);
        for (const p of r1) assert.strictEqual(p.value, null);
    });

    it('flat close series → std == 0 branch → null', () => {
        const candles = makeCloses(new Array(10).fill(7));
        const r = calcHurstExponent(candles, { length: 5 });
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('reference: linear ramp [1, 2, 3, 4] with length=4 yields a hand-checkable value', () => {
        // closes = [1, 2, 3, 4]. mean = 2.5.
        // dev = [-1.5, -0.5, 0.5, 1.5].
        // cum = [-1.5, -2.0, -1.5, 0]. range = 0 - (-2) = 2.
        // sumSqr = 2.25 + 0.25 + 0.25 + 2.25 = 5. std = sqrt(5 / 4) = sqrt(1.25).
        // RS = 2 / sqrt(1.25).
        // H = log(RS) / log(4).
        const candles = makeCloses([1, 2, 3, 4]);
        const r = calcHurstExponent(candles, { length: 4 });
        const expected = Math.log(2 / Math.sqrt(1.25)) / Math.log(4);
        for (let i = 0; i < 3; i++) assert.strictEqual(r[i].value, null);
        approxEq(r[3].value, expected);
    });

    it('time field passed through unchanged', () => {
        const candles = makeCloses([10, 11, 13, 12, 14]);
        const r = calcHurstExponent(candles, { length: 3 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r[i].time, candles[i].time);
        }
    });
});
