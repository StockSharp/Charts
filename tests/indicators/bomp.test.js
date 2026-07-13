// Balance of Market Power — SMA of (close-open)/(high-low) ratio.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcBalanceOfMarketPower } = require('../../src/chart/indicators/calc/bomp.js');

function makeCandles(rows) {
    // rows: [open, high, low, close, volume]
    return rows.map((r, i) => ({
        time: `t${i}`, open: r[0], high: r[1], low: r[2], close: r[3], volume: r[4],
    }));
}

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcBalanceOfMarketPower', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcBalanceOfMarketPower([], { length: 14 }), []);
    });

    it('length larger than candles → every value null', () => {
        const r = calcBalanceOfMarketPower(makeCandles([
            [10, 12, 8, 11, 100], [11, 13, 9, 12, 100], [12, 14, 10, 13, 100],
        ]), { length: 14 });
        assert.strictEqual(r.length, 3);
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('all-bullish bars (close=high, open=low) → raw = 1.0 → SMA = 1.0', () => {
        // Each bar: open=low, close=high → (close-open)/(high-low) = 1.
        const rows = [];
        for (let i = 0; i < 6; i++) rows.push([10, 12, 10, 12, 100]);
        const r = calcBalanceOfMarketPower(makeCandles(rows), { length: 3 });
        for (let i = 0; i < 2; i++) assert.strictEqual(r[i].value, null);
        for (let i = 2; i < 6; i++) approxEq(r[i].value, 1);
    });

    it('all-bearish bars (close=low, open=high) → raw = -1.0 → SMA = -1.0', () => {
        const rows = [];
        for (let i = 0; i < 5; i++) rows.push([12, 12, 10, 10, 50]);
        const r = calcBalanceOfMarketPower(makeCandles(rows), { length: 2 });
        assert.strictEqual(r[0].value, null);
        for (let i = 1; i < 5; i++) approxEq(r[i].value, -1);
    });

    it('zero-volume bars contribute 0 to the SMA regardless of OHLC', () => {
        // length=2. Two bars, both with volume=0 but tasty OHLC. Per .cs
        // they each contribute 0 to the SMA → output is 0.
        const rows = [
            [10, 14, 10, 14, 0], // would be raw=1 with volume, but vol=0 → raw=0
            [10, 14, 10, 10, 0], // would be raw=0 anyway
        ];
        const r = calcBalanceOfMarketPower(makeCandles(rows), { length: 2 });
        approxEq(r[1].value, 0);
    });

    it('hand-computed: mixed bars, length=2', () => {
        // bar 0: open=10, high=12, low=8, close=11, vol=100
        //        range = 12-8 = 4, raw = (11-10)/4 = 0.25
        // bar 1: open=11, high=14, low=10, close=12, vol=100
        //        range = 14-10 = 4, raw = (12-11)/4 = 0.25
        // bar 2: open=12, high=15, low=11, close=11, vol=100
        //        range = 15-11 = 4, raw = (11-12)/4 = -0.25
        // length=2:
        //   bar 0: null
        //   bar 1: (0.25 + 0.25)/2 = 0.25
        //   bar 2: (0.25 + -0.25)/2 = 0
        const rows = [
            [10, 12, 8, 11, 100],
            [11, 14, 10, 12, 100],
            [12, 15, 11, 11, 100],
        ];
        const r = calcBalanceOfMarketPower(makeCandles(rows), { length: 2 });
        assert.strictEqual(r[0].value, null);
        approxEq(r[1].value, 0.25);
        approxEq(r[2].value, 0);
    });

    it('high == low → 0.01 floor on range (matches .cs literal)', () => {
        // bar: open=10, high=10, low=10, close=10.01, vol=1. raw = 0.01/0.01 = 1.
        const rows = [
            [10, 10, 10, 10.01, 1],
            [10, 10, 10, 10.01, 1],
        ];
        const r = calcBalanceOfMarketPower(makeCandles(rows), { length: 2 });
        approxEq(r[1].value, 1, 1e-12);
    });

    it('time field passed through unchanged', () => {
        const candles = makeCandles([
            [10, 12, 8, 11, 100], [11, 13, 9, 12, 100], [12, 14, 10, 13, 100],
        ]);
        const r = calcBalanceOfMarketPower(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) assert.strictEqual(r[i].time, candles[i].time);
    });
});
