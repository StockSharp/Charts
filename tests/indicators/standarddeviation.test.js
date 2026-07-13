// Standard Deviation (population, /Length) — hand-checked.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcStandardDeviation } = require('../../src/chart/indicators/calc/standarddeviation.js');

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

describe('calcStandardDeviation', () => {
    it('empty input → []', () => {
        assert.deepStrictEqual(calcStandardDeviation([], { length: 3 }), []);
    });

    it('length=3 on [1,2,3]: mean=2, variance=(1+0+1)/3=2/3, std=sqrt(2/3)', () => {
        const out = calcStandardDeviation(makeCandles([1, 2, 3]), { length: 3 });
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        approxEq(out[2].value, Math.sqrt(2 / 3));
    });

    it('flat series → 0', () => {
        const out = calcStandardDeviation(makeCandles([5, 5, 5, 5]), { length: 3 });
        approxEq(out[2].value, 0);
        approxEq(out[3].value, 0);
    });

    it('warm-up: length > input → all null', () => {
        const out = calcStandardDeviation(makeCandles([1, 2, 3]), { length: 10 });
        for (const p of out) assert.strictEqual(p.value, null);
    });

    it('preserves time', () => {
        const candles = makeCandles([1, 2, 3, 4]);
        const out = calcStandardDeviation(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });
});
