// Williams %R indicator: warm-up nulls, hand-computed values, flat-window
// fallback.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcWilliamsR } = require('../../src/chart/indicators/calc/williamsr.js');

function makeCandles(rows) {
    // rows: [high, low, close]
    return rows.map((row, i) => ({
        time: `2025-01-01T00:${String(i).padStart(2, '0')}:00Z`,
        open: row[2],
        high: row[0],
        low: row[1],
        close: row[2],
        volume: 0,
    }));
}

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcWilliamsR', () => {
    it('empty candles → empty result', () => {
        assert.deepStrictEqual(calcWilliamsR([], { length: 14 }), []);
    });

    it('length larger than candle count → every value null', () => {
        const out = calcWilliamsR(
            makeCandles([[2, 1, 1.5], [3, 2, 2.5], [4, 3, 3.5]]),
            { length: 10 },
        );
        assert.strictEqual(out.length, 3);
        for (const p of out) assert.strictEqual(p.value, null);
    });

    it('length=3 over a known series matches hand-computed %R', () => {
        // window of 3 bars ending at i:
        // i=2: H=[2,3,4], L=[1,2,3], C=3.5 → hi=4, lo=1, range=3 → -100*(4-3.5)/3 = -16.666..
        // i=3: H=[3,4,5], L=[2,3,4], C=4.5 → hi=5, lo=2, range=3 → -100*(5-4.5)/3 = -16.666..
        // i=4: H=[4,5,6], L=[3,4,5], C=5.5 → hi=6, lo=3, range=3 → -100*(6-5.5)/3 = -16.666..
        const rows = [
            [2, 1, 1.5],
            [3, 2, 2.5],
            [4, 3, 3.5],
            [5, 4, 4.5],
            [6, 5, 5.5],
        ];
        const out = calcWilliamsR(makeCandles(rows), { length: 3 });
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        approxEq(out[2].value, -100 / 6);   // -16.666..
        approxEq(out[3].value, -100 / 6);
        approxEq(out[4].value, -100 / 6);
    });

    it('close at top of range → 0, close at bottom → -100', () => {
        // i=2 window [H=10..L=5], close at 10 → 0; close at 5 → -100.
        const top = calcWilliamsR(makeCandles([[10, 5, 7], [9, 6, 8], [10, 5, 10]]), { length: 3 });
        approxEq(top[2].value, 0);
        const bot = calcWilliamsR(makeCandles([[10, 5, 7], [9, 6, 8], [10, 5, 5]]), { length: 3 });
        approxEq(bot[2].value, -100);
    });

    it('flat window (high==low across whole window) → -100 fallback', () => {
        const out = calcWilliamsR(
            makeCandles([[5, 5, 5], [5, 5, 5], [5, 5, 5]]),
            { length: 3 },
        );
        assert.strictEqual(out[2].value, -100);
    });

    it('time field passed through unchanged', () => {
        const candles = makeCandles([[2, 1, 1.5], [3, 2, 2.5], [4, 3, 3.5], [5, 4, 4.5]]);
        const out = calcWilliamsR(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });
});
