// WoodiesCCI: CCI(Length) + SMA(cci, SMALength).

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcWoodiesCCI } = require('../../src/chart/indicators/calc/woodiescci.js');

function mk(rows) {
    return rows.map((r, i) => ({
        time: `t${i}`, open: r[2], high: r[0], low: r[1], close: r[2], volume: 1,
    }));
}

describe('calcWoodiesCCI', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcWoodiesCCI([], {}), { cci: [], signal: [] });
    });

    it('output length matches input length for both series', () => {
        const rows = Array.from({ length: 30 }, (_, i) => [i + 2, i, i + 1]);
        const r = calcWoodiesCCI(mk(rows), { length: 5, smaLength: 3 });
        assert.strictEqual(r.cci.length, 30);
        assert.strictEqual(r.signal.length, 30);
    });

    it('signal lags CCI by smaLength-1 bars', () => {
        const rows = Array.from({ length: 30 }, (_, i) => [i + 2, i, i + 1]);
        const r = calcWoodiesCCI(mk(rows), { length: 4, smaLength: 3 });
        // First non-null CCI at index 3 (length-1). First non-null signal
        // at index 3 + 3 - 1 = 5 (smaLength=3 ⇒ need 3 cci values).
        assert.strictEqual(r.cci[3].value !== null, true);
        assert.strictEqual(r.signal[3].value, null);
        assert.strictEqual(r.signal[4].value, null);
        assert.strictEqual(r.signal[5].value !== null, true);
    });

    it('time passed through', () => {
        const rows = Array.from({ length: 10 }, (_, i) => [i + 2, i, i + 1]);
        const c = mk(rows);
        const r = calcWoodiesCCI(c, { length: 4, smaLength: 3 });
        for (let i = 0; i < c.length; i++) {
            assert.strictEqual(r.cci[i].time, c[i].time);
            assert.strictEqual(r.signal[i].time, c[i].time);
        }
    });
});
