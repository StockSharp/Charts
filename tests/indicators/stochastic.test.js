// Stochastic Oscillator: shape, warm-up cascade, hand-computed %K/%D.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcStochastic } = require('../../src/chart/indicators/calc/stochastic.js');

function makeCandles(hlc) {
    return hlc.map((row, i) => ({
        time: `2025-01-01T00:${String(i).padStart(2, '0')}:00Z`,
        open: row[2],
        high: row[0],
        low: row[1],
        close: row[2],
        volume: 0,
    }));
}

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcStochastic', () => {
    it('empty candles → {k:[], d:[]}', () => {
        assert.deepStrictEqual(calcStochastic([], { kPeriod: 14, dPeriod: 3, smooth: 3 }), { k: [], d: [] });
    });

    it('kPeriod larger than candle count → every value null on both series', () => {
        const candles = makeCandles([[2, 1, 1.5], [3, 2, 2.5], [4, 3, 3.5]]);
        const r = calcStochastic(candles, { kPeriod: 10, dPeriod: 3, smooth: 1 });
        assert.strictEqual(r.k.length, 3);
        assert.strictEqual(r.d.length, 3);
        for (let i = 0; i < 3; i++) {
            assert.strictEqual(r.k[i].value, null);
            assert.strictEqual(r.d[i].value, null);
        }
    });

    it('both sub-series have the same length as candles[]', () => {
        const candles = makeCandles([
            [2, 1, 1.5], [3, 2, 2.5], [4, 3, 3.5], [5, 4, 4.5], [6, 5, 5.5], [7, 6, 6.5], [8, 7, 7.5],
        ]);
        const r = calcStochastic(candles, { kPeriod: 3, dPeriod: 2, smooth: 1 });
        assert.strictEqual(r.k.length, candles.length);
        assert.strictEqual(r.d.length, candles.length);
    });

    it('kPeriod=3, smooth=1, dPeriod=2 on a rising trend matches hand math', () => {
        const candles = makeCandles([
            [2, 1, 1.5],
            [3, 2, 2.5],
            [4, 3, 3.5], // i=2: lo=1, hi=4, close=3.5 → fastK=250/3
            [5, 4, 4.5], // i=3: lo=2, hi=5, close=4.5 → fastK=250/3
            [6, 5, 5.5], // i=4: lo=3, hi=6, close=5.5 → fastK=250/3
        ]);
        const r = calcStochastic(candles, { kPeriod: 3, dPeriod: 2, smooth: 1 });
        assert.strictEqual(r.k[0].value, null);
        assert.strictEqual(r.k[1].value, null);
        approxEq(r.k[2].value, 250 / 3);
        approxEq(r.k[3].value, 250 / 3);
        approxEq(r.k[4].value, 250 / 3);
        // %D = SMA(%K, 2): null until two %K values available (i=3 onwards).
        assert.strictEqual(r.d[0].value, null);
        assert.strictEqual(r.d[1].value, null);
        assert.strictEqual(r.d[2].value, null);
        approxEq(r.d[3].value, 250 / 3);
        approxEq(r.d[4].value, 250 / 3);
    });

    it('flat high==low window emits %K=0 (StochasticK.cs range-zero)', () => {
        const candles = makeCandles([
            [5, 5, 5], [5, 5, 5], [5, 5, 5],
        ]);
        const r = calcStochastic(candles, { kPeriod: 3, dPeriod: 1, smooth: 1 });
        assert.strictEqual(r.k[2].value, 0);
    });

    it('time field passed through unchanged on both series', () => {
        const candles = makeCandles([
            [2, 1, 1.5], [3, 2, 2.5], [4, 3, 3.5], [5, 4, 4.5], [6, 5, 5.5],
        ]);
        const r = calcStochastic(candles, { kPeriod: 3, dPeriod: 2, smooth: 1 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r.k[i].time, candles[i].time);
            assert.strictEqual(r.d[i].time, candles[i].time);
        }
    });
});
