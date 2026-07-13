// HMA indicator: warm-up shape and linear-ramp convergence.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcHMA } = require('../../src/chart/indicators/calc/hma.js');

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

describe('calcHMA', () => {
    it('empty candles → empty result', () => {
        assert.deepStrictEqual(calcHMA([], { length: 10 }), []);
    });

    it('length larger than candle count → every value null', () => {
        const out = calcHMA(makeCandles([1, 2, 3, 4, 5]), { length: 10 });
        assert.strictEqual(out.length, 5);
        for (const p of out) assert.strictEqual(p.value, null);
    });

    it('first non-null at length + floor(sqrt(length)) - 2', () => {
        // length=9, halfLen=4, sqrtLen=3. Slow WMA seeds at i=8, fast at i=3,
        // raw becomes non-null from i=8, final WMA(raw, 3) needs 3 raw samples
        // so first non-null at i = 8 + 2 = 10.
        const closes = [];
        for (let i = 1; i <= 15; i++) closes.push(i);
        const out = calcHMA(makeCandles(closes), { length: 9 });
        for (let i = 0; i < 10; i++) assert.strictEqual(out[i].value, null);
        assert.notStrictEqual(out[10].value, null);
    });

    it('linear ramp → HMA tracks close after warm-up (Hull lag → ~0)', () => {
        // closes 1..40, length=4 (small to keep test fast).
        const closes = [];
        for (let i = 1; i <= 40; i++) closes.push(i);
        const out = calcHMA(makeCandles(closes), { length: 4 });
        // length=4, halfLen=2, sqrtLen=2 → first non-null at i = 4 + 2 - 2 = 4.
        // On a linear ramp HMA = close exactly once warm.
        for (let i = 10; i < closes.length; i++) {
            approxEq(out[i].value, closes[i], 1e-9);
        }
    });

    it('explicit sqrtPeriod overrides floor(sqrt(length))', () => {
        const closes = [];
        for (let i = 1; i <= 20; i++) closes.push(i);
        // length=9 with sqrtPeriod=5 → first non-null at 9 + 5 - 2 = 12.
        const out = calcHMA(makeCandles(closes), { length: 9, sqrtPeriod: 5 });
        for (let i = 0; i < 12; i++) assert.strictEqual(out[i].value, null);
        assert.notStrictEqual(out[12].value, null);
    });

    it('time field passed through unchanged', () => {
        const candles = makeCandles([1, 2, 3, 4, 5, 6, 7, 8]);
        const out = calcHMA(candles, { length: 4 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });
});
