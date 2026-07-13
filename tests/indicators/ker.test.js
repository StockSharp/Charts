// Kaufman Efficiency Ratio: trend strength in [0, 1].

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcKaufmanEfficiencyRatio } = require('../../src/chart/indicators/calc/ker.js');

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

function mk(closes) {
    return closes.map((c, i) => ({
        time: `t${i}`, open: c, high: c, low: c, close: c, volume: 0,
    }));
}

describe('calcKaufmanEfficiencyRatio', () => {
    it('empty candles → empty array', () => {
        assert.deepStrictEqual(calcKaufmanEfficiencyRatio([], {}), []);
    });

    it('warm-up: length-1 leading nulls', () => {
        const candles = mk([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        const r = calcKaufmanEfficiencyRatio(candles, { length: 5 });
        for (let i = 0; i < 4; i++) assert.strictEqual(r[i].value, null);
        assert.notStrictEqual(r[4].value, null);
    });

    it('monotonic ramp → KER == 1 (perfect trend)', () => {
        const candles = mk([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        const r = calcKaufmanEfficiencyRatio(candles, { length: 5 });
        for (let i = 4; i < 10; i++) {
            approxEq(r[i].value, 1, 1e-12);
        }
    });

    it('flat closes → volatility 0 → KER 0 (not null)', () => {
        const candles = mk([5, 5, 5, 5, 5, 5, 5]);
        const r = calcKaufmanEfficiencyRatio(candles, { length: 4 });
        for (let i = 3; i < 7; i++) approxEq(r[i].value, 0);
    });

    it('output always in [0, 1]', () => {
        const closes = [];
        for (let i = 0; i < 40; i++) closes.push((i % 3 === 0) ? i : (i % 5));
        const candles = mk(closes);
        const r = calcKaufmanEfficiencyRatio(candles, { length: 10 });
        for (const p of r) {
            if (p.value !== null) {
                assert.ok(p.value >= 0 && p.value <= 1, `${p.value} out of [0,1]`);
            }
        }
    });

    it('hand-computed reference: length=3 on [1,2,1,2,1]', () => {
        // At i=2 (length-1=2): window=[1,2,1]. change=|1-1|=0. volatility=|2-1|+|1-2|=2. KER=0/2=0.
        // At i=3: window=[2,1,2]. change=|2-2|=0. volatility=|1-2|+|2-1|=2. KER=0.
        // At i=4: window=[1,2,1]. change=|1-1|=0. volatility=2. KER=0.
        const r = calcKaufmanEfficiencyRatio(mk([1, 2, 1, 2, 1]), { length: 3 });
        approxEq(r[2].value, 0);
        approxEq(r[3].value, 0);
        approxEq(r[4].value, 0);
    });

    it('partial trend: length=3 on [1,2,3] → change=2, vol=2 → KER=1', () => {
        const r = calcKaufmanEfficiencyRatio(mk([1, 2, 3]), { length: 3 });
        assert.strictEqual(r[0].value, null);
        assert.strictEqual(r[1].value, null);
        approxEq(r[2].value, 1);
    });

    it('output length matches input length; timestamps pass through', () => {
        const candles = mk([10, 20, 30, 40, 50]);
        const r = calcKaufmanEfficiencyRatio(candles, { length: 3 });
        assert.strictEqual(r.length, 5);
        for (let i = 0; i < 5; i++) assert.strictEqual(r[i].time, candles[i].time);
    });
});
