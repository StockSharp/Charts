// LinearReg: shape, warm-up, perfect-linear invariant, constant series.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcLinearReg } = require('../../src/chart/indicators/calc/linreg.js');

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `t${i}`,
        open: c, high: c, low: c, close: c, volume: 0,
    }));
}

describe('calcLinearReg', () => {
    it('empty candles → empty result', () => {
        assert.deepStrictEqual(calcLinearReg([], { length: 11 }), []);
    });

    it('length larger than candle count → every value null', () => {
        const out = calcLinearReg(makeCandles([1, 2, 3]), { length: 11 });
        assert.strictEqual(out.length, 3);
        for (const p of out) assert.strictEqual(p.value, null);
    });

    it('first (length-1) values are null (warm-up)', () => {
        const out = calcLinearReg(makeCandles([1, 2, 3, 4, 5]), { length: 3 });
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        assert.notStrictEqual(out[2].value, null);
    });

    it('perfect linear input → regression endpoint equals the input value', () => {
        // closes y = 2x + 5 with x = 0..9 → 5, 7, 9, 11, 13, 15, 17, 19, 21, 23
        const closes = [];
        for (let i = 0; i < 10; i++) closes.push(2 * i + 5);
        const out = calcLinearReg(makeCandles(closes), { length: 5 });
        for (let i = 4; i < 10; i++) {
            // endpoint of regression line is exactly closes[i]
            assert.ok(Math.abs(out[i].value - closes[i]) < 1e-9,
                `i=${i}: got ${out[i].value}, expected ${closes[i]}`);
        }
    });

    it('constant series → regression endpoint == constant', () => {
        const out = calcLinearReg(makeCandles([7, 7, 7, 7, 7, 7]), { length: 4 });
        for (let i = 3; i < 6; i++) {
            assert.ok(Math.abs(out[i].value - 7) < 1e-9);
        }
    });

    it('hand-computed length=3 over [1,3,2]: slope=0.5, b=1.5 → endpoint=2.5', () => {
        // x=0..2, y=[1,3,2]: sumX=3, sumY=6, sumXY=0+3+4=7, sumX2=0+1+4=5
        // divisor = 3*5 - 9 = 6; slope = (3*7 - 3*6)/6 = (21-18)/6 = 0.5
        // b = (6 - 0.5*3)/3 = 4.5/3 = 1.5; endpoint = 0.5*2 + 1.5 = 2.5
        const out = calcLinearReg(makeCandles([1, 3, 2]), { length: 3 });
        assert.ok(Math.abs(out[2].value - 2.5) < 1e-9);
    });

    it('time pass-through', () => {
        const candles = makeCandles([1, 2, 3, 4]);
        const out = calcLinearReg(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });
});
