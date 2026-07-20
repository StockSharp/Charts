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

    it('null until Vidya is formed (CMO forms at length, then buffer fills)', () => {
        // length=3 → CMO forms at bar 3; Vidya's own buffer then fills over `length`
        // more bars, so IsFormed and the first output land at bar 2*length-1 = 5.
        // StockSharp reports the partial-seed bars as not-formed (null).
        const out = calcVidya(mk([1, 2, 3, 4, 5, 6, 7, 8]), { length: 3 });
        for (let i = 0; i < 5; i++) assert.strictEqual(out[i].value, null);
        // First formed bar: SMA seed = Buffer.Sum / Length = (4+5+6)/3 = 5.
        assert.ok(Math.abs(out[5].value - 5) < 1e-12);
    });

    it('warm-up null, then SMA seed and recurrence', () => {
        const out = calcVidya(mk([1, 2, 3, 4, 5, 6, 7]), { length: 3 });
        for (let i = 0; i < 5; i++) assert.strictEqual(out[i].value, null);
        assert.ok(Math.abs(out[5].value - 5) < 1e-12);
        assert.ok(Math.abs(out[6].value - 6) < 1e-12);
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
