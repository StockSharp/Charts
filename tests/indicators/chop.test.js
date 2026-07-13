// Choppiness Index — log10(sumTR / sumHLR) scaled by log10(length).

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcChoppinessIndex } = require('../../src/chart/indicators/calc/chop.js');

function makeCandles(rows) {
    // rows: [high, low, close]  (open defaults to close)
    return rows.map((r, i) => ({
        time: `t${i}`, open: r[2], high: r[0], low: r[1], close: r[2], volume: 0,
    }));
}

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcChoppinessIndex', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcChoppinessIndex([], { length: 14 }), []);
    });

    it('length larger than candles → every value null', () => {
        const r = calcChoppinessIndex(makeCandles([
            [10, 8, 9], [11, 9, 10], [12, 10, 11],
        ]), { length: 14 });
        assert.strictEqual(r.length, 3);
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('length=1 → log10(1)=0 in denominator → all null (undefined)', () => {
        const r = calcChoppinessIndex(makeCandles([[10, 8, 9], [11, 9, 10]]), { length: 1 });
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('output length matches input and time is passed through', () => {
        const candles = makeCandles([
            [10, 8, 9], [11, 9, 10], [12, 10, 11], [13, 11, 12], [14, 12, 13],
        ]);
        const r = calcChoppinessIndex(candles, { length: 3 });
        assert.strictEqual(r.length, candles.length);
        for (let i = 0; i < candles.length; i++) assert.strictEqual(r[i].time, candles[i].time);
    });

    it('warm-up: first non-null at index length-1 (once bar 0 quirk slides out)', () => {
        // Note: bar 0's TR is poisoned by prevClose=0 (see chop.js header).
        // The "first non-null" check still applies — output emits at i=length-1.
        const candles = makeCandles([
            [10, 8, 9], [11, 9, 10], [12, 10, 11], [13, 11, 12],
        ]);
        const r = calcChoppinessIndex(candles, { length: 3 });
        assert.strictEqual(r[0].value, null);
        assert.strictEqual(r[1].value, null);
        assert.notStrictEqual(r[2].value, null);
    });

    it('strong trend (no gaps after bar 0) → CI tends low once bar-0 noise expires', () => {
        // After bar 0 slides out of the window, for a strict-uptrend with
        // no gaps (each bar's high >= prevClose >= low), TR collapses to
        // HLR → ratio = 1 → CI = 0.
        const rows = [];
        // bar 0 close=9 then bar 1 high=11>=9, low=9<=9, so TR = 11-9 = 2 = HLR.
        // From bar 1 onward each bar's [low, high] straddles prevClose, so TR == HLR.
        for (let i = 0; i < 10; i++) rows.push([10 + i, 8 + i, 9 + i]);
        const r = calcChoppinessIndex(makeCandles(rows), { length: 3 });
        // Pick a bar where the window starts at bar 1 or later (i >= 3) and
        // every contained bar has TR == HLR.
        for (let i = 3; i < rows.length; i++) {
            approxEq(r[i].value, 0, 1e-12);
        }
    });

    it('hand-computed: length=2 on simple two-bar window', () => {
        // bar 0: H=10 L=8 close=9 → HLR=2, prevClose=0 → TR=max(2,10,8)=10
        // bar 1: H=11 L=9 close=10 → HLR=2, prevClose=9 → TR=max(2,2,0)=2
        // window [0..1]: sumHLR=4, sumTR=12, ratio=3, CI=100*log10(3)/log10(2)
        const r = calcChoppinessIndex(makeCandles([[10, 8, 9], [11, 9, 10]]), { length: 2 });
        const expected = 100 * Math.log10(3) / Math.log10(2);
        approxEq(r[1].value, expected, 1e-9);
    });

    it('flat bars with no movement → HLR=0 → CI = null (avoid division by zero)', () => {
        // For high==low==close bars, HLR=0 and TR=|H-prevClose|. sumHLR=0
        // → ratio undefined → null. (The .cs `sumHighLowRange > 0` guard.)
        const rows = [[5, 5, 5], [5, 5, 5], [5, 5, 5], [5, 5, 5]];
        const r = calcChoppinessIndex(makeCandles(rows), { length: 2 });
        for (const p of r) assert.strictEqual(p.value, null);
    });
});
