// Balance of Power: (close - open) / (high - low), null on flat bars
// (matches BalanceOfPower.cs which returns an empty IIndicatorValue when
// the candle range is zero), null on missing OHLC.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcBalanceOfPower } = require('../../src/chart/indicators/calc/balanceofpower.js');

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcBalanceOfPower', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcBalanceOfPower([], {}), []);
    });

    it('hand-computed BOP values', () => {
        const candles = [
            { time: 't0', open: 10, high: 12, low: 8, close: 11, volume: 0 },   // (11-10)/4 = 0.25
            { time: 't1', open: 11, high: 12, low: 10, close: 10, volume: 0 },  // (10-11)/2 = -0.5
            { time: 't2', open: 5, high: 10, low: 0, close: 10, volume: 0 },    // (10-5)/10 = 0.5
        ];
        const r = calcBalanceOfPower(candles, {});
        approxEq(r[0].value, 0.25);
        approxEq(r[1].value, -0.5);
        approxEq(r[2].value, 0.5);
    });

    it('flat bar (high == low) → null (matches .cs)', () => {
        const candles = [
            { time: 't0', open: 5, high: 5, low: 5, close: 5, volume: 0 },
        ];
        const r = calcBalanceOfPower(candles, {});
        assert.strictEqual(r[0].value, null);
    });

    it('non-finite OHLC → null', () => {
        const candles = [
            { time: 't0', open: NaN, high: 12, low: 8, close: 11, volume: 0 },
            { time: 't1', open: 10, high: 12, low: 8, close: NaN, volume: 0 },
            { time: 't2', open: 10, high: 12, low: 8, close: 11, volume: 0 }, // good
        ];
        const r = calcBalanceOfPower(candles, {});
        assert.strictEqual(r[0].value, null);
        assert.strictEqual(r[1].value, null);
        approxEq(r[2].value, 0.25);
    });

    it('output length matches candles[] and time is passed through', () => {
        const candles = [
            { time: 'a', open: 1, high: 2, low: 1, close: 1.5, volume: 0 },
            { time: 'b', open: 2, high: 3, low: 1, close: 2.5, volume: 0 },
        ];
        const r = calcBalanceOfPower(candles, {});
        assert.strictEqual(r.length, 2);
        assert.strictEqual(r[0].time, 'a');
        assert.strictEqual(r[1].time, 'b');
    });

    it('values always within [-1, +1]', () => {
        const candles = [
            // Conjure an extreme bar — synthetic close outside [low,high] should still clamp.
            { time: 't0', open: 0, high: 1, low: 0, close: 5, volume: 0 }, // (5-0)/1 = 5 → clamped to 1
        ];
        const r = calcBalanceOfPower(candles, {});
        assert.strictEqual(r[0].value, 1);
    });
});
