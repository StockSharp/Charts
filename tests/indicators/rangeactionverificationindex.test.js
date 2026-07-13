// Range Action Verification Index — abs(100*(sma_short - sma_long)/sma_long).

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcRangeActionVerificationIndex } = require('../../src/chart/indicators/calc/rangeactionverificationindex.js');

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

describe('calcRangeActionVerificationIndex', () => {
    it('empty input → []', () => {
        assert.deepStrictEqual(calcRangeActionVerificationIndex([], { shortLength: 2, longLength: 4 }), []);
    });

    it('warm-up nulls until longLength', () => {
        const candles = makeCandles([1, 2, 3, 4, 5]);
        const r = calcRangeActionVerificationIndex(candles, { shortLength: 2, longLength: 4 });
        for (let i = 0; i < 3; i++) assert.strictEqual(r[i].value, null);
        assert.ok(r[3].value !== null);
    });

    it('hand-computed: short=2 long=4 on [1,2,3,4,5,6]', () => {
        // i=3: shortSMA=(3+4)/2=3.5, longSMA=(1+2+3+4)/4=2.5 → |100*(3.5-2.5)/2.5| = 40
        // i=4: shortSMA=(4+5)/2=4.5, longSMA=(2+3+4+5)/4=3.5 → |100*1/3.5| ≈ 28.5714
        const r = calcRangeActionVerificationIndex(makeCandles([1, 2, 3, 4, 5, 6]),
            { shortLength: 2, longLength: 4 });
        approxEq(r[3].value, 40);
        approxEq(r[4].value, 100 / 3.5);
    });

    it('flat closes → 0', () => {
        const r = calcRangeActionVerificationIndex(makeCandles([5, 5, 5, 5, 5, 5]),
            { shortLength: 2, longLength: 4 });
        approxEq(r[3].value, 0);
        approxEq(r[4].value, 0);
        approxEq(r[5].value, 0);
    });

    it('preserves time', () => {
        const candles = makeCandles([1, 2, 3, 4, 5]);
        const r = calcRangeActionVerificationIndex(candles, { shortLength: 2, longLength: 4 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r[i].time, candles[i].time);
        }
    });
});
