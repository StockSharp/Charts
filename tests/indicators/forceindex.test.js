// Force Index: EMA of (close - prevClose) * volume.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcForceIndex, calcElderForceIndex } = require('../../src/chart/indicators/calc/forceindex.js');

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcForceIndex', () => {
    it('empty candles → empty array', () => {
        assert.deepStrictEqual(calcForceIndex([], { length: 13 }), []);
    });

    it('length larger than available raw samples → every value null', () => {
        // length=13 needs 14 candles (raw[0] is skipped). Provide only 5.
        const candles = [];
        for (let i = 0; i < 5; i++) {
            candles.push({ time: `t${i}`, open: i, high: i, low: i, close: i, volume: 10 });
        }
        const r = calcForceIndex(candles, { length: 13 });
        assert.strictEqual(r.length, 5);
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('length=2 reference vector: SMA-seed then EMA recurrence', () => {
        // closes=[10,11,12,13,14] volumes=[_,1,1,1,1]
        // raw=[NaN, 1*1=1, 1*1=1, 1*1=1, 1*1=1]
        // length=2 SMA seed over raw[1..2] = (1+1)/2 = 1 at index 2.
        // EMA at i=3: k=2/3, 1*2/3 + 1*1/3 = 1.
        // EMA at i=4: 1.
        const candles = [
            { time: 't0', open: 10, high: 10, low: 10, close: 10, volume: 1 },
            { time: 't1', open: 11, high: 11, low: 11, close: 11, volume: 1 },
            { time: 't2', open: 12, high: 12, low: 12, close: 12, volume: 1 },
            { time: 't3', open: 13, high: 13, low: 13, close: 13, volume: 1 },
            { time: 't4', open: 14, high: 14, low: 14, close: 14, volume: 1 },
        ];
        const r = calcForceIndex(candles, { length: 2 });
        assert.strictEqual(r[0].value, null);
        assert.strictEqual(r[1].value, null);
        approxEq(r[2].value, 1);
        approxEq(r[3].value, 1);
        approxEq(r[4].value, 1);
    });

    it('length=2 with varying raw: EMA reacts to volume*delta jump', () => {
        // closes=[10,11,12,15] volumes=[_,1,1,2]
        // raw=[NaN, 1, 1, 3*2=6]
        // SMA seed at i=2 = (1+1)/2 = 1. EMA[3] = 6*(2/3) + 1*(1/3) = 13/3.
        const candles = [
            { time: 't0', open: 10, high: 10, low: 10, close: 10, volume: 1 },
            { time: 't1', open: 11, high: 11, low: 11, close: 11, volume: 1 },
            { time: 't2', open: 12, high: 12, low: 12, close: 12, volume: 1 },
            { time: 't3', open: 15, high: 15, low: 15, close: 15, volume: 2 },
        ];
        const r = calcForceIndex(candles, { length: 2 });
        approxEq(r[2].value, 1);
        approxEq(r[3].value, 13 / 3);
    });

    it('ElderForceIndex alias produces identical output to ForceIndex', () => {
        const candles = [];
        for (let i = 0; i < 30; i++) {
            candles.push({
                time: `t${i}`,
                open: 10 + i,
                high: 11 + i,
                low: 9 + i,
                close: 10 + i + (i % 3 === 0 ? 0.5 : 0),
                volume: 100 + (i * 7) % 50,
            });
        }
        const a = calcForceIndex(candles, { length: 13 });
        const b = calcElderForceIndex(candles, { length: 13 });
        assert.strictEqual(a.length, b.length);
        for (let i = 0; i < a.length; i++) {
            assert.strictEqual(a[i].time, b[i].time);
            assert.strictEqual(a[i].value, b[i].value);
        }
    });

    it('time field passed through unchanged', () => {
        const candles = [
            { time: 'a', open: 1, high: 1, low: 1, close: 1, volume: 1 },
            { time: 'b', open: 2, high: 2, low: 2, close: 2, volume: 1 },
            { time: 'c', open: 3, high: 3, low: 3, close: 3, volume: 1 },
        ];
        const r = calcForceIndex(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r[i].time, candles[i].time);
        }
    });
});
