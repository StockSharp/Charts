// PivotPoints: per-bar PP/R1/R2/S1/S2 levels from H, L, C.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcPivotPoints } = require('../../src/chart/indicators/calc/pivotpoints.js');

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

function mk(h, l, c, i) {
    return { time: `t${i}`, open: (h + l) / 2, high: h, low: l, close: c, volume: 1 };
}

describe('calcPivotPoints', () => {
    it('empty candles → all five series empty', () => {
        assert.deepStrictEqual(calcPivotPoints([], {}), {
            pp: [], r1: [], r2: [], s1: [], s2: [],
        });
    });

    it('hand-computed single bar', () => {
        // H=110, L=90, C=105.
        //   pivot = (110+90+105)/3 = 305/3 ≈ 101.6666...
        //   range = 20
        //   R1 = 2*101.6666 - 90 = 113.3333...
        //   R2 = 101.6666 + 20  = 121.6666...
        //   S1 = 2*101.6666 - 110 = 93.3333...
        //   S2 = 101.6666 - 20  = 81.6666...
        const r = calcPivotPoints([mk(110, 90, 105, 0)], {});
        const pivot = (110 + 90 + 105) / 3;
        approxEq(r.pp[0].value, pivot);
        approxEq(r.r1[0].value, 2 * pivot - 90);
        approxEq(r.r2[0].value, pivot + 20);
        approxEq(r.s1[0].value, 2 * pivot - 110);
        approxEq(r.s2[0].value, pivot - 20);
    });

    it('level ordering: S2 ≤ S1 ≤ PP ≤ R1 ≤ R2 for every normal candle (C inside [L,H])', () => {
        const candles = [];
        for (let i = 0; i < 20; i++) {
            const h = 100 + i;
            const l = 90 + i;
            const c = 95 + i;
            candles.push(mk(h, l, c, i));
        }
        const r = calcPivotPoints(candles, {});
        for (let i = 0; i < candles.length; i++) {
            const pp = r.pp[i].value;
            const r1 = r.r1[i].value;
            const r2 = r.r2[i].value;
            const s1 = r.s1[i].value;
            const s2 = r.s2[i].value;
            assert.ok(s2 <= s1, `bar ${i}: s2(${s2}) > s1(${s1})`);
            assert.ok(s1 <= pp, `bar ${i}: s1(${s1}) > pp(${pp})`);
            assert.ok(pp <= r1, `bar ${i}: pp(${pp}) > r1(${r1})`);
            assert.ok(r1 <= r2, `bar ${i}: r1(${r1}) > r2(${r2})`);
        }
    });

    it('shape consistency: all five arrays have same length as input; timestamps aligned', () => {
        const candles = [];
        for (let i = 0; i < 7; i++) candles.push(mk(100 + i, 90 + i, 95 + i, i));
        const r = calcPivotPoints(candles, {});
        assert.strictEqual(r.pp.length, 7);
        assert.strictEqual(r.r1.length, 7);
        assert.strictEqual(r.r2.length, 7);
        assert.strictEqual(r.s1.length, 7);
        assert.strictEqual(r.s2.length, 7);
        for (let i = 0; i < 7; i++) {
            const t = candles[i].time;
            assert.strictEqual(r.pp[i].time, t);
            assert.strictEqual(r.r1[i].time, t);
            assert.strictEqual(r.r2[i].time, t);
            assert.strictEqual(r.s1[i].time, t);
            assert.strictEqual(r.s2[i].time, t);
        }
    });

    it('bad bar (NaN close) → null on all five series for that slot', () => {
        const candles = [
            mk(110, 90, 105, 0),
            { time: 't1', open: 100, high: 105, low: 95, close: NaN, volume: 1 },
            mk(120, 100, 115, 2),
        ];
        const r = calcPivotPoints(candles, {});
        assert.notStrictEqual(r.pp[0].value, null);
        assert.strictEqual(r.pp[1].value, null);
        assert.strictEqual(r.r1[1].value, null);
        assert.strictEqual(r.r2[1].value, null);
        assert.strictEqual(r.s1[1].value, null);
        assert.strictEqual(r.s2[1].value, null);
        assert.notStrictEqual(r.pp[2].value, null);
    });

    it('flat candle (H==L==C) → PP=R1=R2=S1=S2 (all collapse to that constant)', () => {
        const r = calcPivotPoints([mk(50, 50, 50, 0)], {});
        approxEq(r.pp[0].value, 50);
        approxEq(r.r1[0].value, 50);
        approxEq(r.r2[0].value, 50);
        approxEq(r.s1[0].value, 50);
        approxEq(r.s2[0].value, 50);
    });
});
