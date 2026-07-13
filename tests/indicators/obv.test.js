// On-Balance Volume: cumulative sum semantics and direction rules.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcOBV } = require('../../src/chart/indicators/calc/obv.js');

describe('calcOBV', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcOBV([], {}), []);
    });

    it('single candle → only null (no previous close to compare)', () => {
        const r = calcOBV([{ time: 't0', open: 1, high: 1, low: 1, close: 10, volume: 100 }], {});
        assert.strictEqual(r.length, 1);
        assert.strictEqual(r[0].value, null);
    });

    it('hand-computed five-bar series with up / down / flat transitions', () => {
        // bar 0 c=10 v=100 → null (seed)
        // bar 1 c=11 v=200 → +200    (up)   → OBV = 200
        // bar 2 c=11 v=150 → 0       (flat) → OBV = 200
        // bar 3 c=10 v=50  → -50     (down) → OBV = 150
        // bar 4 c=12 v=300 → +300    (up)   → OBV = 450
        const candles = [
            { time: 't0', open: 10, high: 10, low: 10, close: 10, volume: 100 },
            { time: 't1', open: 11, high: 11, low: 11, close: 11, volume: 200 },
            { time: 't2', open: 11, high: 11, low: 11, close: 11, volume: 150 },
            { time: 't3', open: 10, high: 10, low: 10, close: 10, volume: 50 },
            { time: 't4', open: 12, high: 12, low: 12, close: 12, volume: 300 },
        ];
        const r = calcOBV(candles, {});
        assert.strictEqual(r[0].value, null);
        assert.strictEqual(r[1].value, 200);
        assert.strictEqual(r[2].value, 200);
        assert.strictEqual(r[3].value, 150);
        assert.strictEqual(r[4].value, 450);
    });

    it('NaN volume bar → null and OBV does not advance', () => {
        const candles = [
            { time: 't0', open: 10, high: 10, low: 10, close: 10, volume: 100 },
            { time: 't1', open: 11, high: 11, low: 11, close: 11, volume: 100 }, // +100
            { time: 't2', open: 12, high: 12, low: 12, close: 12, volume: NaN }, // bad
            { time: 't3', open: 13, high: 13, low: 13, close: 13, volume: 50 },  // +50 vs t1's close=11
        ];
        const r = calcOBV(candles, {});
        assert.strictEqual(r[0].value, null);
        assert.strictEqual(r[1].value, 100);
        assert.strictEqual(r[2].value, null);
        assert.strictEqual(r[3].value, 150);
    });

    it('time field passed through unchanged', () => {
        const candles = [
            { time: 'a', open: 1, high: 1, low: 1, close: 1, volume: 1 },
            { time: 'b', open: 2, high: 2, low: 2, close: 2, volume: 2 },
            { time: 'c', open: 3, high: 3, low: 3, close: 3, volume: 3 },
        ];
        const r = calcOBV(candles, {});
        assert.strictEqual(r[0].time, 'a');
        assert.strictEqual(r[1].time, 'b');
        assert.strictEqual(r[2].time, 'c');
    });
});
