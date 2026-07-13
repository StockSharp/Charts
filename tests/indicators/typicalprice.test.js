// TypicalPrice: (high+low+close)/3 per bar.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcTypicalPrice } = require('../../src/chart/indicators/calc/typicalprice.js');

describe('calcTypicalPrice', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcTypicalPrice([], {}), []);
    });

    it('hand-computed', () => {
        const candles = [
            { time: 't0', open: 0, high: 105, low: 95, close: 100, volume: 1 },
            { time: 't1', open: 0, high: 60,  low: 30, close: 45,  volume: 1 },
        ];
        const r = calcTypicalPrice(candles, {});
        assert.strictEqual(r[0].value, 100);  // (105+95+100)/3
        assert.strictEqual(r[1].value, 45);   // (60+30+45)/3
    });

    it('flat candle → equals the constant', () => {
        const r = calcTypicalPrice([{ time: 't', open: 50, high: 50, low: 50, close: 50, volume: 1 }], {});
        assert.strictEqual(r[0].value, 50);
    });

    it('bad bar (NaN low) → null for that slot only', () => {
        const candles = [
            { time: 't0', open: 1, high: 105, low: 95, close: 100, volume: 1 },
            { time: 't1', open: 1, high: 60,  low: NaN, close: 50,  volume: 1 },
            { time: 't2', open: 1, high: 9,   low: 3,   close: 6,   volume: 1 },
        ];
        const r = calcTypicalPrice(candles, {});
        assert.strictEqual(r[0].value, 100);
        assert.strictEqual(r[1].value, null);
        assert.strictEqual(r[2].value, 6);
    });

    it('time field passed through', () => {
        const r = calcTypicalPrice([{ time: 'abc', open: 1, high: 1, low: 1, close: 1, volume: 1 }], {});
        assert.strictEqual(r[0].time, 'abc');
    });

    it('output length equals input length', () => {
        const candles = [];
        for (let i = 0; i < 7; i++) candles.push({ time: `t${i}`, open: i, high: i+2, low: i, close: i+1, volume: 1 });
        const r = calcTypicalPrice(candles, {});
        assert.strictEqual(r.length, 7);
    });
});
