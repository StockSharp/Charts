// Adaptive Laguerre Filter (ALF) — 4-stage Laguerre cascade.
// StockSharp flips IsFormed on the first bar where the filtered value >= price
// (i.e. when the lagging filter first catches up to / crosses the price), and
// reports the earlier bars as not-formed (null). On a purely rising or constant
// series the lagging filter never reaches the price, so the indicator never
// forms and every output is null.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcAdaptiveLaguerreFilter } = require('../../src/chart/indicators/calc/alf.js');

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

describe('calcAdaptiveLaguerreFilter', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcAdaptiveLaguerreFilter([], { gamma: 0.8 }), []);
    });

    it('gamma outside (0,1) → all-nulls (fail closed instead of throw)', () => {
        const candles = makeCandles([1, 2, 3, 4, 5]);
        for (const g of [0, 1, -0.1, 1.1]) {
            const r = calcAdaptiveLaguerreFilter(candles, { gamma: g });
            assert.strictEqual(r.length, 5);
            for (const p of r) assert.strictEqual(p.value, null);
        }
    });

    it('monotonic rising series never forms → all null (length/time preserved)', () => {
        const candles = makeCandles([10, 11, 12, 13, 14]);
        const r = calcAdaptiveLaguerreFilter(candles, { gamma: 0.5 });
        assert.strictEqual(r.length, candles.length);
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r[i].time, candles[i].time);
            assert.strictEqual(r[i].value, null); // lagging filter never reaches price
        }
    });

    it('constant series never crosses → all null', () => {
        const closes = new Array(200).fill(10);
        const r = calcAdaptiveLaguerreFilter(makeCandles(closes), { gamma: 0.8 });
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('forms when price dips below the filter; regression lock-in on a dip series', () => {
        // Price zig-zags, so the lagging filter crosses the price and the indicator
        // forms at bar 4. Vector captured from a clean run (matches the live C# dump).
        const dip = [10, 12, 14, 10, 8, 10, 12, 14, 10, 8, 10, 12, 14];
        const r = calcAdaptiveLaguerreFilter(makeCandles(dip), { gamma: 0.5 });
        for (let i = 0; i < 4; i++) assert.strictEqual(r[i].value, null); // warm-up
        approxEq(r[4].value, 8.733072916666666, 1e-6);
        approxEq(r[12].value, 11.337437947591146, 1e-6);
    });
});
