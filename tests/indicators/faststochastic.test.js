// Fast Stochastic Oscillator: raw %K = 100*(close - LL)/(HH - LL),
// %D = SMA(%K, dPeriod). Distinct from calc/stochastic.js by the absence
// of the `smooth` parameter (no slowing of %K).

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcFastStochastic } = require('../../src/chart/indicators/calc/faststochastic.js');

function makeCandles(hlc) {
    return hlc.map((row, i) => ({
        time: `t${i}`, open: row[2], high: row[0], low: row[1], close: row[2], volume: 0,
    }));
}

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcFastStochastic', () => {
    it('empty candles → {k:[], d:[]}', () => {
        assert.deepStrictEqual(calcFastStochastic([], { kPeriod: 14, dPeriod: 3 }),
                               { k: [], d: [] });
    });

    it('kPeriod larger than candle count → every value null on both series', () => {
        const candles = makeCandles([[2, 1, 1.5], [3, 2, 2.5], [4, 3, 3.5]]);
        const r = calcFastStochastic(candles, { kPeriod: 10, dPeriod: 3 });
        for (let i = 0; i < 3; i++) {
            assert.strictEqual(r.k[i].value, null);
            assert.strictEqual(r.d[i].value, null);
        }
    });

    it('output length matches candles[] and time is passed through', () => {
        const candles = makeCandles([
            [2, 1, 1.5], [3, 2, 2.5], [4, 3, 3.5], [5, 4, 4.5], [6, 5, 5.5],
        ]);
        const r = calcFastStochastic(candles, { kPeriod: 3, dPeriod: 2 });
        assert.strictEqual(r.k.length, candles.length);
        assert.strictEqual(r.d.length, candles.length);
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r.k[i].time, candles[i].time);
            assert.strictEqual(r.d[i].time, candles[i].time);
        }
    });

    it('kPeriod=3, dPeriod=2 on a rising trend matches hand math', () => {
        const candles = makeCandles([
            [2, 1, 1.5],
            [3, 2, 2.5],
            [4, 3, 3.5], // i=2: lo=1, hi=4, close=3.5 → fastK=250/3
            [5, 4, 4.5], // i=3: lo=2, hi=5, close=4.5 → fastK=250/3
            [6, 5, 5.5], // i=4: lo=3, hi=6, close=5.5 → fastK=250/3
        ]);
        const r = calcFastStochastic(candles, { kPeriod: 3, dPeriod: 2 });
        assert.strictEqual(r.k[0].value, null);
        assert.strictEqual(r.k[1].value, null);
        approxEq(r.k[2].value, 250 / 3);
        approxEq(r.k[3].value, 250 / 3);
        approxEq(r.k[4].value, 250 / 3);
        // %D = SMA(%K, 2) — first valid at i=3.
        assert.strictEqual(r.d[2].value, null);
        approxEq(r.d[3].value, 250 / 3);
        approxEq(r.d[4].value, 250 / 3);
    });

    it('flat high==low window emits %K = 0 (StochasticK.cs range-zero fallback)', () => {
        // .cs returns 0 for diff==0, NOT 100 like stochastic.js does.
        const candles = makeCandles([
            [5, 5, 5], [5, 5, 5], [5, 5, 5],
        ]);
        const r = calcFastStochastic(candles, { kPeriod: 3, dPeriod: 1 });
        assert.strictEqual(r.k[2].value, 0);
    });

    it('close at top of range → %K = 100; close at bottom → %K = 0', () => {
        const candles = makeCandles([
            [10, 5, 7], [11, 6, 8], [12, 5, 12],   // i=2: lo=5, hi=12, close=12 → K=100
            [13, 5, 5],                              // i=3: lo=5, hi=13, close=5  → K=0
        ]);
        const r = calcFastStochastic(candles, { kPeriod: 3, dPeriod: 1 });
        approxEq(r.k[2].value, 100);
        approxEq(r.k[3].value, 0);
    });
});
