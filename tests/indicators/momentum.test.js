// Momentum tests.

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
    it('length=3 over [1,2,3,4,5,6,7]', () => {
        // .cs buffer capacity = 4. Trace:
        //  i=0 push 1, buf=[1], val = 1-1 = 0.
        //  i=1 push 2, buf=[1,2], val = 2-1 = 1.
        //  i=2 push 3, buf=[1,2,3], val = 3-1 = 2.
        //  i=3 push 4, buf=[1,2,3,4] (full), val = 4-1 = 3.
        //  i=4 push 5, buf evicts 1 → [2,3,4,5], val = 5-2 = 3.
        //  i=5 push 6, evict 2 → [3,4,5,6], val = 6-3 = 3.
        //  i=6 push 7, evict 3 → [4,5,6,7], val = 7-4 = 3.
        const out = calcMomentum(makeCandles([1, 2, 3, 4, 5, 6, 7]), { length: 3 });
        assert.deepStrictEqual(out.map(p => p.value), [0, 1, 2, 3, 3, 3, 3]);
    });

    it('constant series → 0 momentum throughout', () => {
        const out = calcMomentum(makeCandles([5, 5, 5, 5, 5]), { length: 2 });
        for (const p of out) assert.strictEqual(p.value, 0);
    });

    it('default length=5 — first 5 bars compare to buf[0] which is closer than length back', () => {
        const closes = [10, 11, 12, 13, 14, 15];
        const out = calcMomentum(makeCandles(closes)); // default length=5
        // capacity=6. All 6 fit. Buf[0]=10 throughout.
        assert.deepStrictEqual(out.map(p => p.value), [0, 1, 2, 3, 4, 5]);
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
