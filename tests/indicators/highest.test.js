// Highest: trailing max of close price, no warm-up null gate.
// The C# Highest.cs reads input.ToCandle().HighPrice, but the canonical
// indicator-input is DecimalIndicatorValue (BaseIndicator default), so
// ToCandle() synthesises a candle with HighPrice == ClosePrice. We
// therefore drive the indicator off candle.close.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcHighest } = require('../../src/chart/indicators/calc/highest.js');

function makeCloses(closes) {
    return closes.map((c, i) => ({
        time: `t${i}`, open: c, high: c + 0.5, low: c - 0.5, close: c, volume: 0,
    }));
}

describe('calcHighest', () => {
    it('empty candles → empty array', () => {
        assert.deepStrictEqual(calcHighest([], { length: 5 }), []);
    });

    it('length-too-big (length > candles.length) → each output = max of all closes up to that bar', () => {
        // .cs does NOT gate on IsFormed, so we emit from bar 0.
        // length=100, closes = [1,3,2,5,4]
        const candles = makeCloses([1, 3, 2, 5, 4]);
        const r = calcHighest(candles, { length: 100 });
        assert.strictEqual(r[0].value, 1);
        assert.strictEqual(r[1].value, 3);
        assert.strictEqual(r[2].value, 3);
        assert.strictEqual(r[3].value, 5);
        assert.strictEqual(r[4].value, 5);
    });

    it('reference vector: length=3, sliding max of closes', () => {
        const closes = [1, 3, 2, 5, 4, 1, 2];
        const candles = makeCloses(closes);
        const r = calcHighest(candles, { length: 3 });
        // window [start..i] of size <= 3
        const expected = [
            1,                 // [1]
            3,                 // [1,3]
            3,                 // [1,3,2]
            5,                 // [3,2,5]
            5,                 // [2,5,4]
            5,                 // [5,4,1]
            4,                 // [4,1,2]
        ];
        for (let i = 0; i < closes.length; i++) {
            assert.strictEqual(r[i].value, expected[i]);
        }
    });

    it('length=1 → output equals the bar close itself', () => {
        const closes = [10, 20, 5, 15];
        const candles = makeCloses(closes);
        const r = calcHighest(candles, { length: 1 });
        for (let i = 0; i < closes.length; i++) {
            assert.strictEqual(r[i].value, closes[i]);
        }
    });

    it('time field passed through unchanged', () => {
        const candles = makeCloses([1, 2, 3, 4]);
        const r = calcHighest(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r[i].time, candles[i].time);
        }
    });
});
