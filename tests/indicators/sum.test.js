// Sum — rolling sum of last N closes.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcSum } = require('../../src/chart/indicators/calc/sum.js');

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `2025-01-01T00:${String(i).padStart(2, '0')}:00Z`,
        open: c, high: c, low: c, close: c, volume: 0,
    }));
}

describe('calcSum', () => {
    it('empty input → []', () => {
        assert.deepStrictEqual(calcSum([], { length: 3 }), []);
    });

    it('length=3 over [1..5] → null,null,6,9,12', () => {
        const out = calcSum(makeCandles([1, 2, 3, 4, 5]), { length: 3 });
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        assert.strictEqual(out[2].value, 6);
        assert.strictEqual(out[3].value, 9);
        assert.strictEqual(out[4].value, 12);
    });

    it('length > input → all null', () => {
        const out = calcSum(makeCandles([1, 2, 3]), { length: 10 });
        for (const p of out) assert.strictEqual(p.value, null);
    });

    it('default length=15 — 14 candles → all null', () => {
        const closes = [];
        for (let i = 0; i < 14; i++) closes.push(1);
        const out = calcSum(makeCandles(closes));
        for (const p of out) assert.strictEqual(p.value, null);
    });

    it('default length=15 — 15 candles of 1 → last point = 15', () => {
        const closes = [];
        for (let i = 0; i < 15; i++) closes.push(1);
        const out = calcSum(makeCandles(closes));
        assert.strictEqual(out[14].value, 15);
    });

    it('preserves time', () => {
        const candles = makeCandles([1, 2, 3]);
        const out = calcSum(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });
});
