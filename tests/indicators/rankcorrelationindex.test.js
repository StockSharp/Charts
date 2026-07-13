// Rank Correlation Index (Spearman) — corner cases.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcRankCorrelationIndex } = require('../../src/chart/indicators/calc/rankcorrelationindex.js');

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

describe('calcRankCorrelationIndex', () => {
    it('empty input → []', () => {
        assert.deepStrictEqual(calcRankCorrelationIndex([], { length: 5 }), []);
    });

    it('warm-up nulls before length', () => {
        const out = calcRankCorrelationIndex(makeCandles([1, 2, 3, 4]), { length: 5 });
        for (const p of out) assert.strictEqual(p.value, null);
    });

    it('monotonic increasing → Spearman = +1', () => {
        const out = calcRankCorrelationIndex(makeCandles([10, 20, 30, 40, 50]), { length: 5 });
        approxEq(out[4].value, 1);
    });

    it('monotonic decreasing → Spearman = -1', () => {
        const out = calcRankCorrelationIndex(makeCandles([50, 40, 30, 20, 10]), { length: 5 });
        approxEq(out[4].value, -1);
    });

    it('all equal (heavy ties) → 0', () => {
        const out = calcRankCorrelationIndex(makeCandles([7, 7, 7, 7, 7]), { length: 5 });
        approxEq(out[4].value, 0);
    });

    it('preserves time', () => {
        const candles = makeCandles([1, 2, 3, 4, 5, 6]);
        const out = calcRankCorrelationIndex(candles, { length: 5 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });
});
