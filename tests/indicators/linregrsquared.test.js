// LinearRegRSquared: 1 - SS_err/SS_tot of linear fit over trailing closes.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcLinearRegRSquared } = require('../../src/chart/indicators/calc/linregrsquared.js');

function mk(close, i) {
    return { time: `t${i}`, open: close, high: close, low: close, close, volume: 1 };
}

describe('calcLinearRegRSquared', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcLinearRegRSquared([], {}), []);
    });

    it('first (length-1) bars are null', () => {
        const r = calcLinearRegRSquared([1,2,3,4,5].map(mk), { length: 4 });
        assert.strictEqual(r[0].value, null);
        assert.strictEqual(r[1].value, null);
        assert.strictEqual(r[2].value, null);
        assert.notStrictEqual(r[3].value, null);
    });

    it('perfect linear data → R² = 1', () => {
        // y = x: closes = [1,2,3,4,5]
        const r = calcLinearRegRSquared([1,2,3,4,5].map(mk), { length: 5 });
        assert.ok(Math.abs(r[4].value - 1) < 1e-9, `got ${r[4].value}, want 1`);
    });

    it('flat data (constant) → R² = 0 (SS_tot = 0)', () => {
        const r = calcLinearRegRSquared([5,5,5,5,5].map(mk), { length: 5 });
        assert.strictEqual(r[4].value, 0);
    });

    it('R² lies in [0, 1] for typical noisy data', () => {
        const closes = [10, 12, 11, 13, 14, 12, 15, 17, 16, 18];
        const r = calcLinearRegRSquared(closes.map(mk), { length: 5 });
        for (let i = 4; i < closes.length; i++) {
            assert.ok(r[i].value >= 0 && r[i].value <= 1 + 1e-12, `bar ${i}: ${r[i].value}`);
        }
    });

    it('output length equals input length', () => {
        const r = calcLinearRegRSquared([1,2,3,4,5,6,7].map(mk), { length: 3 });
        assert.strictEqual(r.length, 7);
    });
});
