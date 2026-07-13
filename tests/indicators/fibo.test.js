// Fibonacci Retracement: 5 levels = lo + (hi - lo) * [0.236, 0.382, 0.5, 0.618, 0.786].

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcFibonacciRetracement, FIBO_LEVELS, FIBO_KEYS } = require('../../src/chart/indicators/calc/fibo.js');

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcFibonacciRetracement', () => {
    it('empty candles → empty arrays for every level', () => {
        const r = calcFibonacciRetracement([], { length: 20 });
        assert.deepStrictEqual(r.levels, FIBO_LEVELS);
        for (const k of FIBO_KEYS) {
            assert.ok(Array.isArray(r[k]));
            assert.strictEqual(r[k].length, 0);
        }
    });

    it('length larger than data → every value null on every level', () => {
        const candles = [
            { time: 't0', open: 1, high: 2, low: 0, close: 1, volume: 0 },
            { time: 't1', open: 1, high: 3, low: 1, close: 2, volume: 0 },
        ];
        const r = calcFibonacciRetracement(candles, { length: 20 });
        for (const k of FIBO_KEYS) {
            assert.strictEqual(r[k].length, 2);
            for (const p of r[k]) assert.strictEqual(p.value, null);
        }
    });

    it('shape: all five sub-series share the same length and timestamps as candles[]', () => {
        const candles = [];
        for (let i = 0; i < 30; i++) {
            candles.push({ time: `t${i}`, open: i, high: i + 1, low: i - 1, close: i, volume: 0 });
        }
        const r = calcFibonacciRetracement(candles, { length: 5 });
        for (const k of FIBO_KEYS) {
            assert.strictEqual(r[k].length, candles.length);
            for (let i = 0; i < candles.length; i++) {
                assert.strictEqual(r[k][i].time, candles[i].time);
            }
            // Sub-series should warm up at the same index.
            for (let i = 0; i < candles.length; i++) {
                const ref = r[FIBO_KEYS[0]][i].value;
                assert.strictEqual((r[k][i].value === null), (ref === null));
            }
        }
    });

    it('hand-computed levels: hi=10, lo=0 over length=3 window', () => {
        // length=3, highs=[10,5,8], lows=[3,0,4] → hi=10, lo=0 at i=2.
        const candles = [
            { time: 't0', open: 5, high: 10, low: 3, close: 7, volume: 0 },
            { time: 't1', open: 4, high: 5,  low: 0, close: 3, volume: 0 },
            { time: 't2', open: 6, high: 8,  low: 4, close: 7, volume: 0 },
        ];
        const r = calcFibonacciRetracement(candles, { length: 3 });
        // First two bars: nulls (window not yet full).
        for (const k of FIBO_KEYS) {
            assert.strictEqual(r[k][0].value, null);
            assert.strictEqual(r[k][1].value, null);
        }
        // At i=2: range = 10. Levels = 0 + 10 * ratio.
        approxEq(r.l236[2].value, 2.36);
        approxEq(r.l382[2].value, 3.82);
        approxEq(r.l500[2].value, 5);
        approxEq(r.l618[2].value, 6.18);
        approxEq(r.l786[2].value, 7.86);
    });

    it('flat market (high==low everywhere): all levels collapse to the same price', () => {
        const candles = [];
        for (let i = 0; i < 10; i++) {
            candles.push({ time: `t${i}`, open: 5, high: 5, low: 5, close: 5, volume: 0 });
        }
        const r = calcFibonacciRetracement(candles, { length: 5 });
        for (let i = 4; i < 10; i++) {
            for (const k of FIBO_KEYS) {
                approxEq(r[k][i].value, 5);
            }
        }
    });
});
