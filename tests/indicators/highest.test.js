// Highest: trailing max of the candle HIGH over `length` bars (StockSharp
// Highest.cs reads input.ToCandle().HighPrice). DecimalLengthIndicator, so it
// is not formed — and emits nothing — before index length-1.

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

    it('length-too-big (length > candles.length) → never formed → all null', () => {
        const candles = makeCloses([1, 3, 2, 5, 4]);
        const r = calcHighest(candles, { length: 100 });
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('reference vector: length=3, sliding max of HIGHS (highs = close + 0.5)', () => {
        const closes = [1, 3, 2, 5, 4, 1, 2];
        const candles = makeCloses(closes);
        const r = calcHighest(candles, { length: 3 });
        // highs = [1.5,3.5,2.5,5.5,4.5,1.5,2.5]; warm-up (index 0,1) is null.
        const expected = [null, null, 3.5, 5.5, 5.5, 5.5, 4.5];
        for (let i = 0; i < closes.length; i++) {
            assert.strictEqual(r[i].value, expected[i]);
        }
    });

    it('length=1 → output equals the bar HIGH itself', () => {
        const closes = [10, 20, 5, 15];
        const candles = makeCloses(closes);
        const r = calcHighest(candles, { length: 1 });
        for (let i = 0; i < closes.length; i++) {
            assert.strictEqual(r[i].value, closes[i] + 0.5);
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
