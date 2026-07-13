// Adaptive Price Zone — EMA centre with ±k*sigma bands.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcAdaptivePriceZone } = require('../../src/chart/indicators/calc/apz.js');

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `t${i}`, open: c, high: c, low: c, close: c, volume: 0,
    }));
}

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcAdaptivePriceZone', () => {
    it('empty candles → empty triple', () => {
        assert.deepStrictEqual(calcAdaptivePriceZone([], { period: 5 }),
                               { ma: [], upper: [], lower: [] });
    });

    it('period larger than candles → all-null on all three lines', () => {
        const candles = makeCandles([1, 2, 3]);
        const r = calcAdaptivePriceZone(candles, { period: 5 });
        for (let i = 0; i < 3; i++) {
            assert.strictEqual(r.ma[i].value, null);
            assert.strictEqual(r.upper[i].value, null);
            assert.strictEqual(r.lower[i].value, null);
        }
    });

    it('shape consistency: all three lines have same length and times', () => {
        const candles = makeCandles([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
        const r = calcAdaptivePriceZone(candles, { period: 3, bandPercentage: 2 });
        assert.strictEqual(r.ma.length, candles.length);
        assert.strictEqual(r.upper.length, candles.length);
        assert.strictEqual(r.lower.length, candles.length);
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r.ma[i].time, candles[i].time);
            assert.strictEqual(r.upper[i].time, candles[i].time);
            assert.strictEqual(r.lower[i].time, candles[i].time);
        }
    });

    it('constant series → sigma = 0, all three lines equal to the constant', () => {
        // Population stddev of [c,c,c,...] is 0. upper=lower=ma=c.
        const candles = makeCandles([7, 7, 7, 7, 7, 7, 7, 7]);
        const r = calcAdaptivePriceZone(candles, { period: 3, bandPercentage: 2 });
        for (let i = 2; i < 8; i++) {
            approxEq(r.ma[i].value, 7);
            approxEq(r.upper[i].value, 7);
            approxEq(r.lower[i].value, 7);
        }
    });

    it('upper > ma > lower whenever sigma > 0', () => {
        // Use a series with non-constant closes so sigma > 0.
        const candles = makeCandles([10, 11, 9, 12, 8, 13, 7, 14, 6, 15]);
        const r = calcAdaptivePriceZone(candles, { period: 3, bandPercentage: 2 });
        for (let i = 2; i < candles.length; i++) {
            const m = r.ma[i].value, u = r.upper[i].value, l = r.lower[i].value;
            if (m === null) continue;
            assert.ok(u > m, `bar ${i}: upper ${u} should be > ma ${m}`);
            assert.ok(l < m, `bar ${i}: lower ${l} should be < ma ${m}`);
            // Symmetry: ma is midpoint of upper/lower.
            approxEq((u + l) / 2, m, 1e-12);
        }
    });

    it('warm-up: bars 0..period-2 are null on all lines, period-1 is formed', () => {
        const candles = makeCandles([1, 2, 3, 4, 5, 6, 7]);
        const r = calcAdaptivePriceZone(candles, { period: 4 });
        for (let i = 0; i < 3; i++) {
            assert.strictEqual(r.ma[i].value, null);
            assert.strictEqual(r.upper[i].value, null);
            assert.strictEqual(r.lower[i].value, null);
        }
        assert.notStrictEqual(r.ma[3].value, null);
        assert.notStrictEqual(r.upper[3].value, null);
        assert.notStrictEqual(r.lower[3].value, null);
    });
});
