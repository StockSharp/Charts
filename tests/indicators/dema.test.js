// DEMA indicator: warm-up shape and linear-ramp convergence.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcDEMA } = require('../../src/chart/indicators/calc/dema.js');

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

function approxEq(actual, expected, eps = 1e-6) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcDEMA', () => {
    it('empty candles → empty result', () => {
        assert.deepStrictEqual(calcDEMA([], { length: 10 }), []);
    });

    it('length larger than candle count → every value null', () => {
        const out = calcDEMA(makeCandles([1, 2, 3, 4]), { length: 10 });
        assert.strictEqual(out.length, 4);
        for (const p of out) assert.strictEqual(p.value, null);
    });

    it('first non-null lands at index 2*(length-1)', () => {
        // length=3 → first non-null at index 4.
        const out = calcDEMA(makeCandles([1, 2, 3, 4, 5, 6, 7]), { length: 3 });
        assert.strictEqual(out.length, 7);
        for (let i = 0; i < 4; i++) assert.strictEqual(out[i].value, null);
        assert.notStrictEqual(out[4].value, null);
    });

    it('on a linear ramp the indicator tracks close once warm-up is over', () => {
        // closes 1..50: any EMA on a linear ramp settles to a constant lag.
        // DEMA = 2*EMA - EMA(EMA) is designed to cancel that lag, so once
        // both EMAs are fully warm DEMA should be ~= close.
        const closes = [];
        for (let i = 1; i <= 50; i++) closes.push(i);
        const out = calcDEMA(makeCandles(closes), { length: 5 });
        // Give the cascade a comfortable buffer past the formal warm-up.
        for (let i = 30; i < closes.length; i++) {
            approxEq(out[i].value, closes[i], 1e-6);
        }
    });

    it('time field passed through unchanged', () => {
        const candles = makeCandles([1, 2, 3, 4, 5, 6]);
        const out = calcDEMA(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });
});
