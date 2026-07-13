// Alligator: shape, warm-up nulls, and hand-checked unshifted SMMA.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcAlligator } = require('../../src/chart/indicators/calc/alligator.js');

function makeCandles(hl) {
    return hl.map(([h, l], i) => ({
        time: `2025-01-01T00:${String(i).padStart(2, '0')}:00Z`,
        open: (h + l) / 2,
        high: h,
        low: l,
        close: (h + l) / 2,
        volume: 0,
    }));
}

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcAlligator', () => {
    it('empty candles → empty series for all three lines', () => {
        assert.deepStrictEqual(
            calcAlligator([], {}),
            { jaw: [], teeth: [], lips: [] },
        );
    });

    it('not enough data for any line → every value null on all three lines', () => {
        // 5 candles: lips needs length 5 + shift 3 = 8 candles before first value.
        const candles = makeCandles([[2, 1], [3, 2], [4, 3], [5, 4], [6, 5]]);
        const r = calcAlligator(candles, {});
        assert.strictEqual(r.jaw.length, 5);
        assert.strictEqual(r.teeth.length, 5);
        assert.strictEqual(r.lips.length, 5);
        for (let i = 0; i < 5; i++) {
            assert.strictEqual(r.jaw[i].value, null);
            assert.strictEqual(r.teeth[i].value, null);
            assert.strictEqual(r.lips[i].value, null);
        }
    });

    it('all three sub-series have the same length as candles[]', () => {
        const hl = [];
        for (let i = 0; i < 30; i++) hl.push([10 + i, 5 + i]);
        const candles = makeCandles(hl);
        const r = calcAlligator(candles, {});
        assert.strictEqual(r.jaw.length, candles.length);
        assert.strictEqual(r.teeth.length, candles.length);
        assert.strictEqual(r.lips.length, candles.length);
    });

    it('lips (length=5, shift=3): leading nulls then SMMA-aligned values', () => {
        // Use medians = 1..N so SMMA over length=5 is hand-verifiable via wilderMA.
        const hl = [];
        for (let i = 1; i <= 12; i++) hl.push([i + 0.5, i - 0.5]); // median = i
        const candles = makeCandles(hl);
        const r = calcAlligator(candles, { lipsLength: 5, lipsShift: 3 });
        // SMMA(medians, 5) seed at i=4 = mean(1..5) = 3.
        // Lips with shift=3 → first non-null at i = (5-1) + 3 = 7, value = SMMA[4] = 3.
        for (let i = 0; i < 7; i++) assert.strictEqual(r.lips[i].value, null);
        approxEq(r.lips[7].value, 3);
        // SMMA[5] = (3*4 + 6)/5 = 18/5 = 3.6 → lips[8] = 3.6
        approxEq(r.lips[8].value, 18 / 5);
    });

    it('teeth (length=8, shift=5) first non-null lands at index 12', () => {
        const hl = [];
        for (let i = 1; i <= 20; i++) hl.push([i + 0.5, i - 0.5]);
        const candles = makeCandles(hl);
        const r = calcAlligator(candles, { teethLength: 8, teethShift: 5 });
        // first non-null at (8-1)+5 = 12
        for (let i = 0; i < 12; i++) assert.strictEqual(r.teeth[i].value, null);
        assert.notStrictEqual(r.teeth[12].value, null);
    });

    it('jaw (length=13, shift=8) first non-null lands at index 20', () => {
        const hl = [];
        for (let i = 1; i <= 25; i++) hl.push([i + 0.5, i - 0.5]);
        const candles = makeCandles(hl);
        const r = calcAlligator(candles, { jawLength: 13, jawShift: 8 });
        // first non-null at (13-1)+8 = 20
        for (let i = 0; i < 20; i++) assert.strictEqual(r.jaw[i].value, null);
        assert.notStrictEqual(r.jaw[20].value, null);
    });

    it('time field passed through unchanged on all three series', () => {
        const candles = makeCandles([[2, 1], [3, 2], [4, 3], [5, 4], [6, 5]]);
        const r = calcAlligator(candles, {});
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r.jaw[i].time, candles[i].time);
            assert.strictEqual(r.teeth[i].time, candles[i].time);
            assert.strictEqual(r.lips[i].time, candles[i].time);
        }
    });
});
