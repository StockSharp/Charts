// VHF: vertical-horizontal filter ratio of price range over sum of |close deltas|.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcVHF } = require('../../src/chart/indicators/calc/vhf.js');

function mk(closes, highs, lows) {
    return closes.map((c, i) => ({
        time: `t${i}`,
        open: c,
        high: highs ? highs[i] : c,
        low: lows ? lows[i] : c,
        close: c,
        volume: 1,
    }));
}

describe('calcVHF', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcVHF([], { length: 3 }), []);
    });

    it('length larger than candles → all null', () => {
        const out = calcVHF(mk([1, 2, 3]), { length: 10 });
        assert.strictEqual(out.length, 3);
        for (const p of out) assert.strictEqual(p.value, null);
    });

    it('hand-computed: closes [1,2,3,4,5], length=3', () => {
        // For length=3 the first non-null bar is index 3.
        // At i=3, deltas (idx 1..3) = |2-1|+|3-2|+|4-3| = 3. high range = 4-2 = 2. → 2/3.
        // At i=4, deltas (idx 2..4) = |3-2|+|4-3|+|5-4| = 3. high range = 5-3 = 2. → 2/3.
        const out = calcVHF(mk([1, 2, 3, 4, 5]), { length: 3 });
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        assert.strictEqual(out[2].value, null);
        assert.ok(Math.abs(out[3].value - 2 / 3) < 1e-12);
        assert.ok(Math.abs(out[4].value - 2 / 3) < 1e-12);
    });

    it('flat closes (no movement) → null (division by zero)', () => {
        const out = calcVHF(mk([5, 5, 5, 5, 5]), { length: 3 });
        assert.strictEqual(out[3].value, null);
        assert.strictEqual(out[4].value, null);
    });

    it('output length equals input length', () => {
        const out = calcVHF(mk([1, 2, 3, 4, 5, 6]), { length: 3 });
        assert.strictEqual(out.length, 6);
    });

    it('time passed through', () => {
        const c = mk([1, 2, 3, 4]);
        const out = calcVHF(c, { length: 2 });
        for (let i = 0; i < c.length; i++) assert.strictEqual(out[i].time, c[i].time);
    });
});
