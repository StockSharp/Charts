// Bull Power: high − EMA(close, length). Symmetric to BearPower.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcBullPower } = require('../../src/chart/indicators/calc/bullpower.js');

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcBullPower', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcBullPower([], { length: 13 }), []);
    });

    it('length larger than data → every value null', () => {
        const candles = [
            { time: 't0', open: 1, high: 2, low: 0, close: 1, volume: 0 },
            { time: 't1', open: 1, high: 2, low: 0, close: 2, volume: 0 },
        ];
        const r = calcBullPower(candles, { length: 13 });
        assert.strictEqual(r.length, 2);
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('length=2 over closes=[10,11,12,13] highs=[11,12,13,14]: hand-computed EMA seed', () => {
        // EMA seed at i=1 = 10.5, then 11.5, 12.5 (same as BearPower).
        const candles = [
            { time: 't0', open: 10, high: 11, low: 9,  close: 10, volume: 0 },
            { time: 't1', open: 11, high: 12, low: 10, close: 11, volume: 0 },
            { time: 't2', open: 12, high: 13, low: 11, close: 12, volume: 0 },
            { time: 't3', open: 13, high: 14, low: 12, close: 13, volume: 0 },
        ];
        const r = calcBullPower(candles, { length: 2 });
        assert.strictEqual(r[0].value, null);
        approxEq(r[1].value, 12 - 10.5);   // 1.5
        approxEq(r[2].value, 13 - 11.5);   // 1.5
        approxEq(r[3].value, 14 - 12.5);   // 1.5
    });

    it('constant series: high == close → BullPower = high - close = 0 after warm-up', () => {
        const candles = [];
        for (let i = 0; i < 8; i++) {
            candles.push({ time: `t${i}`, open: 5, high: 5, low: 5, close: 5, volume: 0 });
        }
        const r = calcBullPower(candles, { length: 3 });
        for (let i = 0; i < 2; i++) assert.strictEqual(r[i].value, null);
        for (let i = 2; i < 8; i++) approxEq(r[i].value, 0);
    });

    it('time field passed through unchanged', () => {
        const candles = [
            { time: 'a', open: 1, high: 2, low: 0, close: 1, volume: 0 },
            { time: 'b', open: 2, high: 3, low: 1, close: 2, volume: 0 },
            { time: 'c', open: 3, high: 4, low: 2, close: 3, volume: 0 },
        ];
        const r = calcBullPower(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r[i].time, candles[i].time);
        }
    });
});
