// RSI indicator: matches StockSharp RelativeStrengthIndex.cs which uses
// SmoothedMovingAverage (SMMA) for the average gain / loss. The gain/loss SMMA
// is formed only after `length` values, so RSI emits nothing before out[length];
// out[0] is null because no delta exists for the first candle.

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
        const out = calcRSI(makeCandles([10]), { length: 14 });
        assert.strictEqual(out.length, 1);
        assert.strictEqual(out[0].value, null);
    });

    it('output array length matches input candle count; index 0 always null', () => {
        const out = calcRSI(makeCandles([1, 2, 3, 4, 5, 6]), { length: 3 });
        assert.strictEqual(out.length, 6);
        assert.strictEqual(out[0].value, null);
    });

    it('first non-null lands at index length (SMMA formed)', () => {
        // length=3: warm-up out[0..2] null; first RSI at out[3]. All-up → 100.
        const out = calcRSI(makeCandles([1, 2, 3, 4]), { length: 3 });
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        assert.strictEqual(out[2].value, null);
        approxEq(out[3].value, 100);
    });

    it('SMMA partial-sum semantics once formed (length=3, [1,2,3,4,5,4,3,4])', () => {
        const out = calcRSI(makeCandles([1, 2, 3, 4, 5, 4, 3, 4]), { length: 3 });
        // Warm-up out[0..2] null; formed values from out[3]:
        //   out[3] (SMMA formed, all-up): g=1, l=0 → 100
        //   out[4]: g=1, l=0 → 100
        //   out[5] (d=-1): g=2/3, l=1/3 → 200/3
        //   out[6] (d=-1): g=4/9, l=5/9 → 400/9
        //   out[7] (d=+1): g=17/27, l=10/27 → 1700/27
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        assert.strictEqual(out[2].value, null);
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

    it('all-up series → RSI saturates at 100 once formed (avgLoss=0 safe-guard)', () => {
        const out = calcRSI(makeCandles([1, 2, 3, 4, 5, 6, 7]), { length: 3 });
        // Warm-up out[0..2] null; out[3..6] all 100 (each delta +1).
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        assert.strictEqual(out[2].value, null);
        for (let i = 3; i < 7; i++) approxEq(out[i].value, 100);
    });
});
