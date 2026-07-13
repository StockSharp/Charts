// Vidya — CMO-modulated EMA. Matches StockSharp's Vidya.cs which gates
// emission on the inner CMO becoming formed (Length deltas), then uses a
// Buffer-Sum/Length partial seed for `Length` bars before switching to
// the variable-smoothing recurrence.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcVidya } = require('../../src/chart/indicators/calc/vidya.js');

function mk(closes) {
    return closes.map((c, i) => ({
        time: `t${i}`, open: c, high: c, low: c, close: c, volume: 1,
    }));
}

describe('calcVidya', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcVidya([], { length: 3 }), []);
    });

    it('length larger than candles → all null', () => {
        const out = calcVidya(mk([1, 2, 3]), { length: 10 });
        for (const p of out) assert.strictEqual(p.value, null);
    });

    it('emits null until inner CMO is formed (length deltas after bar 0)', () => {
        // length=3 → CMO needs 3 deltas → forms at bar 3 (after closes
        // [1,2,3,4]: deltas 1,1,1). First non-null Vidya output at bar 3.
        const out = calcVidya(mk([1, 2, 3, 4, 5, 6, 7, 8]), { length: 3 });
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        assert.strictEqual(out[2].value, null);
        assert.notStrictEqual(out[3].value, null);
        // Partial seed at first formed bar: Buffer holds only close[3]=4,
        // emit Buffer.Sum / Length = 4 / 3.
        assert.ok(Math.abs(out[3].value - 4 / 3) < 1e-12);
    });

    it('partial-seed growth: Vidya[k] = sum(closes from cmo-form to k) / length while Buffer not yet full', () => {
        // length=3, closes monotonic so deltas all positive → CMO=+100 from
        // bar 3 onward. Vidya pushes close[3], close[4] before Buffer fills.
        const out = calcVidya(mk([1, 2, 3, 4, 5, 6, 7]), { length: 3 });
        // Bar 3: Buffer=[4]            → 4/3
        assert.ok(Math.abs(out[3].value - 4 / 3) < 1e-12);
        // Bar 4: Buffer=[4,5]          → 9/3 = 3
        assert.ok(Math.abs(out[4].value - 9 / 3) < 1e-12);
        // Bar 5: Buffer=[4,5,6] full   → 15/3 = 5; isFormed flips after
        assert.ok(Math.abs(out[5].value - 15 / 3) < 1e-12);
    });

    it('output length equals input length', () => {
        const out = calcVidya(mk([1, 2, 3, 4, 5, 6, 7]), { length: 3 });
        assert.strictEqual(out.length, 7);
    });

    it('time passed through', () => {
        const c = mk([1, 2, 3, 4, 5]);
        const out = calcVidya(c, { length: 3 });
        for (let i = 0; i < c.length; i++) assert.strictEqual(out[i].time, c[i].time);
    });
});
