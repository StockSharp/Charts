// TrueRange: max(h-l, |prevClose-h|, |prevClose-l|) for i>=1. The first bar has
// no previous candle, so TrueRange.cs is not formed there — index 0 is null.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcTrueRange } = require('../../src/chart/indicators/calc/truerange.js');

describe('calcTrueRange', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcTrueRange([], {}), []);
    });

    it('first bar → null (not formed, no prev close)', () => {
        const r = calcTrueRange([{ time: 't0', open: 0, high: 105, low: 95, close: 100, volume: 1 }], {});
        assert.strictEqual(r.length, 1);
        assert.strictEqual(r[0].value, null);
    });

    it('subsequent bars take max of three components (bar 0 is null)', () => {
        // bar0: null (no prev close)
        // bar1: h=110 l=102 (prev close=100): a=8, b=|100-110|=10, d=|100-102|=2 → tr=10
        // bar2: h=98  l=90  (prev close=108): a=8, b=|108-98|=10, d=|108-90|=18 → tr=18
        const candles = [
            { time: 't0', open: 100, high: 105, low: 95, close: 100, volume: 1 },
            { time: 't1', open: 105, high: 110, low: 102, close: 108, volume: 1 },
            { time: 't2', open: 100, high: 98, low: 90, close: 92, volume: 1 },
        ];
        const r = calcTrueRange(candles, {});
        assert.strictEqual(r[0].value, null);
        assert.strictEqual(r[1].value, 10);
        assert.strictEqual(r[2].value, 18);
    });

    it('time field passed through', () => {
        const candles = [
            { time: 'a', open: 1, high: 1.1, low: 0.9, close: 1, volume: 1 },
            { time: 'b', open: 1, high: 1.1, low: 0.9, close: 1, volume: 1 },
        ];
        const r = calcTrueRange(candles, {});
        assert.strictEqual(r[0].time, 'a');
        assert.strictEqual(r[1].time, 'b');
    });

    it('bad bar (NaN high) → null but does not break next bar', () => {
        const candles = [
            { time: 't0', open: 1, high: 105, low: 95, close: 100, volume: 1 },
            { time: 't1', open: 1, high: NaN, low: 90, close: 92, volume: 1 },
            { time: 't2', open: 1, high: 105, low: 95, close: 100, volume: 1 },
        ];
        const r = calcTrueRange(candles, {});
        assert.strictEqual(r[0].value, null); // first bar not formed
        assert.strictEqual(r[1].value, null); // NaN high
        // bar2 still uses prev close from bar0 = 100; tr=max(10, |100-105|=5, |100-95|=5)=10
        assert.strictEqual(r[2].value, 10);
    });
});
