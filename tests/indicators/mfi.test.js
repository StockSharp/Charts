// Money Flow Index tests.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcMoneyFlowIndex } = require('../../src/chart/indicators/calc/mfi.js');

function mkCandle(i, h, l, c, v) {
    return {
        time: `2025-01-01T${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`,
        open: c, high: h, low: l, close: c, volume: v,
    };
}

describe('calcMoneyFlowIndex', () => {
    it('strictly rising typical price → 100 (no negFlow)', () => {
        // length=3, 3 bars rising typical price ⇒ negSum stays 0 ⇒ 100.
        const candles = [
            mkCandle(0, 2, 2, 2, 10),  // tp=2, prevTp init=0 → pos
            mkCandle(1, 3, 3, 3, 10),  // tp=3 > 2 → pos
            mkCandle(2, 4, 4, 4, 10),  // tp=4 > 3 → pos
        ];
        const out = calcMoneyFlowIndex(candles, { length: 3 });
        assert.strictEqual(out.length, 3);
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        assert.strictEqual(out[2].value, 100);
    });

    it('strictly falling typical price after first bar → 0 (negSum dominates)', () => {
        // length=2. Bars: tp=10 (pos vs init 0), then tp=5 (neg), then tp=2 (neg).
        // index 1: window covers [0,1]. moneyFlow[0]=10*10=100 (tp=10 > prev 0 → pos).
        //   moneyFlow[1]=5*10=50 (tp=5 < prev 10 → neg). posSum=100, negSum=50, total=150.
        //   MFI = 100*100/150.
        // index 2: window covers [1,2]. pos[1]=0, pos[2]=0 (2<5).
        //   neg[1]=50, neg[2]=20. posSum=0, negSum=70, total=70. MFI = 0.
        const candles = [
            mkCandle(0, 10, 10, 10, 10),
            mkCandle(1, 5, 5, 5, 10),
            mkCandle(2, 2, 2, 2, 10),
        ];
        const out = calcMoneyFlowIndex(candles, { length: 2 });
        assert.strictEqual(out[0].value, null);
        assert.ok(Math.abs(out[1].value - (100 * 100 / 150)) < 1e-9);
        assert.strictEqual(out[2].value, 0);
    });

    it('flat typical price after the first bar → posSum=0, negSum=0, total=0 → null', () => {
        // First bar: tp=5, posFlow contributes (since prevTp init=0).
        // Subsequent bars: tp=5 same as previous ⇒ neither pos nor neg.
        // With length=2 window at index 2 covers (i=1, i=2): both posFlow=0 and
        // negFlow=0 ⇒ negSum=0 ⇒ MFI = 100.
        const candles = [
            mkCandle(0, 5, 5, 5, 10),
            mkCandle(1, 5, 5, 5, 10),
            mkCandle(2, 5, 5, 5, 10),
        ];
        const out = calcMoneyFlowIndex(candles, { length: 2 });
        // index 1 window covers indices 0..1: posFlow[0]=50, posFlow[1]=0, negFlow=0,0.
        // negSum=0 ⇒ 100.
        assert.strictEqual(out[1].value, 100);
        // index 2 window covers 1,2: posSum=0, negSum=0 ⇒ negSum==0 ⇒ 100.
        assert.strictEqual(out[2].value, 100);
    });

    it('insufficient candles → all null until length reached', () => {
        const candles = [mkCandle(0, 1, 1, 1, 1), mkCandle(1, 2, 2, 2, 1)];
        const out = calcMoneyFlowIndex(candles, { length: 5 });
        for (const p of out) assert.strictEqual(p.value, null);
    });

    it('empty input → empty output', () => {
        assert.deepStrictEqual(calcMoneyFlowIndex([], { length: 5 }), []);
    });

    it('preserves candle.time', () => {
        const candles = [mkCandle(0, 1, 1, 1, 1), mkCandle(1, 2, 2, 2, 1)];
        const out = calcMoneyFlowIndex(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });
});
