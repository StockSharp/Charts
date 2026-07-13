// Schaff Trend Cycle — shape and warm-up sanity tests.
// The full STC value depends on a deep pipeline (MACD → buffer-min/max →
// inner Stochastic %K → outer EMA), so we focus on shape, warm-up, and
// monotone-trend behaviour rather than exact hand-calculations.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcSchaffTrendCycle } = require('../../src/chart/indicators/calc/schafftrendcycle.js');

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `2025-01-01T00:${String(i).padStart(2, '0')}:00Z`,
        open: c, high: c, low: c, close: c, volume: 0,
    }));
}

describe('calcSchaffTrendCycle', () => {
    it('empty input → []', () => {
        assert.deepStrictEqual(calcSchaffTrendCycle([], {}), []);
    });

    it('warm-up nulls at the start (default params need many bars)', () => {
        const closes = [];
        for (let i = 1; i <= 20; i++) closes.push(i);
        const out = calcSchaffTrendCycle(makeCandles(closes));
        // First bars must be null (MACD long=50 alone won't warm up here).
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[5].value, null);
        assert.strictEqual(out[19].value, null);
    });

    it('output length matches input length', () => {
        const closes = [];
        for (let i = 1; i <= 30; i++) closes.push(i + Math.sin(i) * 5);
        const out = calcSchaffTrendCycle(makeCandles(closes), {
            length: 3, shortLength: 4, longLength: 8, cycleLength: 3, signalLength: 2,
        });
        assert.strictEqual(out.length, closes.length);
    });

    it('with tiny params produces some non-null values on enough data', () => {
        const closes = [];
        for (let i = 1; i <= 60; i++) closes.push(i + Math.sin(i * 0.5) * 3);
        const out = calcSchaffTrendCycle(makeCandles(closes), {
            length: 3, shortLength: 4, longLength: 8, cycleLength: 3, signalLength: 2,
        });
        const anyFinite = out.some(p => typeof p.value === 'number' && Number.isFinite(p.value));
        assert.ok(anyFinite, 'expected at least one non-null STC value');
    });

    it('preserves time', () => {
        const candles = makeCandles([1, 2, 3, 4, 5]);
        const out = calcSchaffTrendCycle(candles);
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });
});
