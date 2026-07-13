// FVE: bounded SMA of position-in-range, scaled by 100.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcFVE } = require('../../src/chart/indicators/calc/fve.js');

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcFVE', () => {
    it('empty candles → empty array', () => {
        assert.deepStrictEqual(calcFVE([], { length: 22 }), []);
    });

    it('fewer candles than length → all-null output of correct length', () => {
        const candles = [];
        for (let i = 0; i < 5; i++) {
            candles.push({ time: `t${i}`, open: 1, high: 2, low: 1, close: 1.5, volume: 100 });
        }
        const r = calcFVE(candles, { length: 22 });
        assert.strictEqual(r.length, 5);
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('close at midpoint, range>0, volume>0 → raw = 0 → all FVE outputs equal 0', () => {
        // 2*(mid-low)/range - 1 = 0 for close exactly at midpoint.
        const candles = [];
        for (let i = 0; i < 10; i++) {
            candles.push({ time: `t${i}`, open: 1.5, high: 2, low: 1, close: 1.5, volume: 100 });
        }
        const r = calcFVE(candles, { length: 5 });
        for (let i = 0; i < 4; i++) assert.strictEqual(r[i].value, null);
        for (let i = 4; i < 10; i++) approxEq(r[i].value, 0);
    });

    it('close at high, range>0, volume>0 → raw = +1 → FVE = +100 once formed', () => {
        const candles = [];
        for (let i = 0; i < 10; i++) {
            candles.push({ time: `t${i}`, open: 1, high: 2, low: 1, close: 2, volume: 100 });
        }
        const r = calcFVE(candles, { length: 5 });
        for (let i = 0; i < 4; i++) assert.strictEqual(r[i].value, null);
        for (let i = 4; i < 10; i++) approxEq(r[i].value, 100);
    });

    it('zero-range or zero-volume bars contribute 0 to the SMA', () => {
        // First 5 bars: range=0 → raw=0. Next 5: range>0, close at high, volume>0 → raw=+1.
        // After bar 9, SMA over last 5 raws = 1.0 → FVE = 100.
        const candles = [];
        for (let i = 0; i < 5; i++) {
            candles.push({ time: `t${i}`, open: 1, high: 1, low: 1, close: 1, volume: 100 });
        }
        for (let i = 5; i < 10; i++) {
            candles.push({ time: `t${i}`, open: 1, high: 2, low: 1, close: 2, volume: 100 });
        }
        const r = calcFVE(candles, { length: 5 });
        // First formed bar at i=4: avg of 5 zeros = 0 → 0.
        approxEq(r[4].value, 0);
        // i=9: avg of last 5 raws = 1 → 100.
        approxEq(r[9].value, 100);
    });
});
