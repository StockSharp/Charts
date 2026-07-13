// Bollinger Bands: shape integrity (three same-length series), warm-up
// nulls, and hand-computed σ for a tiny series.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcBollingerBands } = require('../../src/chart/indicators/calc/bb.js');

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `2025-01-01T00:${String(i).padStart(2, '0')}:00Z`,
        open: c,
        high: c,
        low: c,
        close: c,
        volume: 0,
    }));
}

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcBollingerBands', () => {
    it('empty candles → {upper:[], middle:[], lower:[]}', () => {
        const r = calcBollingerBands([], { length: 20, stdDev: 2 });
        assert.deepStrictEqual(r, { upper: [], middle: [], lower: [] });
    });

    it('length larger than candle count → every value null on all three series', () => {
        const r = calcBollingerBands(makeCandles([1, 2, 3]), { length: 10, stdDev: 2 });
        assert.strictEqual(r.upper.length, 3);
        assert.strictEqual(r.middle.length, 3);
        assert.strictEqual(r.lower.length, 3);
        for (let i = 0; i < 3; i++) {
            assert.strictEqual(r.upper[i].value, null);
            assert.strictEqual(r.middle[i].value, null);
            assert.strictEqual(r.lower[i].value, null);
        }
    });

    it('all three sub-series have the same length as candles[]', () => {
        const candles = makeCandles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        const r = calcBollingerBands(candles, { length: 4, stdDev: 2 });
        assert.strictEqual(r.upper.length, candles.length);
        assert.strictEqual(r.middle.length, candles.length);
        assert.strictEqual(r.lower.length, candles.length);
    });

    it('length=3, stdDev=2 on [2,4,6,8]: middle=SMA, σ=population stdev', () => {
        const r = calcBollingerBands(makeCandles([2, 4, 6, 8]), { length: 3, stdDev: 2 });
        // i=0,1: null
        assert.strictEqual(r.middle[0].value, null);
        assert.strictEqual(r.middle[1].value, null);
        // i=2: window [2,4,6], mean=4, sumSq=4+0+4=8, var=8/3, σ=√(8/3)
        assert.strictEqual(r.middle[2].value, 4);
        const sigma2 = Math.sqrt(8 / 3);
        approxEq(r.upper[2].value, 4 + 2 * sigma2);
        approxEq(r.lower[2].value, 4 - 2 * sigma2);
        // i=3: window [4,6,8], mean=6, σ=√(8/3) again
        assert.strictEqual(r.middle[3].value, 6);
        approxEq(r.upper[3].value, 6 + 2 * sigma2);
        approxEq(r.lower[3].value, 6 - 2 * sigma2);
    });

    it('default params (length=20, stdDev=2) when params omitted', () => {
        // Only the last point should be non-null for 20 candles.
        const closes = [];
        for (let i = 1; i <= 20; i++) closes.push(i);
        const r = calcBollingerBands(makeCandles(closes));
        for (let i = 0; i < 19; i++) {
            assert.strictEqual(r.middle[i].value, null);
            assert.strictEqual(r.upper[i].value, null);
            assert.strictEqual(r.lower[i].value, null);
        }
        // Mean of 1..20 = 10.5
        assert.strictEqual(r.middle[19].value, 10.5);
    });

    it('time field passed through unchanged on all three series', () => {
        const candles = makeCandles([1, 2, 3, 4, 5]);
        const r = calcBollingerBands(candles, { length: 3, stdDev: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r.upper[i].time, candles[i].time);
            assert.strictEqual(r.middle[i].time, candles[i].time);
            assert.strictEqual(r.lower[i].time, candles[i].time);
        }
    });
});
