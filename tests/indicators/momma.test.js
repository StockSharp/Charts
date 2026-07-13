// MomentumOfMovingAverage tests.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcMomentumOfMovingAverage } = require('../../src/chart/indicators/calc/momma.js');

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `2025-01-01T${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`,
        open: c, high: c, low: c, close: c, volume: 0,
    }));
}

describe('calcMomentumOfMovingAverage', () => {
    it('constant series → 0 momentum (ma never changes, firstBuffer == ma)', () => {
        // Constant 5, length=3. After enough bars, sum stays = 3*5=15, ma=5,
        // buffer eventually fills with 5s and ma pushes don't change the sum.
        const out = calcMomentumOfMovingAverage(makeCandles([5, 5, 5, 5, 5, 5]), { length: 3 });
        assert.strictEqual(out.length, 6);
        for (let i = 0; i < 2; i++) assert.strictEqual(out[i].value, null);
        // At each output, ma=5 and firstBuffer is some 5 ⇒ momentum=0.
        for (let i = 2; i < 6; i++) {
            assert.strictEqual(out[i].value, 0);
        }
    });

    it('replicates .cs buggy buffer trace on a tiny rising series', () => {
        // length=3, closes=[1,2,3,4]
        // i=0: push(1). buf=[1], sum=1. ma=1/3. count<3 → null.
        // i=1: push(2). buf=[1,2], sum=3. ma=1. count<3 → null.
        // i=2: push(3). buf=[1,2,3], sum=6. ma=2. count==3 → IsFormed.
        //   push(ma=2). buf=[2,3,2], sum=7. firstBuffer=2.
        //   output: (2 - 2)/2 * 100 = 0.
        // i=3: push(4). buf was [2,3,2] sum=7 → push 4 → evict 2 → buf=[3,2,4] sum=9.
        //   ma=9/3=3. IsFormed.
        //   push(3). buf=[2,4,3] sum=9. firstBuffer=2.
        //   output: (3-2)/2 * 100 = 50.
        const out = calcMomentumOfMovingAverage(makeCandles([1, 2, 3, 4]), { length: 3 });
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        assert.strictEqual(out[2].value, 0);
        assert.ok(Math.abs(out[3].value - 50) < 1e-9);
    });

    it('insufficient candles → all null', () => {
        const out = calcMomentumOfMovingAverage(makeCandles([1, 2]), { length: 5 });
        for (const p of out) assert.strictEqual(p.value, null);
    });

    it('empty input → empty output', () => {
        assert.deepStrictEqual(calcMomentumOfMovingAverage([], { length: 5 }), []);
    });

    it('preserves candle.time', () => {
        const candles = makeCandles([1, 2, 3, 4, 5]);
        const out = calcMomentumOfMovingAverage(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });

    it('momentumPeriod param is accepted but does not affect output (matches .cs quirk)', () => {
        const a = calcMomentumOfMovingAverage(makeCandles([1, 2, 3, 4]), { length: 3, momentumPeriod: 1 });
        const b = calcMomentumOfMovingAverage(makeCandles([1, 2, 3, 4]), { length: 3, momentumPeriod: 99 });
        assert.deepStrictEqual(a.map(p => p.value), b.map(p => p.value));
    });
});
