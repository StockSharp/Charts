// Donchian Channels: shape, warm-up, hand-computed reference vector.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcDonchian } = require('../../src/chart/indicators/calc/donchian.js');

function makeCandles(hl) {
    // hl = [[high, low], ...]
    return hl.map((p, i) => ({
        time: `t${i}`,
        open: (p[0] + p[1]) / 2,
        high: p[0],
        low: p[1],
        close: (p[0] + p[1]) / 2,
        volume: 0,
    }));
}

describe('calcDonchian', () => {
    it('empty candles → {upper:[], lower:[], middle:[]}', () => {
        assert.deepStrictEqual(calcDonchian([], { length: 20 }), { upper: [], lower: [], middle: [] });
    });

    it('length too big → all null on each band', () => {
        const r = calcDonchian(makeCandles([[2,1],[3,2],[4,3]]), { length: 10 });
        assert.strictEqual(r.upper.length, 3);
        for (let i = 0; i < 3; i++) {
            assert.strictEqual(r.upper[i].value, null);
            assert.strictEqual(r.lower[i].value, null);
            assert.strictEqual(r.middle[i].value, null);
        }
    });

    it('three sub-series have candles.length entries', () => {
        const candles = makeCandles([[2,1],[3,2],[4,3],[5,4],[6,5]]);
        const r = calcDonchian(candles, { length: 3 });
        assert.strictEqual(r.upper.length, candles.length);
        assert.strictEqual(r.lower.length, candles.length);
        assert.strictEqual(r.middle.length, candles.length);
    });

    it('hand-computed length=3 reference', () => {
        // candles (high, low):
        //   i=0: (10, 5)
        //   i=1: (12, 6)
        //   i=2: (15, 7)        ← first formed
        //   i=3: (14, 4)
        //   i=4: (13, 9)
        // length=3 → window indices i-2..i
        //   i=2: hi=max(10,12,15)=15, lo=min(5,6,7)=5  → mid=10
        //   i=3: hi=max(12,15,14)=15, lo=min(6,7,4)=4  → mid=9.5
        //   i=4: hi=max(15,14,13)=15, lo=min(7,4,9)=4  → mid=9.5
        const r = calcDonchian(makeCandles([[10,5],[12,6],[15,7],[14,4],[13,9]]), { length: 3 });
        assert.strictEqual(r.upper[0].value, null);
        assert.strictEqual(r.upper[1].value, null);
        assert.strictEqual(r.upper[2].value, 15);
        assert.strictEqual(r.lower[2].value, 5);
        assert.strictEqual(r.middle[2].value, 10);
        assert.strictEqual(r.upper[3].value, 15);
        assert.strictEqual(r.lower[3].value, 4);
        assert.strictEqual(r.middle[3].value, 9.5);
        assert.strictEqual(r.upper[4].value, 15);
        assert.strictEqual(r.lower[4].value, 4);
        assert.strictEqual(r.middle[4].value, 9.5);
    });

    it('flat high/low across window → upper==lower==middle', () => {
        const r = calcDonchian(makeCandles([[10,5],[10,5],[10,5],[10,5]]), { length: 2 });
        for (let i = 1; i < 4; i++) {
            assert.strictEqual(r.upper[i].value, 10);
            assert.strictEqual(r.lower[i].value, 5);
            assert.strictEqual(r.middle[i].value, 7.5);
        }
    });

    it('time field passed through unchanged on all three series', () => {
        const candles = makeCandles([[2,1],[3,2],[4,3],[5,4]]);
        const r = calcDonchian(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r.upper[i].time, candles[i].time);
            assert.strictEqual(r.lower[i].time, candles[i].time);
            assert.strictEqual(r.middle[i].time, candles[i].time);
        }
    });
});
