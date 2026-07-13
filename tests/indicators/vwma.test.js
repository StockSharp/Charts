// VWMA: rolling close*volume sum / volume sum.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcVWMA } = require('../../src/chart/indicators/calc/vwma.js');

function mk(rows) {
    return rows.map((r, i) => ({
        time: `t${i}`, open: r[0], high: r[0], low: r[0], close: r[0], volume: r[1],
    }));
}

describe('calcVWMA', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcVWMA([], { length: 3 }), []);
    });

    it('length larger than candles → all null', () => {
        const out = calcVWMA(mk([[1, 1], [2, 2]]), { length: 10 });
        for (const p of out) assert.strictEqual(p.value, null);
    });

    it('hand-computed length=3', () => {
        // (1*1 + 2*2 + 3*3) / (1+2+3) = 14/6 = 7/3
        // (2*2 + 3*3 + 4*4) / (2+3+4) = 29/9
        const out = calcVWMA(mk([[1, 1], [2, 2], [3, 3], [4, 4]]), { length: 3 });
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        assert.ok(Math.abs(out[2].value - 14 / 6) < 1e-12);
        assert.ok(Math.abs(out[3].value - 29 / 9) < 1e-12);
    });

    it('zero volume window → null', () => {
        const out = calcVWMA(mk([[1, 0], [2, 0], [3, 0]]), { length: 3 });
        assert.strictEqual(out[2].value, null);
    });

    it('output length equals input length', () => {
        const out = calcVWMA(mk([[1, 1], [2, 1], [3, 1], [4, 1]]), { length: 2 });
        assert.strictEqual(out.length, 4);
    });
});
