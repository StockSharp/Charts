// Detrended Synthetic Price: empty/oversize warm-up + hand-computed
// reference. DSP = (highestHigh + lowestLow) / 2 over `length`.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcDSP } = require('../../src/chart/indicators/calc/dsp.js');

function makeCandles(hl) {
    return hl.map((p, i) => ({
        time: `t${i}`,
        open: (p[0] + p[1]) / 2,
        high: p[0],
        low: p[1],
        close: (p[0] + p[1]) / 2,
        volume: 0,
    }));
}

describe('calcDSP', () => {
    it('empty → empty', () => {
        assert.deepStrictEqual(calcDSP([], { length: 14 }), []);
    });

    it('length too big → all null', () => {
        const r = calcDSP(makeCandles([[2,1],[3,2],[4,3]]), { length: 14 });
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('hand-computed length=3 reference', () => {
        // candles (h, l):
        // i=0: (10, 5)
        // i=1: (12, 6)
        // i=2: (15, 7) ← first formed
        // i=3: (14, 4)
        // i=4: (13, 9)
        //
        // i=2: hi=15, lo=5  → (15+5)/2  = 10
        // i=3: hi=15, lo=4  → (15+4)/2  = 9.5
        // i=4: hi=15, lo=4  → (15+4)/2  = 9.5
        const r = calcDSP(makeCandles([[10,5],[12,6],[15,7],[14,4],[13,9]]), { length: 3 });
        assert.strictEqual(r[0].value, null);
        assert.strictEqual(r[1].value, null);
        assert.strictEqual(r[2].value, 10);
        assert.strictEqual(r[3].value, 9.5);
        assert.strictEqual(r[4].value, 9.5);
    });

    it('first non-null lands at index length-1', () => {
        const r = calcDSP(makeCandles([[2,1],[3,2],[4,3],[5,4],[6,5]]), { length: 4 });
        for (let i = 0; i < 3; i++) assert.strictEqual(r[i].value, null);
        assert.notStrictEqual(r[3].value, null);
    });

    it('flat highs/lows → DSP = midpoint of the constant window', () => {
        const r = calcDSP(makeCandles([[10,4],[10,4],[10,4]]), { length: 2 });
        assert.strictEqual(r[0].value, null);
        assert.strictEqual(r[1].value, 7);
        assert.strictEqual(r[2].value, 7);
    });

    it('time field passed through unchanged', () => {
        const candles = makeCandles([[2,1],[3,2],[4,3],[5,4]]);
        const r = calcDSP(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r[i].time, candles[i].time);
        }
    });
});
