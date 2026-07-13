// Elder Ray: bull = high - EMA(close, length), bear = low - EMA(close, length).

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcElderRay } = require('../../src/chart/indicators/calc/elderray.js');

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcElderRay', () => {
    it('empty candles → empty bull/bear arrays', () => {
        assert.deepStrictEqual(calcElderRay([], { length: 13 }), { bull: [], bear: [] });
    });

    it('length larger than data → every value null on both lines', () => {
        const candles = [
            { time: 't0', open: 1, high: 2, low: 0, close: 1, volume: 0 },
            { time: 't1', open: 1, high: 2, low: 0, close: 2, volume: 0 },
        ];
        const r = calcElderRay(candles, { length: 13 });
        assert.strictEqual(r.bull.length, 2);
        assert.strictEqual(r.bear.length, 2);
        for (let i = 0; i < 2; i++) {
            assert.strictEqual(r.bull[i].value, null);
            assert.strictEqual(r.bear[i].value, null);
        }
    });

    it('length=2, hand-computed reference vector', () => {
        // EMA seed at i=1 = mean(close[0..1]) = 10.5, then 11.5, 12.5.
        const candles = [
            { time: 't0', open: 10, high: 11, low: 9,  close: 10, volume: 0 },
            { time: 't1', open: 11, high: 12, low: 10, close: 11, volume: 0 },
            { time: 't2', open: 12, high: 13, low: 11, close: 12, volume: 0 },
            { time: 't3', open: 13, high: 14, low: 12, close: 13, volume: 0 },
        ];
        const r = calcElderRay(candles, { length: 2 });
        assert.strictEqual(r.bull[0].value, null);
        assert.strictEqual(r.bear[0].value, null);
        approxEq(r.bull[1].value, 12 - 10.5);
        approxEq(r.bear[1].value, 10 - 10.5);
        approxEq(r.bull[2].value, 13 - 11.5);
        approxEq(r.bear[2].value, 11 - 11.5);
        approxEq(r.bull[3].value, 14 - 12.5);
        approxEq(r.bear[3].value, 12 - 12.5);
    });

    it('shape: bull and bear arrays match candles length and share timestamps', () => {
        const candles = [];
        for (let i = 0; i < 20; i++) {
            candles.push({ time: `t${i}`, open: i, high: i + 1, low: i - 1, close: i, volume: 0 });
        }
        const r = calcElderRay(candles, { length: 5 });
        assert.strictEqual(r.bull.length, candles.length);
        assert.strictEqual(r.bear.length, candles.length);
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r.bull[i].time, candles[i].time);
            assert.strictEqual(r.bear[i].time, candles[i].time);
            // Both sub-series should warm up at the same index.
            assert.strictEqual(r.bull[i].value === null, r.bear[i].value === null);
        }
    });
});
