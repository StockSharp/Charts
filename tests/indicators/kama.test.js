// KAMA (Kaufman Adaptive Moving Average): warm-up, constant-series invariant,
// and hand-checked first iteration.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcKAMA } = require('../../src/chart/indicators/calc/kama.js');

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

describe('calcKAMA', () => {
    it('empty candles → empty result', () => {
        assert.deepStrictEqual(calcKAMA([], { length: 10 }), []);
    });

    it('candle count ≤ length → every value null (need length+1 to seed)', () => {
        // length=10 needs at least 11 candles (10 for warm-up + 1 to compute).
        const out = calcKAMA(makeCandles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), { length: 10 });
        assert.strictEqual(out.length, 10);
        for (const p of out) assert.strictEqual(p.value, null);
    });

    it('first non-null lands at index = length (seeded with current close)', () => {
        // length=3, fast=2, slow=30 (defaults).
        const out = calcKAMA(makeCandles([1, 2, 3, 4, 5, 6]), { length: 3 });
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        assert.strictEqual(out[2].value, null);
        // Seed at i=length=3 → KAMA = close[3] = 4.
        approxEq(out[3].value, 4);
    });

    it('constant series → KAMA equals the constant after seed', () => {
        // ER = 0 (no direction), so SC = slowSC² = (2/31)², KAMA[i] =
        // KAMA[i-1] + smooth*(close - KAMA[i-1]). close == KAMA[i-1] so KAMA
        // stays at the constant indefinitely.
        const out = calcKAMA(makeCandles([50, 50, 50, 50, 50, 50, 50, 50]), {
            length: 4,
            fastSc: 2,
            slowSc: 30,
        });
        // Warm-up nulls for i in 0..3, then constant.
        for (let i = 0; i < 4; i++) assert.strictEqual(out[i].value, null);
        for (let i = 4; i < 8; i++) approxEq(out[i].value, 50);
    });

    it('hand-checked one-step update on a stepped series', () => {
        // length=3, fast=2, slow=30 → fastK = 2/3, slowK = 2/31.
        // closes = [1, 2, 3, 4, 5].
        //   i=3 (seed): KAMA = 4.
        //   i=4: window close[1..4] = [2,3,4,5].
        //     direction = 5 - 2 = 3.
        //     volatility = |3-2| + |4-3| + |5-4| = 3.
        //     ER = |3/3| = 1.
        //     ssc = 1*(2/3 - 2/31) + 2/31 = 2/3.
        //     smooth = 4/9.
        //     KAMA = (5 - 4)*4/9 + 4 = 4 + 4/9 = 40/9.
        const out = calcKAMA(makeCandles([1, 2, 3, 4, 5]), {
            length: 3,
            fastSc: 2,
            slowSc: 30,
        });
        approxEq(out[3].value, 4);
        approxEq(out[4].value, 4 + 4 / 9);
    });

    it('time field passed through unchanged', () => {
        const candles = makeCandles([1, 2, 3, 4, 5, 6]);
        const out = calcKAMA(candles, { length: 3 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });
});
