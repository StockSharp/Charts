// Accumulation/Distribution Line: cumulative MFV with carry-forward on
// bad bars / zero range.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcADL } = require('../../src/chart/indicators/calc/adl.js');

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcADL', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcADL([], {}), []);
    });

    it('hand-computed three-bar cumulative MFV', () => {
        // bar 0: h=10 l=8  c=9   v=100 → MFM=((9-8)-(10-9))/2 = 0 → MFV=0
        // bar 1: h=12 l=9  c=11  v=200 → MFM=((11-9)-(12-11))/3 = 1/3 → MFV≈66.6667
        // bar 2: h=11 l=7  c=8   v=150 → MFM=((8-7)-(11-8))/4 = -2/4 = -0.5 → MFV=-75
        const candles = [
            { time: 't0', open: 9, high: 10, low: 8, close: 9, volume: 100 },
            { time: 't1', open: 10, high: 12, low: 9, close: 11, volume: 200 },
            { time: 't2', open: 11, high: 11, low: 7, close: 8, volume: 150 },
        ];
        const r = calcADL(candles, {});
        approxEq(r[0].value, 0);
        approxEq(r[1].value, 0 + 200 / 3);
        approxEq(r[2].value, 200 / 3 + (-75));
    });

    it('high == low carries previous ADL forward (MFV contribution = 0)', () => {
        const candles = [
            { time: 't0', open: 10, high: 12, low: 8, close: 11, volume: 100 },
            { time: 't1', open: 11, high: 11, low: 11, close: 11, volume: 200 }, // flat
            { time: 't2', open: 11, high: 13, low: 9, close: 12, volume: 100 },
        ];
        const r = calcADL(candles, {});
        // bar 0: MFM=((11-8)-(12-11))/4 = 2/4 = 0.5 → MFV=50
        // bar 1: flat → no change
        // bar 2: MFM=((12-9)-(13-12))/4 = 2/4 = 0.5 → MFV=50 → adl=100
        approxEq(r[0].value, 50);
        approxEq(r[1].value, 50);
        approxEq(r[2].value, 100);
    });

    it('NaN volume carries previous ADL forward', () => {
        const candles = [
            { time: 't0', open: 10, high: 12, low: 8, close: 11, volume: 100 },
            { time: 't1', open: 11, high: 13, low: 9, close: 12, volume: NaN }, // bad volume
            { time: 't2', open: 12, high: 14, low: 10, close: 13, volume: 100 },
        ];
        const r = calcADL(candles, {});
        // bar 0: MFV=50
        // bar 1: NaN volume → skip
        // bar 2: MFM=((13-10)-(14-13))/4 = 0.5 → MFV=50 → adl=100
        approxEq(r[0].value, 50);
        approxEq(r[1].value, 50);
        approxEq(r[2].value, 100);
    });

    it('output length matches candles[] and time is passed through', () => {
        const candles = [
            { time: 'a', open: 1, high: 2, low: 1, close: 1.5, volume: 10 },
            { time: 'b', open: 2, high: 3, low: 1, close: 2.5, volume: 20 },
        ];
        const r = calcADL(candles, {});
        assert.strictEqual(r.length, 2);
        assert.strictEqual(r[0].time, 'a');
        assert.strictEqual(r[1].time, 'b');
    });
});
