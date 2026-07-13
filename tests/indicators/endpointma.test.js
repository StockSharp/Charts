// Endpoint Moving Average: faithful port of the .cs formula
//   firstPoint + ((last - first) / (L-1)) * (L-1)   ==>   == last close.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcEndpointMovingAverage } = require('../../src/chart/indicators/calc/endpointma.js');

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcEndpointMovingAverage', () => {
    it('empty candles → empty array', () => {
        assert.deepStrictEqual(calcEndpointMovingAverage([], { length: 10 }), []);
    });

    it('length larger than data → every value null', () => {
        const candles = [
            { time: 't0', open: 1, high: 1, low: 1, close: 1, volume: 0 },
            { time: 't1', open: 2, high: 2, low: 2, close: 2, volume: 0 },
        ];
        const r = calcEndpointMovingAverage(candles, { length: 10 });
        assert.strictEqual(r.length, 2);
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('length=3 over closes=[10,11,12,13,14]: warm-up at i=2, value == close[i]', () => {
        const closes = [10, 11, 12, 13, 14];
        const candles = closes.map((c, i) => ({
            time: `t${i}`, open: c, high: c, low: c, close: c, volume: 0,
        }));
        const r = calcEndpointMovingAverage(candles, { length: 3 });
        assert.strictEqual(r[0].value, null);
        assert.strictEqual(r[1].value, null);
        approxEq(r[2].value, 12);
        approxEq(r[3].value, 13);
        approxEq(r[4].value, 14);
    });

    it('reference vector with non-linear closes still equals current close', () => {
        // The .cs formula simplifies algebraically to lastPoint, so each
        // output should equal candles[i].close once warm-up is done.
        const closes = [5, 7, 3, 9, 4, 12];
        const candles = closes.map((c, i) => ({
            time: `t${i}`, open: c, high: c, low: c, close: c, volume: 0,
        }));
        const r = calcEndpointMovingAverage(candles, { length: 4 });
        for (let i = 0; i < 3; i++) assert.strictEqual(r[i].value, null);
        for (let i = 3; i < closes.length; i++) approxEq(r[i].value, closes[i]);
    });

    it('length=1 is degenerate (div-by-zero) and yields nulls', () => {
        const candles = [
            { time: 't0', open: 1, high: 1, low: 1, close: 1, volume: 0 },
            { time: 't1', open: 2, high: 2, low: 2, close: 2, volume: 0 },
        ];
        const r = calcEndpointMovingAverage(candles, { length: 1 });
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('time field passed through unchanged', () => {
        const candles = [
            { time: 'a', open: 1, high: 1, low: 1, close: 1, volume: 0 },
            { time: 'b', open: 2, high: 2, low: 2, close: 2, volume: 0 },
            { time: 'c', open: 3, high: 3, low: 3, close: 3, volume: 0 },
        ];
        const r = calcEndpointMovingAverage(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r[i].time, candles[i].time);
        }
    });
});
