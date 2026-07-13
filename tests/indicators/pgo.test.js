// PrettyGoodOscillator: (close - SMA) / (highest - lowest) * 100.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcPrettyGoodOscillator } = require('../../src/chart/indicators/calc/pgo.js');

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

function mk(h, l, c, i) {
    return { time: `t${i}`, open: (h + l) / 2, high: h, low: l, close: c, volume: 1 };
}

describe('calcPrettyGoodOscillator', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcPrettyGoodOscillator([], {}), []);
    });

    it('warm-up: first length-1 values null', () => {
        const candles = [];
        for (let i = 0; i < 10; i++) candles.push(mk(2 + i * 0.1, 1, 1.5 + i * 0.05, i));
        const r = calcPrettyGoodOscillator(candles, { length: 5 });
        for (let i = 0; i < 4; i++) assert.strictEqual(r[i].value, null);
        assert.notStrictEqual(r[4].value, null);
    });

    it('flat range (high==low across window) → null (diff==0)', () => {
        const candles = [];
        for (let i = 0; i < 10; i++) candles.push(mk(5, 5, 5, i));
        const r = calcPrettyGoodOscillator(candles, { length: 5 });
        for (let i = 4; i < 10; i++) assert.strictEqual(r[i].value, null);
    });

    it('hand-computed value with length=3 on a simple ramp', () => {
        // closes (also highs and lows offset by ±1): 10, 11, 12, 13, 14
        // At i=2 (first valid bar with length=3):
        //   sma  = (10+11+12)/3 = 11
        //   high(of-3) = max(11, 12, 13) = 13   (high = close+1)
        //   low(of-3)  = min(9, 10, 11) = 9     (low  = close-1)
        //   diff = 4
        //   close = 12
        //   PGO = (12 - 11) / 4 * 100 = 25
        const candles = [];
        for (let i = 0; i < 5; i++) candles.push(mk(10 + i + 1, 10 + i - 1, 10 + i, i));
        const r = calcPrettyGoodOscillator(candles, { length: 3 });
        approxEq(r[2].value, 25);
        // i=3: sma=(11+12+13)/3=12; hi=14, lo=10, diff=4; close=13;
        //      PGO=(13-12)/4*100=25
        approxEq(r[3].value, 25);
    });

    it('non-positive length → all null', () => {
        const candles = [];
        for (let i = 0; i < 5; i++) candles.push(mk(2, 1, 1.5, i));
        const a = calcPrettyGoodOscillator(candles, { length: 0 });
        for (const p of a) assert.strictEqual(p.value, null);
        const b = calcPrettyGoodOscillator(candles, { length: -3 });
        for (const p of b) assert.strictEqual(p.value, null);
    });

    it('time field passed through unchanged; output length matches input', () => {
        const candles = [];
        for (let i = 0; i < 8; i++) candles.push(mk(2 + i * 0.1, 1, 1.5, i));
        const r = calcPrettyGoodOscillator(candles, { length: 3 });
        assert.strictEqual(r.length, 8);
        for (let i = 0; i < 8; i++) assert.strictEqual(r[i].time, candles[i].time);
    });
});
