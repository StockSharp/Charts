// TEMA indicator: warm-up shape and linear-ramp convergence.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcTEMA } = require('../../src/chart/indicators/calc/tema.js');

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

describe('calcTEMA', () => {
    it('empty candles → empty result', () => {
        assert.deepStrictEqual(calcTEMA([], { length: 10 }), []);
    });

    it('length larger than candle count → every value null', () => {
        const out = calcTEMA(makeCandles([1, 2, 3, 4, 5]), { length: 10 });
        assert.strictEqual(out.length, 5);
        for (const p of out) assert.strictEqual(p.value, null);
    });

    it('first non-null lands at index 3*(length-1)', () => {
        // length=3 → first non-null at index 6.
        const out = calcTEMA(makeCandles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), { length: 3 });
        for (let i = 0; i < 6; i++) assert.strictEqual(out[i].value, null);
        assert.notStrictEqual(out[6].value, null);
    });

    it('linear ramp → TEMA tracks close once cascade is warm', () => {
        const closes = [];
        for (let i = 1; i <= 50; i++) closes.push(i);
        const out = calcTEMA(makeCandles(closes), { length: 5 });
        // Cascade is fully warm well before the end; check the tail.
        for (let i = 40; i < closes.length; i++) {
            approxEq(out[i].value, closes[i], 1e-6);
        }
    });

    it('time field passed through unchanged', () => {
        const candles = makeCandles([1, 2, 3, 4, 5, 6, 7, 8]);
        const out = calcTEMA(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });
});
