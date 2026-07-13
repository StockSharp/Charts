// Chaikin Money Flow: shape, warm-up, hand-computed three-bar window,
// high==low edge case, and zero-total-volume guard.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcCMF } = require('../../src/chart/indicators/calc/cmf.js');

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcCMF', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcCMF([], { length: 20 }), []);
    });

    it('candle count < length → every value null', () => {
        const candles = [
            { time: 't0', open: 1, high: 2, low: 0, close: 1, volume: 100 },
            { time: 't1', open: 1, high: 2, low: 0, close: 1, volume: 100 },
        ];
        const r = calcCMF(candles, { length: 20 });
        assert.strictEqual(r.length, 2);
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('length=3 hand-computed window', () => {
        // bar 0: h=10 l=8  c=9   v=100 → MFM=((9-8)-(10-9))/2=0       → MFV=0
        // bar 1: h=12 l=9  c=11  v=200 → MFM=((11-9)-(12-11))/3=1/3   → MFV≈66.6667
        // bar 2: h=11 l=7  c=8   v=150 → MFM=((8-7)-(11-8))/4=-0.5    → MFV=-75
        // CMF[2] = (0 + 200/3 + -75) / (100+200+150)
        const candles = [
            { time: 't0', open: 9,  high: 10, low: 8, close: 9,  volume: 100 },
            { time: 't1', open: 10, high: 12, low: 9, close: 11, volume: 200 },
            { time: 't2', open: 11, high: 11, low: 7, close: 8,  volume: 150 },
        ];
        const r = calcCMF(candles, { length: 3 });
        assert.strictEqual(r[0].value, null);
        assert.strictEqual(r[1].value, null);
        approxEq(r[2].value, (0 + 200 / 3 + -75) / 450);
    });

    it('high == low for a bar → that bar contributes 0 MFV', () => {
        // bar 0: flat (h==l) → MFV=0, vol=100
        // bar 1: h=12 l=10 c=11 v=200 → MFM=0 → MFV=0
        // bar 2: h=12 l=8  c=12 v=100 → MFM=(4-0)/4=1 → MFV=100
        // CMF[2] = (0 + 0 + 100) / 400 = 0.25
        const candles = [
            { time: 't0', open: 10, high: 10, low: 10, close: 10, volume: 100 },
            { time: 't1', open: 11, high: 12, low: 10, close: 11, volume: 200 },
            { time: 't2', open: 11, high: 12, low: 8,  close: 12, volume: 100 },
        ];
        const r = calcCMF(candles, { length: 3 });
        approxEq(r[2].value, 100 / 400);
    });

    it('Σvolume == 0 in the window → CMF = 0 (.cs guard)', () => {
        const candles = [
            { time: 't0', open: 10, high: 12, low: 8, close: 11, volume: 0 },
            { time: 't1', open: 11, high: 13, low: 9, close: 12, volume: 0 },
            { time: 't2', open: 12, high: 14, low: 10, close: 13, volume: 0 },
        ];
        const r = calcCMF(candles, { length: 3 });
        approxEq(r[2].value, 0);
    });

    it('time field passed through unchanged', () => {
        const candles = [
            { time: 'a', open: 1, high: 2, low: 0, close: 1, volume: 1 },
            { time: 'b', open: 2, high: 3, low: 1, close: 2, volume: 2 },
            { time: 'c', open: 3, high: 4, low: 2, close: 3, volume: 3 },
        ];
        const r = calcCMF(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r[i].time, candles[i].time);
        }
    });
});
