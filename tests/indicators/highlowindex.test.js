// HighLowIndex: percent position of current bar's high within the
// trailing `length`-bar range; 50 when range collapses.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcHighLowIndex } = require('../../src/chart/indicators/calc/highlowindex.js');

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcHighLowIndex', () => {
    it('empty candles → empty array', () => {
        assert.deepStrictEqual(calcHighLowIndex([], { length: 14 }), []);
    });

    it('fewer candles than length → all null', () => {
        const candles = [];
        for (let i = 0; i < 5; i++) {
            candles.push({ time: `t${i}`, open: 1, high: 2, low: 1, close: 1.5, volume: 0 });
        }
        const r = calcHighLowIndex(candles, { length: 14 });
        assert.strictEqual(r.length, 5);
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('flat range (highest==lowest) once formed → output is 50', () => {
        const candles = [];
        for (let i = 0; i < 10; i++) {
            candles.push({ time: `t${i}`, open: 5, high: 5, low: 5, close: 5, volume: 0 });
        }
        const r = calcHighLowIndex(candles, { length: 5 });
        for (let i = 0; i < 4; i++) assert.strictEqual(r[i].value, null);
        for (let i = 4; i < 10; i++) approxEq(r[i].value, 50);
    });

    it('reference vector: length=3 over a known sequence', () => {
        // (high, low) per bar:
        //   i=0: (2, 1)
        //   i=1: (4, 1)
        //   i=2: (3, 2)   range over [0..2] = (4 - 1) = 3, cur.high=3, lowestLow=1
        //                 HLI = (3 - 1) / 3 * 100 = 66.666...
        //   i=3: (5, 2)   range over [1..3] = (5 - 1) = 4, cur.high=5, lowestLow=1
        //                 HLI = (5 - 1) / 4 * 100 = 100
        //   i=4: (4, 3)   range over [2..4] = (5 - 2) = 3, cur.high=4, lowestLow=2
        //                 HLI = (4 - 2) / 3 * 100 = 66.666...
        const hl = [[2, 1], [4, 1], [3, 2], [5, 2], [4, 3]];
        const candles = hl.map(([h, l], i) => ({
            time: `t${i}`, open: l, high: h, low: l, close: (h + l) / 2, volume: 0,
        }));
        const r = calcHighLowIndex(candles, { length: 3 });
        assert.strictEqual(r[0].value, null);
        assert.strictEqual(r[1].value, null);
        approxEq(r[2].value, (3 - 1) / 3 * 100);
        approxEq(r[3].value, 100);
        approxEq(r[4].value, (4 - 2) / 3 * 100);
    });

    it('output is always inside [0, 100] once formed', () => {
        const candles = [];
        for (let i = 0; i < 50; i++) {
            const c = Math.sin(i / 3) * 5 + 10;
            candles.push({ time: `t${i}`, open: c, high: c + 0.5, low: c - 0.5, close: c, volume: 0 });
        }
        const r = calcHighLowIndex(candles, { length: 14 });
        for (const p of r) {
            if (p.value !== null) {
                assert.ok(p.value >= 0 && p.value <= 100, `out of range: ${p.value}`);
            }
        }
    });
});
