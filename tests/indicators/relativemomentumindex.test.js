// Relative Momentum Index — warm-up cascade + hand math.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcRelativeMomentumIndex } = require('../../src/chart/indicators/calc/relativemomentumindex.js');

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `2025-01-01T00:${String(i).padStart(2, '0')}:00Z`,
        open: c, high: c, low: c, close: c, volume: 0,
    }));
}

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`);
}

describe('calcRelativeMomentumIndex', () => {
    it('empty input → []', () => {
        assert.deepStrictEqual(calcRelativeMomentumIndex([], { length: 3, momentum: 1 }), []);
    });

    it('insufficient data → all null', () => {
        const out = calcRelativeMomentumIndex(makeCandles([1, 2, 3]), { length: 5, momentum: 2 });
        for (const p of out) assert.strictEqual(p.value, null);
    });

    it('rising monotonic → RMI = 100 (no down momentum)', () => {
        // length=3, momentum=1 → momentums at i>=1: all positive (up = 1 each, down = 0).
        // First SMA of up at i=3 (need 3 momentums starting i=1..3).
        const out = calcRelativeMomentumIndex(makeCandles([1, 2, 3, 4, 5, 6]), { length: 3, momentum: 1 });
        // i=0,1,2 → null; i=3 first non-null
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        assert.strictEqual(out[2].value, null);
        approxEq(out[3].value, 100);
        approxEq(out[4].value, 100);
        approxEq(out[5].value, 100);
    });

    it('falling monotonic → RMI = 0', () => {
        const out = calcRelativeMomentumIndex(makeCandles([6, 5, 4, 3, 2, 1]), { length: 3, momentum: 1 });
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        assert.strictEqual(out[2].value, null);
        approxEq(out[3].value, 0);
        approxEq(out[4].value, 0);
        approxEq(out[5].value, 0);
    });

    it('flat series → null (up == down == 0, den == 0)', () => {
        const out = calcRelativeMomentumIndex(makeCandles([5, 5, 5, 5, 5, 5]), { length: 3, momentum: 1 });
        for (const p of out) assert.strictEqual(p.value, null);
    });

    it('preserves time', () => {
        const candles = makeCandles([1, 2, 3, 4, 5]);
        const out = calcRelativeMomentumIndex(candles, { length: 2, momentum: 1 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });
});
