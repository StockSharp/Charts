// LinearRegSlope: warm-up, perfect-linear invariant, constant series.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcLinearRegSlope } = require('../../src/chart/indicators/calc/linregslope.js');

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `t${i}`,
        open: c, high: c, low: c, close: c, volume: 0,
    }));
}

describe('calcLinearRegSlope', () => {
    it('empty candles → empty result', () => {
        assert.deepStrictEqual(calcLinearRegSlope([], { length: 11 }), []);
    });

    it('first (length-1) values are null (warm-up)', () => {
        const out = calcLinearRegSlope(makeCandles([1, 2, 3, 4, 5]), { length: 3 });
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        assert.notStrictEqual(out[2].value, null);
    });

    it('perfect linear y = 2x + C → slope = 2', () => {
        const closes = [];
        for (let i = 0; i < 12; i++) closes.push(2 * i + 5);
        const out = calcLinearRegSlope(makeCandles(closes), { length: 5 });
        for (let i = 4; i < 12; i++) {
            assert.ok(Math.abs(out[i].value - 2) < 1e-9,
                `i=${i}: got ${out[i].value}, expected 2`);
        }
    });

    it('perfect linear y = -3x + 100 → slope = -3', () => {
        const closes = [];
        for (let i = 0; i < 10; i++) closes.push(-3 * i + 100);
        const out = calcLinearRegSlope(makeCandles(closes), { length: 4 });
        for (let i = 3; i < 10; i++) {
            assert.ok(Math.abs(out[i].value + 3) < 1e-9);
        }
    });

    it('constant series → slope = 0', () => {
        const out = calcLinearRegSlope(makeCandles([9, 9, 9, 9, 9, 9]), { length: 4 });
        for (let i = 3; i < 6; i++) {
            assert.ok(Math.abs(out[i].value) < 1e-9);
        }
    });

    it('hand-computed length=3 over [1,3,2]: slope=0.5', () => {
        const out = calcLinearRegSlope(makeCandles([1, 3, 2]), { length: 3 });
        assert.ok(Math.abs(out[2].value - 0.5) < 1e-9);
    });

    it('time pass-through', () => {
        const candles = makeCandles([1, 2, 3, 4]);
        const out = calcLinearRegSlope(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });
});
