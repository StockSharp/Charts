// Momentum tests. StockSharp Momentum is formed only when Buffer.Count > Length
// (capacity Length+1), so the first non-null lands at index `length`; earlier bars
// are null.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcMomentum } = require('../../src/chart/indicators/calc/momentum.js');

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `2025-01-01T00:0${i}:00Z`,
        open: c, high: c, low: c, close: c, volume: 0,
    }));
}

describe('calcMomentum', () => {
    it('length=3 over [1,2,3,4,5,6,7] — null until formed at index 3', () => {
        // capacity = 4; formed once buf holds 4 values (Buffer.Count > 3), i.e. index 3.
        //  i=0..2: null (warm-up)
        //  i=3 buf=[1,2,3,4]  val = 4-1 = 3
        //  i=4 evict 1 → [2,3,4,5], val = 5-2 = 3
        //  i=5 → [3,4,5,6], val = 6-3 = 3
        //  i=6 → [4,5,6,7], val = 7-4 = 3
        const out = calcMomentum(makeCandles([1, 2, 3, 4, 5, 6, 7]), { length: 3 });
        assert.deepStrictEqual(out.map(p => p.value), [null, null, null, 3, 3, 3, 3]);
    });

    it('constant series → 0 once formed, null during warm-up', () => {
        const out = calcMomentum(makeCandles([5, 5, 5, 5, 5]), { length: 2 });
        // length=2 → capacity 3, formed at index 2.
        assert.deepStrictEqual(out.map(p => p.value), [null, null, 0, 0, 0]);
    });

    it('default length=5 — first non-null lands at index 5', () => {
        const closes = [10, 11, 12, 13, 14, 15];
        const out = calcMomentum(makeCandles(closes)); // default length=5, capacity=6
        // buf fills to 6 only at index 5: 15 - buf[0]=10 = 5.
        assert.deepStrictEqual(out.map(p => p.value), [null, null, null, null, null, 5]);
    });

    it('empty input → empty output', () => {
        assert.deepStrictEqual(calcMomentum([], { length: 5 }), []);
    });

    it('preserves candle.time', () => {
        const candles = makeCandles([1, 2, 3]);
        const out = calcMomentum(candles, { length: 1 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });
});
