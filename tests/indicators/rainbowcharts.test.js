// Rainbow Charts — N-1 SMAs of close with lengths 2, 4, ..., 2*(N-1).

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcRainbowCharts } = require('../../src/chart/indicators/calc/rainbowcharts.js');

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `2025-01-01T00:${String(i).padStart(2, '0')}:00Z`,
        open: c, high: c, low: c, close: c, volume: 0,
    }));
}

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`);
}

describe('calcRainbowCharts', () => {
    it('empty input → object with empty series for each line', () => {
        const r = calcRainbowCharts([], { lines: 4 });
        // For lines=4 we expect sma1..sma3 (3 series).
        assert.deepStrictEqual(Object.keys(r).sort(), ['sma1', 'sma2', 'sma3']);
        for (const k of Object.keys(r)) assert.deepStrictEqual(r[k], []);
    });

    it('default lines=10 → 9 series each with same length as input', () => {
        const candles = makeCandles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
        const r = calcRainbowCharts(candles);
        assert.strictEqual(Object.keys(r).length, 9);
        for (let k = 1; k <= 9; k++) {
            const key = 'sma' + k;
            assert.ok(Array.isArray(r[key]), `${key} missing`);
            assert.strictEqual(r[key].length, candles.length);
        }
    });

    it('lines=3 over [1..6]: sma1 = SMA(2), sma2 = SMA(4)', () => {
        const r = calcRainbowCharts(makeCandles([1, 2, 3, 4, 5, 6]), { lines: 3 });
        // sma1 length=2 → null at 0, then averages of consecutive pairs.
        assert.strictEqual(r.sma1[0].value, null);
        approxEq(r.sma1[1].value, 1.5);
        approxEq(r.sma1[2].value, 2.5);
        approxEq(r.sma1[5].value, 5.5);
        // sma2 length=4 → null at 0..2, then (1+2+3+4)/4=2.5 at i=3.
        for (let i = 0; i < 3; i++) assert.strictEqual(r.sma2[i].value, null);
        approxEq(r.sma2[3].value, 2.5);
        approxEq(r.sma2[5].value, 4.5);
    });

    it('preserves time on all series', () => {
        const candles = makeCandles([1, 2, 3, 4, 5]);
        const r = calcRainbowCharts(candles, { lines: 3 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r.sma1[i].time, candles[i].time);
            assert.strictEqual(r.sma2[i].time, candles[i].time);
        }
    });
});
