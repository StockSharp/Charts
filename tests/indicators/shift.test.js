// Shift — first `length` outputs null, rest = close.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcShift } = require('../../src/chart/indicators/calc/shift.js');

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `2025-01-01T00:${String(i).padStart(2, '0')}:00Z`,
        open: c, high: c, low: c, close: c, volume: 0,
    }));
}

describe('calcShift', () => {
    it('empty input → []', () => {
        assert.deepStrictEqual(calcShift([], { length: 2 }), []);
    });

    it('default length=1: first bar null, rest = close', () => {
        const out = calcShift(makeCandles([5, 10, 15, 20]));
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, 10);
        assert.strictEqual(out[2].value, 15);
        assert.strictEqual(out[3].value, 20);
    });

    it('length=3: first 3 bars null, then close', () => {
        const out = calcShift(makeCandles([1, 2, 3, 4, 5]), { length: 3 });
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        assert.strictEqual(out[2].value, null);
        assert.strictEqual(out[3].value, 4);
        assert.strictEqual(out[4].value, 5);
    });

    it('length > input → all null', () => {
        const out = calcShift(makeCandles([1, 2, 3]), { length: 10 });
        for (const p of out) assert.strictEqual(p.value, null);
    });

    it('preserves time', () => {
        const candles = makeCandles([1, 2, 3, 4]);
        const out = calcShift(candles, { length: 1 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });
});
