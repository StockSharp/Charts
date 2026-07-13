// Relative Vigor Index — two-line indicator (rvi + signal).

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcRelativeVigorIndex } = require('../../src/chart/indicators/calc/relativevigorindex.js');

function makeOHLC(rows) {
    return rows.map((r, i) => ({
        time: `2025-01-01T00:${String(i).padStart(2, '0')}:00Z`,
        open: r[0], high: r[1], low: r[2], close: r[3], volume: 0,
    }));
}

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`);
}

describe('calcRelativeVigorIndex', () => {
    it('empty input → {rvi:[], signal:[]}', () => {
        assert.deepStrictEqual(calcRelativeVigorIndex([], {}), { rvi: [], signal: [] });
    });

    it('both series have same length as input', () => {
        const candles = makeOHLC([
            [1, 2, 1, 1.5], [2, 3, 2, 2.5], [3, 4, 3, 3.5], [4, 5, 4, 4.5], [5, 6, 5, 5.5],
            [6, 7, 6, 6.5], [7, 8, 7, 7.5], [8, 9, 8, 8.5],
        ]);
        const r = calcRelativeVigorIndex(candles);
        assert.strictEqual(r.rvi.length, candles.length);
        assert.strictEqual(r.signal.length, candles.length);
    });

    it('first 3 RVI values null (length=4 warm-up), signal nulls deeper', () => {
        const candles = makeOHLC([
            [1, 2, 1, 1.5], [2, 3, 2, 2.5], [3, 4, 3, 3.5], [4, 5, 4, 4.5],
            [5, 6, 5, 5.5], [6, 7, 6, 6.5], [7, 8, 7, 7.5],
        ]);
        const r = calcRelativeVigorIndex(candles);
        for (let i = 0; i < 3; i++) assert.strictEqual(r.rvi[i].value, null);
        assert.ok(r.rvi[3].value !== null);
        // Signal warm-up is length-1 + signalLength-1 = 3+3 = 6, so signal[6] is first.
        for (let i = 0; i < 6; i++) assert.strictEqual(r.signal[i].value, null);
        assert.ok(r.signal[6].value !== null);
    });

    it('constant candles with high>low → constant RVI = (close-open)/(high-low)', () => {
        // open=1, high=3, low=0, close=2 → up=1, dn=3 → 1/3 each weighted, sum/6 cancels → 1/3.
        const candles = [];
        for (let i = 0; i < 10; i++) {
            candles.push({
                time: i,
                open: 1, high: 3, low: 0, close: 2, volume: 0,
            });
        }
        const r = calcRelativeVigorIndex(candles);
        // At i=3 first non-null.
        approxEq(r.rvi[3].value, 1 / 3);
        approxEq(r.rvi[5].value, 1 / 3);
        approxEq(r.rvi[9].value, 1 / 3);
        // Signal at i=6 is weighted avg of constant 1/3 values → 1/3.
        approxEq(r.signal[6].value, 1 / 3);
    });

    it('time preserved on both series', () => {
        const candles = makeOHLC([
            [1, 2, 1, 1.5], [2, 3, 2, 2.5], [3, 4, 3, 3.5], [4, 5, 4, 4.5], [5, 6, 5, 5.5],
        ]);
        const r = calcRelativeVigorIndex(candles);
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r.rvi[i].time, candles[i].time);
            assert.strictEqual(r.signal[i].time, candles[i].time);
        }
    });
});
