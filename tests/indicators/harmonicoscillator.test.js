// HarmonicOscillator: sin-weighted average of trailing closes.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcHarmonicOscillator } = require('../../src/chart/indicators/calc/harmonicoscillator.js');

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

describe('calcHarmonicOscillator', () => {
    it('empty candles → empty array', () => {
        assert.deepStrictEqual(calcHarmonicOscillator([], { length: 14 }), []);
    });

    it('fewer candles than length → all null of correct length', () => {
        const candles = makeCloses([1, 2, 3, 4, 5]);
        const r = calcHarmonicOscillator(candles, { length: 14 });
        assert.strictEqual(r.length, 5);
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('constant close series: sum of sin(2πi/N) is 0 → output 0 once formed', () => {
        // For any length N ≥ 1, sum_{i=0..N-1} sin(2π i / N) = 0.
        // So a flat close series yields 0 every formed bar.
        const length = 6;
        const candles = makeCloses(new Array(15).fill(7));
        const r = calcHarmonicOscillator(candles, { length });
        for (let i = 0; i < length - 1; i++) assert.strictEqual(r[i].value, null);
        for (let i = length - 1; i < candles.length; i++) approxEq(r[i].value, 0);
    });

    it('reference vector: length=4, closes [10, 20, 30, 40] → first formed bar = (40·0 + 30·1 + 20·0 + 10·(-1)) / 4', () => {
        // sin[0..3] for length 4: sin(0)=0, sin(π/2)=1, sin(π)=0, sin(3π/2)=-1.
        // Walk newest→oldest: 40·sin[0] + 30·sin[1] + 20·sin[2] + 10·sin[3]
        //   = 40·0 + 30·1 + 20·0 + 10·(-1) = 30 - 10 = 20.
        // Divide by length=4 → 5.
        const candles = makeCloses([10, 20, 30, 40]);
        const r = calcHarmonicOscillator(candles, { length: 4 });
        assert.strictEqual(r[0].value, null);
        assert.strictEqual(r[1].value, null);
        assert.strictEqual(r[2].value, null);
        approxEq(r[3].value, 5);
    });

    it('time field passed through unchanged', () => {
        const candles = makeCloses([1, 2, 3, 4, 5, 6]);
        const r = calcHarmonicOscillator(candles, { length: 3 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r[i].time, candles[i].time);
        }
    });
});
