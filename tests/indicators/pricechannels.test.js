// PriceChannels: Donchian-style rolling max(high), min(low).

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcPriceChannels } = require('../../src/chart/indicators/calc/pricechannels.js');

function mk(h, l, i) {
    return { time: `t${i}`, open: (h+l)/2, high: h, low: l, close: (h+l)/2, volume: 1 };
}

describe('calcPriceChannels', () => {
    it('empty candles → both series empty', () => {
        assert.deepStrictEqual(calcPriceChannels([], {}), { upper: [], lower: [] });
    });

    it('first (length-1) bars are null on both series', () => {
        const candles = [];
        for (let i = 0; i < 10; i++) candles.push(mk(100 + i, 90 + i, i));
        const r = calcPriceChannels(candles, { length: 5 });
        for (let i = 0; i < 4; i++) {
            assert.strictEqual(r.upper[i].value, null);
            assert.strictEqual(r.lower[i].value, null);
        }
        assert.notStrictEqual(r.upper[4].value, null);
        assert.notStrictEqual(r.lower[4].value, null);
    });

    it('hand-computed rolling max/min over length=3', () => {
        // highs: 10 12 11 15 14
        // lows:   5  6  7  4  9
        const candles = [
            mk(10, 5, 0),
            mk(12, 6, 1),
            mk(11, 7, 2),
            mk(15, 4, 3),
            mk(14, 9, 4),
        ];
        const r = calcPriceChannels(candles, { length: 3 });
        // i=2: max(10,12,11)=12, min(5,6,7)=5
        assert.strictEqual(r.upper[2].value, 12);
        assert.strictEqual(r.lower[2].value, 5);
        // i=3: max(12,11,15)=15, min(6,7,4)=4
        assert.strictEqual(r.upper[3].value, 15);
        assert.strictEqual(r.lower[3].value, 4);
        // i=4: max(11,15,14)=15, min(7,4,9)=4
        assert.strictEqual(r.upper[4].value, 15);
        assert.strictEqual(r.lower[4].value, 4);
    });

    it('series have same length as input', () => {
        const candles = [];
        for (let i = 0; i < 7; i++) candles.push(mk(10+i, 5+i, i));
        const r = calcPriceChannels(candles, { length: 3 });
        assert.strictEqual(r.upper.length, 7);
        assert.strictEqual(r.lower.length, 7);
    });

    it('time field passed through', () => {
        const candles = [];
        for (let i = 0; i < 4; i++) candles.push(mk(10+i, 5+i, i));
        const r = calcPriceChannels(candles, { length: 3 });
        for (let i = 0; i < 4; i++) {
            assert.strictEqual(r.upper[i].time, candles[i].time);
            assert.strictEqual(r.lower[i].time, candles[i].time);
        }
    });
});
