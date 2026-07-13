// Standard Error of linear regression — checks against simple cases.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcStandardError } = require('../../src/chart/indicators/calc/standarderror.js');

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

describe('calcStandardError', () => {
    it('empty input → []', () => {
        assert.deepStrictEqual(calcStandardError([], { length: 3 }), []);
    });

    it('perfectly linear closes → stderr = 0', () => {
        const out = calcStandardError(makeCandles([10, 11, 12, 13, 14]), { length: 5 });
        approxEq(out[4].value, 0);
    });

    it('length=2 → always returns 0 once formed', () => {
        const out = calcStandardError(makeCandles([1, 7, 3, 100]), { length: 2 });
        approxEq(out[1].value, 0);
        approxEq(out[2].value, 0);
        approxEq(out[3].value, 0);
    });

    it('warm-up nulls before length', () => {
        const out = calcStandardError(makeCandles([1, 2, 3]), { length: 5 });
        for (const p of out) assert.strictEqual(p.value, null);
    });

    it('non-collinear closes give positive stderr', () => {
        // 5 points: residuals from best-fit line are non-zero.
        const out = calcStandardError(makeCandles([1, 3, 2, 5, 4]), { length: 5 });
        assert.ok(out[4].value > 0);
    });

    it('preserves time', () => {
        const candles = makeCandles([1, 2, 3, 4, 5]);
        const out = calcStandardError(candles, { length: 3 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });
});
