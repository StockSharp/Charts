// FRAMA: warm-up gate at length-1, output equals close on a perfect trend (d=1).

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcFRAMA } = require('../../src/chart/indicators/calc/frama.js');

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

function makeCloses(closes) {
    return closes.map((c, i) => ({
        time: `t${i}`,
        open: c, high: c, low: c, close: c, volume: 0,
    }));
}

describe('calcFRAMA', () => {
    it('empty candles → empty array', () => {
        assert.deepStrictEqual(calcFRAMA([], { length: 20 }), []);
    });

    it('fewer candles than length → all-null output of correct length', () => {
        const candles = makeCloses([1, 2, 3, 4, 5]);
        const r = calcFRAMA(candles, { length: 20 });
        assert.strictEqual(r.length, 5);
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('length=1 or 2 (period == 0) → never formed → all null', () => {
        const candles = makeCloses([1, 2, 3, 4, 5, 6, 7, 8]);
        const r1 = calcFRAMA(candles, { length: 1 });
        const r2 = calcFRAMA(candles, { length: 2 });
        for (const p of r1) assert.strictEqual(p.value, null);
        for (const p of r2) assert.strictEqual(p.value, null);
    });

    it('time field passed through unchanged', () => {
        const candles = makeCloses([1, 2, 3, 4, 5, 6]);
        const r = calcFRAMA(candles, { length: 3 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r[i].time, candles[i].time);
        }
    });

    it('linear ramp: d ≈ 1, alpha = 1 → frama tracks close (first formed bar at index length-1)', () => {
        // Length=6, period=2. With closes 1..N:
        //   slice1 = [c0,c1] → range 1, n1 = 0.5
        //   slice2 = [c2,c3] → range 1, n2 = 0.5
        //   slice3 = [c4,c5] → range 1 over 2 entries, n3 = 0.5
        //   d = (log(1) - log(0.5)) / log(2) = 1
        //   alpha = exp(0) = 1 → frama = close
        const length = 6;
        const candles = makeCloses([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        const r = calcFRAMA(candles, { length });
        for (let i = 0; i < length - 1; i++) assert.strictEqual(r[i].value, null);
        // d = 1 exactly → frama_i = close_i once the buffer has been formed.
        // (The first formed bar is i = length - 1 = 5, close = 6.)
        for (let i = length - 1; i < candles.length; i++) {
            approxEq(r[i].value, candles[i].close);
        }
    });

    it('flat close series after warm-up: frama converges to flat value', () => {
        // First (length-1) bars null. From bar length-1 onward all slices
        // are zero-range → n1=n2=n3=0 → d = NaN, our fallback uses d=1 → alpha=1
        // → frama = close. Result: flat 42 from bar length-1.
        const length = 6;
        const candles = makeCloses(new Array(20).fill(42));
        const r = calcFRAMA(candles, { length });
        for (let i = 0; i < length - 1; i++) assert.strictEqual(r[i].value, null);
        for (let i = length - 1; i < candles.length; i++) {
            approxEq(r[i].value, 42);
        }
    });
});
