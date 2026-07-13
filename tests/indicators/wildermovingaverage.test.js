// WilderMovingAverage: SMMA over close.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcWilderMovingAverage } = require('../../src/chart/indicators/calc/wildermovingaverage.js');

function mk(closes) {
    return closes.map((c, i) => ({
        time: `t${i}`, open: c, high: c, low: c, close: c, volume: 1,
    }));
}

describe('calcWilderMovingAverage', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcWilderMovingAverage([], { length: 3 }), []);
    });

    it('hand-computed length=3 over [1..6]', () => {
        // seed at i=2: SMA(1,2,3) = 2
        // i=3: (2*2 + 4)/3 = 8/3
        // i=4: (8/3 * 2 + 5)/3 = (16/3 + 5)/3 = (16+15)/9 = 31/9
        // i=5: (31/9 * 2 + 6)/3 = (62/9 + 6)/3 = (62 + 54)/27 = 116/27
        const out = calcWilderMovingAverage(mk([1, 2, 3, 4, 5, 6]), { length: 3 });
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        assert.ok(Math.abs(out[2].value - 2) < 1e-12);
        assert.ok(Math.abs(out[3].value - 8 / 3) < 1e-12);
        assert.ok(Math.abs(out[4].value - 31 / 9) < 1e-12);
        assert.ok(Math.abs(out[5].value - 116 / 27) < 1e-12);
    });

    it('length larger than candles → all null', () => {
        const out = calcWilderMovingAverage(mk([1, 2, 3]), { length: 10 });
        for (const p of out) assert.strictEqual(p.value, null);
    });

    it('output length equals input length', () => {
        const out = calcWilderMovingAverage(mk([1, 2, 3, 4]), { length: 2 });
        assert.strictEqual(out.length, 4);
    });
});
