// SMMA (Smoothed Moving Average) — same as Wilder smoothing on close.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcSMMA } = require('../../src/chart/indicators/calc/smma.js');

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

describe('calcSMMA', () => {
    it('empty candles → empty result', () => {
        assert.deepStrictEqual(calcSMMA([], { length: 5 }), []);
    });

    it('length larger than candle count → every value null', () => {
        const out = calcSMMA(makeCandles([1, 2, 3]), { length: 5 });
        assert.strictEqual(out.length, 3);
        for (const p of out) assert.strictEqual(p.value, null);
    });

    it('[10,12,14,16] length=3 hand-computed', () => {
        // Seed at i=2: mean(10,12,14) = 12.
        // i=3: (12*2 + 16)/3 = 40/3 ≈ 13.3333333…
        const out = calcSMMA(makeCandles([10, 12, 14, 16]), { length: 3 });
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        approxEq(out[2].value, 12);
        approxEq(out[3].value, 40 / 3);
    });

    it('flat series → SMMA equals the flat value once warm', () => {
        const out = calcSMMA(makeCandles([7, 7, 7, 7, 7, 7]), { length: 3 });
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        approxEq(out[2].value, 7);
        approxEq(out[3].value, 7);
        approxEq(out[5].value, 7);
    });

    it('time field passed through unchanged', () => {
        const candles = makeCandles([1, 2, 3, 4, 5]);
        const out = calcSMMA(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });
});
