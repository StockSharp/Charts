// WeightedClosePrice: (H + L + 2*C) / 4 per candle.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcWeightedClosePrice } = require('../../src/chart/indicators/calc/weightedcloseprice.js');

function mk(rows) {
    return rows.map((r, i) => ({
        time: `t${i}`, open: r[2], high: r[0], low: r[1], close: r[2], volume: 1,
    }));
}

describe('calcWeightedClosePrice', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcWeightedClosePrice([], {}), []);
    });

    it('hand-computed', () => {
        // (12+8+2*10)/4 = 10
        // (14+10+2*12)/4 = 12
        // (15+9+2*13)/4 = 12.5
        const out = calcWeightedClosePrice(mk([
            [12, 8, 10],
            [14, 10, 12],
            [15, 9, 13],
        ]), {});
        assert.strictEqual(out[0].value, 10);
        assert.strictEqual(out[1].value, 12);
        assert.strictEqual(out[2].value, 12.5);
    });

    it('output length equals input length', () => {
        const out = calcWeightedClosePrice(mk([[1, 1, 1], [2, 2, 2]]), {});
        assert.strictEqual(out.length, 2);
    });

    it('time passed through', () => {
        const c = mk([[1, 1, 1], [2, 2, 2]]);
        const out = calcWeightedClosePrice(c, {});
        assert.strictEqual(out[0].time, c[0].time);
        assert.strictEqual(out[1].time, c[1].time);
    });
});
