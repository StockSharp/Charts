// Vortex: VI+/VI- rolling sums divided by trailing TR sum.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcVortex } = require('../../src/chart/indicators/calc/vortex.js');

function mk(rows) {
    return rows.map((r, i) => ({
        time: `t${i}`,
        open: r[3], high: r[0], low: r[1], close: r[2], volume: 1,
    }));
}

describe('calcVortex', () => {
    it('empty candles → empty series', () => {
        assert.deepStrictEqual(calcVortex([], { length: 3 }), { viPlus: [], viMinus: [] });
    });

    it('output length matches input length for both series', () => {
        const c = mk([
            [10, 5, 7, 6],
            [11, 6, 8, 7],
            [12, 7, 10, 8],
            [13, 8, 12, 10],
            [14, 10, 13, 12],
        ]);
        const r = calcVortex(c, { length: 3 });
        assert.strictEqual(r.viPlus.length, 5);
        assert.strictEqual(r.viMinus.length, 5);
    });

    it('warm-up: first `length` bars are null', () => {
        const c = mk([
            [10, 5, 7, 6],
            [11, 6, 8, 7],
            [12, 7, 10, 8],
            [13, 8, 12, 10],
        ]);
        const r = calcVortex(c, { length: 3 });
        for (let i = 0; i < 3; i++) {
            assert.strictEqual(r.viPlus[i].value, null);
            assert.strictEqual(r.viMinus[i].value, null);
        }
        assert.notStrictEqual(r.viPlus[3].value, null);
        assert.notStrictEqual(r.viMinus[3].value, null);
    });

    it('hand-computed length=2', () => {
        // Three bars: idx 0 (seed prev), idx 1, idx 2. length=2 → first emit at idx 2.
        // bar0 H=10 L=5 C=7
        // bar1 H=11 L=6 C=8 ⇒ TR = max(11-6, |11-7|, |6-7|) = 5. VM+ = |11-5|=6. VM- = |6-10|=4.
        // bar2 H=12 L=7 C=10 ⇒ TR = max(12-7, |12-8|, |7-8|) = 5. VM+ = |12-6|=6. VM- = |7-11|=4.
        // sums over last 2 bars (idx 1+2): TR=10, VM+=12, VM-=8 ⇒ VI+ = 1.2, VI- = 0.8.
        const c = mk([[10, 5, 7, 6], [11, 6, 8, 7], [12, 7, 10, 8]]);
        const r = calcVortex(c, { length: 2 });
        assert.ok(Math.abs(r.viPlus[2].value - 1.2) < 1e-9);
        assert.ok(Math.abs(r.viMinus[2].value - 0.8) < 1e-9);
    });
});
