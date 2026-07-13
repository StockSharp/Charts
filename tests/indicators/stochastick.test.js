// Stochastic %K — raw %K only (no smoothing / no %D).

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcStochasticK } = require('../../src/chart/indicators/calc/stochastick.js');

function makeOHLC(rows) {
    return rows.map((r, i) => ({
        time: `2025-01-01T00:${String(i).padStart(2, '0')}:00Z`,
        open: r[2], high: r[0], low: r[1], close: r[2], volume: 0,
    }));
}

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`);
}

describe('calcStochasticK', () => {
    it('empty input → []', () => {
        assert.deepStrictEqual(calcStochasticK([], { length: 3 }), []);
    });

    it('warm-up nulls before length', () => {
        const out = calcStochasticK(makeOHLC([[2, 1, 1.5], [3, 2, 2.5]]), { length: 3 });
        for (const p of out) assert.strictEqual(p.value, null);
    });

    it('length=3 over rising series → %K = 100*(close-lowestLow)/(highestHigh-lowestLow)', () => {
        const out = calcStochasticK(makeOHLC([
            [2, 1, 1.5],
            [3, 2, 2.5],
            [4, 3, 3.5], // i=2: lo=1, hi=4, close=3.5 → 100*2.5/3 = 83.333...
            [5, 4, 4.5], // i=3: lo=2, hi=5, close=4.5 → 100*2.5/3
        ]), { length: 3 });
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        approxEq(out[2].value, 100 * 2.5 / 3);
        approxEq(out[3].value, 100 * 2.5 / 3);
    });

    it('flat range → 0 (StochasticK fallback differs from full Stochastic which returns 100)', () => {
        const out = calcStochasticK(makeOHLC([[5, 5, 5], [5, 5, 5], [5, 5, 5]]), { length: 3 });
        assert.strictEqual(out[2].value, 0);
    });

    it('preserves time', () => {
        const candles = makeOHLC([[2, 1, 1.5], [3, 2, 2.5], [4, 3, 3.5]]);
        const out = calcStochasticK(candles, { length: 3 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });
});
