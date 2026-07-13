// Approval Flow Index — cumulative up/down volume oscillator.
// See approvalflowindex.js header for the .cs quirk where prevClose
// freezes once IsFormed flips.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcApprovalFlowIndex } = require('../../src/chart/indicators/calc/approvalflowindex.js');

function makeCandles(rows) {
    // rows: [close, volume]
    return rows.map((r, i) => ({
        time: `t${i}`, open: r[0], high: r[0], low: r[0], close: r[0], volume: r[1],
    }));
}

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcApprovalFlowIndex', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcApprovalFlowIndex([], { length: 14 }), []);
    });

    it('length larger than candles → every value null', () => {
        const candles = makeCandles([[10, 100], [11, 100], [12, 100]]);
        const r = calcApprovalFlowIndex(candles, { length: 14 });
        assert.strictEqual(r.length, 3);
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('output length matches input and time is passed through', () => {
        const candles = makeCandles([
            [10, 100], [11, 100], [12, 100], [13, 100], [14, 100],
        ]);
        const r = calcApprovalFlowIndex(candles, { length: 3 });
        assert.strictEqual(r.length, candles.length);
        for (let i = 0; i < candles.length; i++) assert.strictEqual(r[i].time, candles[i].time);
    });

    it('monotonic up series → AFI saturates at +100 once formed', () => {
        // closes: 10..15, length=3. Seed = bar0. Bars 1,2 ramp count. Bar 3
        // is the first formed. All deltas positive, all volume is "up".
        const candles = makeCandles([[10, 100], [11, 100], [12, 100], [13, 100], [14, 100], [15, 100]]);
        const r = calcApprovalFlowIndex(candles, { length: 3 });
        for (let i = 0; i < 3; i++) assert.strictEqual(r[i].value, null);
        for (let i = 3; i < r.length; i++) approxEq(r[i].value, 100);
    });

    it('monotonic down series → AFI saturates at -100 once formed', () => {
        const candles = makeCandles([[10, 50], [9, 50], [8, 50], [7, 50], [6, 50]]);
        const r = calcApprovalFlowIndex(candles, { length: 2 });
        // Bar 0 seed (null). Bar 1 count=1 (null). Bar 2 forms.
        assert.strictEqual(r[0].value, null);
        assert.strictEqual(r[1].value, null);
        for (let i = 2; i < r.length; i++) approxEq(r[i].value, -100);
    });

    it('hand-computed prevClose-freeze quirk', () => {
        // length=2. closes: [10, 12, 10, 14, 8], all vol=100.
        // Bar 0: seed prevClose=10. null.
        // Bar 1: count=1. close=12 > 10 → up+=100. totalUp=100, totalDn=0.
        //        not formed. prevClose=12.
        // Bar 2: count=2 → formed. close=10 < 12 → down+=100.
        //        totalUp=100, totalDn=100. AFI=0. prevClose FROZEN at 12.
        // Bar 3: formed. close=14 > 12 → up+=100. totalUp=200, totalDn=100.
        //        AFI = 100*(200-100)/300 = 33.333…  prevClose still 12.
        // Bar 4: formed. close=8 < 12 → down+=100. totalUp=200, totalDn=200.
        //        AFI = 0.
        const candles = makeCandles([[10, 100], [12, 100], [10, 100], [14, 100], [8, 100]]);
        const r = calcApprovalFlowIndex(candles, { length: 2 });
        assert.strictEqual(r[0].value, null);
        assert.strictEqual(r[1].value, null);
        approxEq(r[2].value, 0);
        approxEq(r[3].value, 100 / 3, 1e-9);
        approxEq(r[4].value, 0);
    });

    it('zero-volume bars → AFI=null when totals sum to zero', () => {
        // Even with deltas, if every up/down volume is 0, totals stay 0.
        const candles = makeCandles([[10, 0], [11, 0], [12, 0], [13, 0]]);
        const r = calcApprovalFlowIndex(candles, { length: 2 });
        // Once formed, totalUp+totalDn==0 → emit null per .cs.
        for (let i = 2; i < r.length; i++) assert.strictEqual(r[i].value, null);
    });
});
