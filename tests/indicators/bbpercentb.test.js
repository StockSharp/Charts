// Bollinger %b — price position within the Bollinger envelope.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcBollingerPercentB } = require('../../src/chart/indicators/calc/bbpercentb.js');

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

describe('calcBollingerPercentB', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcBollingerPercentB([], { length: 20 }), []);
    });

    it('length larger than candles → every value null', () => {
        const r = calcBollingerPercentB(makeCandles([1, 2, 3]), { length: 20 });
        assert.strictEqual(r.length, 3);
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('constant series → band width = 0 → all values null', () => {
        const r = calcBollingerPercentB(makeCandles([5, 5, 5, 5, 5, 5]), { length: 3 });
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('first non-null at index length-1', () => {
        const r = calcBollingerPercentB(makeCandles([1, 2, 3, 4, 5]), { length: 3 });
        assert.strictEqual(r[0].value, null);
        assert.strictEqual(r[1].value, null);
        assert.notStrictEqual(r[2].value, null);
    });

    it('hand-computed: length=3, closes=[1,2,3] → %b=100 (price=upper bound)', () => {
        // SMA = 2. stddev = sqrt(((1-2)^2 + 0 + (3-2)^2) / 3) = sqrt(2/3)
        // k=2 → upper = 2 + 2*sqrt(2/3), lower = 2 - 2*sqrt(2/3).
        // price=3, width = 4*sqrt(2/3). %b = (3 - lower) / width * 100
        //   = (3 - 2 + 2*sqrt(2/3)) / (4*sqrt(2/3)) * 100
        //   = (1 + 2*sqrt(2/3)) / (4*sqrt(2/3)) * 100
        const r = calcBollingerPercentB(makeCandles([1, 2, 3]), { length: 3, stdDevMultiplier: 2 });
        const s = Math.sqrt(2 / 3);
        const expected = (1 + 2 * s) / (4 * s) * 100;
        approxEq(r[2].value, expected);
    });

    it('symmetric vector: closes equal to SMA → %b = 50 (on the centre line)', () => {
        // For a length-3 window where the current bar equals the SMA of
        // the window, price = mid = (upper+lower)/2 → %b = 50.
        // closes=[1,3,2]: SMA=2, current=2.
        const r = calcBollingerPercentB(makeCandles([1, 3, 2]), { length: 3, stdDevMultiplier: 2 });
        approxEq(r[2].value, 50);
    });

    it('time field passed through unchanged', () => {
        const candles = makeCandles([1, 2, 3, 4, 5, 6]);
        const r = calcBollingerPercentB(candles, { length: 3 });
        for (let i = 0; i < candles.length; i++) assert.strictEqual(r[i].time, candles[i].time);
    });
});
