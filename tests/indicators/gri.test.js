// GRI/GAPO: log of max-min range over current-bar range, scaled by log(length).

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcGRI } = require('../../src/chart/indicators/calc/gri.js');

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcGRI', () => {
    it('empty candles → empty array', () => {
        assert.deepStrictEqual(calcGRI([], { length: 14 }), []);
    });

    it('fewer candles than length → all null', () => {
        const candles = [];
        for (let i = 0; i < 5; i++) {
            candles.push({ time: `t${i}`, open: 1, high: 2, low: 1, close: 1.5, volume: 0 });
        }
        const r = calcGRI(candles, { length: 14 });
        assert.strictEqual(r.length, 5);
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('length=1 → degenerate, all null (log(length)=0)', () => {
        const candles = [];
        for (let i = 0; i < 10; i++) {
            candles.push({ time: `t${i}`, open: 1, high: 2, low: 1, close: 1.5, volume: 0 });
        }
        const r = calcGRI(candles, { length: 1 });
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('flat range bars (currentRange == 0) → output is 0 once formed', () => {
        const candles = [];
        for (let i = 0; i < 10; i++) {
            candles.push({ time: `t${i}`, open: 5, high: 5, low: 5, close: 5, volume: 0 });
        }
        const r = calcGRI(candles, { length: 5 });
        for (let i = 0; i < 4; i++) assert.strictEqual(r[i].value, null);
        for (let i = 4; i < 10; i++) approxEq(r[i].value, 0);
    });

    it('hand-computed reference for length=3 over a known pattern', () => {
        // Bars (high, low):
        //   i=0: (10, 9)
        //   i=1: (12, 8)
        //   i=2: (11, 7)   ← first formed bar
        //   over [0..2]: maxHigh=12, minLow=7, range=5. current range = 11-7 = 4.
        //   gapo = log(5/4) / log(3)
        //
        //   i=3: (13, 7)
        //   over [1..3]: maxHigh=13, minLow=7, range=6. current range = 13-7 = 6.
        //   gapo = log(6/6) / log(3) = 0
        const hl = [[10, 9], [12, 8], [11, 7], [13, 7]];
        const candles = hl.map(([h, l], i) => ({
            time: `t${i}`, open: l, high: h, low: l, close: (h + l) / 2, volume: 0,
        }));
        const r = calcGRI(candles, { length: 3 });
        assert.strictEqual(r[0].value, null);
        assert.strictEqual(r[1].value, null);
        approxEq(r[2].value, Math.log(5 / 4) / Math.log(3));
        approxEq(r[3].value, 0);
    });
});
