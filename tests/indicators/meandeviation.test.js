// MeanDeviation: SMA of |close - SMA(close,N)| over a rolling window of N.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcMeanDeviation } =
    require('../../src/chart/indicators/calc/meandeviation.js');

function approxEq(actual, expected, eps = 1e-12) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `t${i}`,
        open: c, high: c, low: c, close: c, volume: 0,
    }));
}

describe('calcMeanDeviation', () => {
    it('length=3 over [2,4,6,8,10]: warm-up null, then constant 4/3 (linear ramp)', () => {
        const out = calcMeanDeviation(makeCandles([2, 4, 6, 8, 10]), { length: 3 });
        assert.strictEqual(out.length, 5);
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        // window [2,4,6] sma=4, |2-4|+|4-4|+|6-4|=4, md=4/3
        approxEq(out[2].value, 4 / 3);
        // [4,6,8] sma=6, same shape → 4/3
        approxEq(out[3].value, 4 / 3);
        // [6,8,10] sma=8 → 4/3
        approxEq(out[4].value, 4 / 3);
    });

    it('length=4 spot check against hand-computed value', () => {
        // closes [1, 2, 3, 10] → sma=4, |1-4|+|2-4|+|3-4|+|10-4| = 3+2+1+6 = 12 → /4 = 3
        const out = calcMeanDeviation(makeCandles([1, 2, 3, 10]), { length: 4 });
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        assert.strictEqual(out[2].value, null);
        approxEq(out[3].value, 3);
    });

    it('default length=5 matches the .cs ctor (first non-null at index 4)', () => {
        const out = calcMeanDeviation(makeCandles([1, 2, 3, 4, 5]));
        for (let i = 0; i < 4; i++) assert.strictEqual(out[i].value, null);
        // sma=3, deviations 2,1,0,1,2 → sum=6 → md=6/5=1.2
        approxEq(out[4].value, 1.2);
    });

    it('constant series → mean deviation is zero once formed', () => {
        const out = calcMeanDeviation(makeCandles([7, 7, 7, 7, 7, 7]), { length: 3 });
        for (let i = 2; i < 6; i++) approxEq(out[i].value, 0);
    });

    it('empty input → empty output', () => {
        assert.deepStrictEqual(calcMeanDeviation([], { length: 5 }), []);
    });
});
