// Coverage for the pure math helpers underneath every indicator.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { simpleMA, wilderMA, smoothedMA, wilderWMA } = require('../../src/chart/indicators/calc/helpers.js');

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('simpleMA', () => {
    it('length=3 over [1,2,3,4,5,6] gives [null,null,2,3,4,5]', () => {
        assert.deepStrictEqual(simpleMA([1, 2, 3, 4, 5, 6], 3), [null, null, 2, 3, 4, 5]);
    });

    it('length=1 is identity', () => {
        assert.deepStrictEqual(simpleMA([10, 20, 30], 1), [10, 20, 30]);
    });

    it('length larger than input → all nulls', () => {
        assert.deepStrictEqual(simpleMA([1, 2], 5), [null, null]);
    });

    it('empty input → empty output', () => {
        assert.deepStrictEqual(simpleMA([], 3), []);
    });

    it('NaN inside window propagates to null for that slot only', () => {
        const out = simpleMA([1, 2, NaN, 4, 5, 6], 3);
        // Indexes 2,3,4 each see the NaN in their trailing window.
        assert.strictEqual(out[0], null);
        assert.strictEqual(out[1], null);
        assert.strictEqual(out[2], null);
        assert.strictEqual(out[3], null);
        assert.strictEqual(out[4], null);
        assert.strictEqual(out[5], 5);
    });
});

describe('wilderMA', () => {
    it('seed equals SMA of first N values', () => {
        const out = wilderMA([2, 4, 6, 8, 10], 5);
        assert.deepStrictEqual(out.slice(0, 4), [null, null, null, null]);
        assert.strictEqual(out[4], 6); // mean of 2..10
    });

    it('recursion follows (prev*(N-1) + x)/N', () => {
        const len = 3;
        const xs = [3, 6, 9, 12, 15];
        const out = wilderMA(xs, len);
        // seed = (3+6+9)/3 = 6
        assert.strictEqual(out[2], 6);
        // next = (6*2 + 12)/3 = 8
        assert.strictEqual(out[3], 8);
        // next = (8*2 + 15)/3 = 31/3
        assert.strictEqual(out[4], 31 / 3);
    });

    it('length larger than input → all nulls', () => {
        assert.deepStrictEqual(wilderMA([1, 2, 3], 5), [null, null, null]);
    });

    it('empty input → empty output', () => {
        assert.deepStrictEqual(wilderMA([], 3), []);
    });
});

describe('smoothedMA', () => {
    it('emits a value from index 0 (Sum/L during warmup)', () => {
        // Mirrors C# SmoothedMovingAverage: each call returns Buffer.Sum / Length
        // until Buffer.Count >= Length, then Wilder recursion.
        const out = smoothedMA([3, 6, 9], 3);
        // i=0: sum=3, return 3/3 = 1.
        // i=1: sum=9, return 9/3 = 3.
        // i=2: sum=18, return 18/3 = 6. (now formed)
        approxEq(out[0], 1);
        approxEq(out[1], 3);
        approxEq(out[2], 6);
    });

    it('after warmup uses Wilder recursion prev*(N-1)/N + x/N', () => {
        const out = smoothedMA([3, 6, 9, 12, 15], 3);
        // seed at i=2: 18/3 = 6.
        // i=3: (6*2 + 12)/3 = 8.
        // i=4: (8*2 + 15)/3 = 31/3.
        approxEq(out[2], 6);
        approxEq(out[3], 8);
        approxEq(out[4], 31 / 3);
    });

    it('NaN/null inputs produce null without advancing buffer', () => {
        const out = smoothedMA([1, NaN, 3], 3);
        // i=0: sum=1, return 1/3.
        // i=1: NaN → null, buffer unchanged.
        // i=2: sum=4 (1+3), return 4/3.
        approxEq(out[0], 1 / 3);
        assert.strictEqual(out[1], null);
        approxEq(out[2], 4 / 3);
    });

    it('empty input or length<=0 → empty/null output', () => {
        assert.deepStrictEqual(smoothedMA([], 3), []);
        assert.deepStrictEqual(smoothedMA([1, 2, 3], 0), [null, null, null]);
    });
});

describe('wilderWMA', () => {
    it('emits a value from index 0 using growing divisor (1, 2, ..., L)', () => {
        // Mirrors C# WilderMovingAverage: (prev*(count-1) + new) / count
        // with count = min(callIndex+1, length).
        const out = wilderWMA([10, 20, 30], 3);
        // i=0: count=1, (0*0 + 10)/1 = 10.
        // i=1: count=2, (10*1 + 20)/2 = 15.
        // i=2: count=3, (15*2 + 30)/3 = 20.
        approxEq(out[0], 10);
        approxEq(out[1], 15);
        approxEq(out[2], 20);
    });

    it('count caps at length after L pushes', () => {
        const out = wilderWMA([10, 20, 30, 40, 50], 3);
        // After i=2: count=3 (capped), prev=20.
        // i=3: count=3, (20*2 + 40)/3 = 80/3.
        // i=4: count=3, ((80/3)*2 + 50)/3 = ((160/3)+50)/3 = (310/3)/3 = 310/9.
        approxEq(out[3], 80 / 3);
        approxEq(out[4], 310 / 9);
    });

    it('NaN/null inputs produce null and do not advance', () => {
        const out = wilderWMA([10, NaN, 30], 3);
        approxEq(out[0], 10);
        assert.strictEqual(out[1], null);
        // i=2: count=2 (only 2 valid pushes so far), (10*1 + 30)/2 = 20.
        approxEq(out[2], 20);
    });

    it('empty input or length<=0 → empty/null output', () => {
        assert.deepStrictEqual(wilderWMA([], 3), []);
        assert.deepStrictEqual(wilderWMA([1, 2, 3], 0), [null, null, null]);
    });
});
