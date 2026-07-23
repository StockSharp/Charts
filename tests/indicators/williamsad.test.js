// WilliamsAD: cumulative accumulation/distribution per Williams' rule.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcWilliamsAD } = require('../../src/chart/indicators/calc/williamsad.js');

function mk(rows) {
    return rows.map((r, i) => ({
        time: `t${i}`, open: r[2], high: r[0], low: r[1], close: r[2], volume: 1,
    }));
}

describe('calcWilliamsAD', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcWilliamsAD([], {}), []);
    });

    it('first bar null (no prev_close)', () => {
        const out = calcWilliamsAD(mk([[10, 5, 7]]), {});
        assert.strictEqual(out[0].value, null);
    });

    it('hand-computed increments', () => {
        // bar0 H=10 L=5 C=7 → prev=7, ad=0
        // bar1 H=12 L=6 C=10 (close>prev): ad += 10 - min(6,7) = 10-6 = 4 → ad=4
        // bar2 H=11 L=8 C=9  (close<prev=10): ad += 9 - max(11,10) = 9-11 = -2 → ad=2
        // bar3 H=12 L=8 C=9  (close==prev=9): ad += 0 → ad=2
        const out = calcWilliamsAD(mk([
            [10, 5, 7],
            [12, 6, 10],
            [11, 8, 9],
            [12, 8, 9],
        ]), {});
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, 4);
        assert.strictEqual(out[2].value, 2);
        assert.strictEqual(out[3].value, 2);
    });

    it('preserves StockSharp zero-close initialization sentinel', () => {
        const out = calcWilliamsAD(mk([
            [1, -1, 0],
            [2, -1, 0],
            [3, 0, 2],
            [4, 1, 3],
        ]), {});
        assert.deepStrictEqual(out.map(point => point.value), [null, null, null, 2]);
    });

    it('time passed through', () => {
        const c = mk([[1, 1, 1], [2, 2, 2]]);
        const out = calcWilliamsAD(c, {});
        for (let i = 0; i < c.length; i++) assert.strictEqual(out[i].time, c[i].time);
    });
});
