// Historical Volatility Ratio: σ_short(close) / σ_long(close), population stddev.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcHistoricalVolatilityRatio } = require('../../src/chart/indicators/calc/hvr.js');

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `t${i}`, open: c, high: c, low: c, close: c, volume: 0,
    }));
}

function popStdRef(arr) {
    const n = arr.length;
    const mean = arr.reduce((s, v) => s + v, 0) / n;
    let acc = 0;
    for (const v of arr) { const d = v - mean; acc += d * d; }
    return Math.sqrt(acc / n);
}

describe('calcHistoricalVolatilityRatio', () => {
    it('empty candles → empty array', () => {
        assert.deepStrictEqual(calcHistoricalVolatilityRatio([], {}), []);
    });

    it('warm-up: outputs null until max(short, long) - 1', () => {
        // Default short=5 long=20: needs at least 20 bars before first value.
        const candles = makeCandles(Array.from({ length: 19 }, (_, i) => i + 1));
        const r = calcHistoricalVolatilityRatio(candles, {});
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('flat closes → long stddev is 0 → output is 0 (no NaN)', () => {
        const candles = makeCandles(Array(30).fill(100));
        const r = calcHistoricalVolatilityRatio(candles, { shortPeriod: 5, longPeriod: 20 });
        for (let i = 19; i < 30; i++) {
            approxEq(r[i].value, 0);
        }
    });

    it('hand-computed reference: short=2 long=3 on [1,2,3,4,5]', () => {
        const candles = makeCandles([1, 2, 3, 4, 5]);
        const r = calcHistoricalVolatilityRatio(candles, { shortPeriod: 2, longPeriod: 3 });
        // bars 0..1 null (long not formed)
        assert.strictEqual(r[0].value, null);
        assert.strictEqual(r[1].value, null);
        // bar 2 (i=2): short over [2,3] = popStd([2,3]); long over [1,2,3] = popStd([1,2,3]).
        approxEq(r[2].value, popStdRef([2, 3]) / popStdRef([1, 2, 3]));
        approxEq(r[3].value, popStdRef([3, 4]) / popStdRef([2, 3, 4]));
        approxEq(r[4].value, popStdRef([4, 5]) / popStdRef([3, 4, 5]));
    });

    it('output length matches input length and timestamps pass through', () => {
        const candles = makeCandles(Array.from({ length: 25 }, (_, i) => i * 1.5));
        const r = calcHistoricalVolatilityRatio(candles, { shortPeriod: 5, longPeriod: 20 });
        assert.strictEqual(r.length, 25);
        for (let i = 0; i < 25; i++) assert.strictEqual(r[i].time, candles[i].time);
    });

    it('non-finite close in window → null at that slot', () => {
        const closes = [1, 2, 3, NaN, 5, 6, 7, 8, 9, 10];
        const candles = makeCandles(closes);
        const r = calcHistoricalVolatilityRatio(candles, { shortPeriod: 2, longPeriod: 3 });
        // Any window containing index 3 (NaN) should be null. Index 4: short=[NaN,5] long=[3,NaN,5] both bad.
        assert.strictEqual(r[3].value, null);
        assert.strictEqual(r[4].value, null);
        // Index 6: short=[6,7] long=[5,6,7] → fine.
        approxEq(r[6].value, popStdRef([6, 7]) / popStdRef([5, 6, 7]));
    });
});
