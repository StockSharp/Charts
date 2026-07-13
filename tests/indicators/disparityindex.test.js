// Disparity Index: empty/oversize warm-up + hand-computed reference.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcDisparityIndex } = require('../../src/chart/indicators/calc/disparityindex.js');

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `t${i}`, open: c, high: c, low: c, close: c, volume: 0,
    }));
}

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcDisparityIndex', () => {
    it('empty → empty', () => {
        assert.deepStrictEqual(calcDisparityIndex([], { length: 14 }), []);
    });

    it('length too big → all null', () => {
        const r = calcDisparityIndex(makeCandles([1,2,3]), { length: 14 });
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('flat closes → DPI=0 after warm-up', () => {
        const r = calcDisparityIndex(makeCandles([5,5,5,5,5,5]), { length: 3 });
        assert.strictEqual(r[0].value, null);
        assert.strictEqual(r[1].value, null);
        for (let i = 2; i < r.length; i++) approxEq(r[i].value, 0);
    });

    it('hand-computed length=3 on [10,20,30,40,50]', () => {
        // SMA: null, null, 20, 30, 40
        // DPI[2] = (30 - 20)/20 * 100 = 50
        // DPI[3] = (40 - 30)/30 * 100 ≈ 33.3333
        // DPI[4] = (50 - 40)/40 * 100 = 25
        const r = calcDisparityIndex(makeCandles([10,20,30,40,50]), { length: 3 });
        assert.strictEqual(r[0].value, null);
        assert.strictEqual(r[1].value, null);
        approxEq(r[2].value, 50);
        approxEq(r[3].value, 100 / 3);
        approxEq(r[4].value, 25);
    });

    it('first non-null lands exactly at index length-1', () => {
        const r = calcDisparityIndex(makeCandles([1,2,3,4,5,6,7]), { length: 4 });
        for (let i = 0; i < 3; i++) assert.strictEqual(r[i].value, null);
        assert.notStrictEqual(r[3].value, null);
    });

    it('time field passed through unchanged', () => {
        const candles = makeCandles([1,2,3,4,5]);
        const r = calcDisparityIndex(candles, { length: 3 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r[i].time, candles[i].time);
        }
    });
});
