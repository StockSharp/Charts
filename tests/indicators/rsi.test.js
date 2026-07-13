// RSI indicator: warm-up shape + hand-computed SMMA reference.
//
// JS calcRSI mirrors StockSharp RelativeStrengthIndex.cs which uses
// SmoothedMovingAverage (SMMA, partial-sum-divided-by-length) for the
// average gain / loss instead of the textbook "SMA-then-Wilder" pattern.
// Output is per-candle aligned: out[i] is the RSI for candle[i] using
// closes[0..i]. out[0] is null because no delta exists for the first
// candle (no prior close).

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcRSI } = require('../../src/chart/indicators/calc/rsi.js');

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

describe('calcRSI', () => {
    it('empty candle array → empty result', () => {
        assert.deepStrictEqual(calcRSI([], { length: 14 }), []);
    });

    it('single candle → output of length 1 with null value', () => {
        // Need at least 2 candles to compute a delta; 1 candle is degenerate.
        const out = calcRSI(makeCandles([10]), { length: 14 });
        assert.strictEqual(out.length, 1);
        assert.strictEqual(out[0].value, null);
    });

    it('output array length matches input candle count; index 0 always null', () => {
        const out = calcRSI(makeCandles([1, 2, 3, 4, 5, 6]), { length: 3 });
        assert.strictEqual(out.length, 6);
        assert.strictEqual(out[0].value, null);
    });

    it('first non-null lands at index 1 (SMMA seeds from the first delta)', () => {
        // Two candles: closes [1, 2] → delta=+1. SMMA(gain, L=3) returns
        // 1/3 on its first call (Sum/L), loss SMMA returns 0/3 = 0.
        // RSI = 100*(1/3) / (1/3 + 0) = 100. Stored at index 1 (per-candle).
        const out = calcRSI(makeCandles([1, 2]), { length: 3 });
        assert.strictEqual(out[0].value, null);
        approxEq(out[1].value, 100);
    });

    it('SMMA partial-sum semantics during warm-up (length=3, [1,2,3,4,5,4,3,4])', () => {
        const out = calcRSI(makeCandles([1, 2, 3, 4, 5, 4, 3, 4]), { length: 3 });
        // SMMA call schedule per candle:
        //   candle 1 (after [1,2], d=+1): g=(0+1)/3=1/3, l=0/3=0 → 100
        //   candle 2 (after [2,3], d=+1): g=(1+1)/3=2/3, l=0/3=0 → 100
        //   candle 3 (after [3,4], d=+1): g=3/3=1, l=0/3=0 → 100   (SMMA formed)
        //   candle 4 (after [4,5], d=+1): g=(1*2+1)/3=1, l=(0*2+0)/3=0 → 100
        //   candle 5 (after [5,4], d=-1): g=(1*2+0)/3=2/3, l=(0*2+1)/3=1/3 → 200/3
        //   candle 6 (after [4,3], d=-1): g=(2/3*2)/3=4/9, l=(1/3*2+1)/3=5/9 → 400/9
        //   candle 7 (after [3,4], d=+1): g=(4/9*2+1)/3=17/27, l=(5/9*2)/3=10/27 → 1700/27
        //
        // out[0] is null (no delta for the very first candle).
        assert.strictEqual(out[0].value, null);
        approxEq(out[1].value, 100);
        approxEq(out[2].value, 100);
        approxEq(out[3].value, 100);
        approxEq(out[4].value, 100);
        approxEq(out[5].value, 200 / 3);
        approxEq(out[6].value, 400 / 9);
        approxEq(out[7].value, 1700 / 27);
    });

    it('time field passed through unchanged at each slot', () => {
        const candles = makeCandles([1, 2, 3, 4, 5]);
        const out = calcRSI(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });

    it('all-up series → RSI saturates at 100 (avgLoss=0 safe-guard)', () => {
        const out = calcRSI(makeCandles([1, 2, 3, 4, 5, 6, 7]), { length: 3 });
        // Indices 1..6 should all be 100 (each delta is +1, positive).
        // Index 0 is null (no delta available for first candle).
        assert.strictEqual(out[0].value, null);
        for (let i = 1; i < 7; i++) approxEq(out[i].value, 100);
    });
});
