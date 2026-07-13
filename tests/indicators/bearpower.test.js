// Bear Power: low − EMA(close, length). Mirrors calcEMA's SMA seed.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcBearPower } = require('../../src/chart/indicators/calc/bearpower.js');

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcBearPower', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcBearPower([], { length: 13 }), []);
    });

    it('length larger than data → every value null', () => {
        const candles = [
            { time: 't0', open: 1, high: 2, low: 0, close: 1, volume: 0 },
            { time: 't1', open: 1, high: 2, low: 0, close: 2, volume: 0 },
        ];
        const r = calcBearPower(candles, { length: 13 });
        assert.strictEqual(r.length, 2);
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('length=2 over closes=[10,11,12,13] lows=[9,10,11,12]: hand-computed EMA seed', () => {
        // EMA seed at i=1 = (10+11)/2 = 10.5
        // i=2: ema = 12 * (2/3) + 10.5 * (1/3) = 8 + 3.5 = 11.5
        // i=3: ema = 13 * (2/3) + 11.5 * (1/3) = 8.6666... + 3.8333... = 12.5
        const candles = [
            { time: 't0', open: 10, high: 11, low: 9,  close: 10, volume: 0 },
            { time: 't1', open: 11, high: 12, low: 10, close: 11, volume: 0 },
            { time: 't2', open: 12, high: 13, low: 11, close: 12, volume: 0 },
            { time: 't3', open: 13, high: 14, low: 12, close: 13, volume: 0 },
        ];
        const r = calcBearPower(candles, { length: 2 });
        assert.strictEqual(r[0].value, null);
        approxEq(r[1].value, 10 - 10.5);   // -0.5
        approxEq(r[2].value, 11 - 11.5);   // -0.5
        approxEq(r[3].value, 12 - 12.5);   // -0.5
    });

    it('constant series: low == close → BearPower = low - close = 0 after warm-up', () => {
        const candles = [];
        for (let i = 0; i < 8; i++) {
            candles.push({ time: `t${i}`, open: 5, high: 5, low: 5, close: 5, volume: 0 });
        }
        const r = calcBearPower(candles, { length: 3 });
        for (let i = 0; i < 2; i++) assert.strictEqual(r[i].value, null);
        for (let i = 2; i < 8; i++) approxEq(r[i].value, 0);
    });

    it('time field passed through unchanged', () => {
        const candles = [
            { time: 'a', open: 1, high: 2, low: 0, close: 1, volume: 0 },
            { time: 'b', open: 2, high: 3, low: 1, close: 2, volume: 0 },
            { time: 'c', open: 3, high: 4, low: 2, close: 3, volume: 0 },
        ];
        const r = calcBearPower(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r[i].time, candles[i].time);
        }
    });
});
