// Demand Index: empty/oversize warm-up + hand-computed reference + null
// passthrough on zero-delta bars.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcDemandIndex } = require('../../src/chart/indicators/calc/demandindex.js');

function makeCandles(cv) {
    // cv = [[close, volume], ...]
    return cv.map((p, i) => ({
        time: `t${i}`, open: p[0], high: p[0], low: p[0], close: p[0], volume: p[1],
    }));
}

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcDemandIndex', () => {
    it('empty → empty', () => {
        assert.deepStrictEqual(calcDemandIndex([], { length: 14 }), []);
    });

    it('length too big → all null', () => {
        const r = calcDemandIndex(makeCandles([[1,10],[2,11],[3,12]]), { length: 14 });
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('first non-null at index >= length (zero deltas push out warm-up)', () => {
        // length=2: ideally first formed at i=2 (bar 0 init, bars 1,2 → 2 samples).
        const r = calcDemandIndex(makeCandles([[1,10],[2,11],[3,12]]), { length: 2 });
        assert.strictEqual(r[0].value, null);
        assert.strictEqual(r[1].value, null);
        assert.notStrictEqual(r[2].value, null);
    });

    it('hand-computed length=1 reference', () => {
        // length=1 means SMA emits each raw demand value verbatim.
        // closes = 1,2,4 ; volumes = 10,20,40.
        // i=0: init. i=1: dP=1, dV=10 → logs:0, log(10) ≈ 2.302585
        //   a = 0 * 2.302585 = 0
        //   b = 0 - 2.302585 = -2.302585
        //   raw = 0/b = 0, sign(dP)=1 → 0
        // i=2: dP=2, dV=20 → logs: log2≈0.693147, log20≈2.995732
        //   a = 0.693147 * 2.995732 ≈ 2.07666
        //   b = 0.693147 - 2.995732 ≈ -2.302585
        //   raw = a/b ≈ -0.90168, sign(dP)=1 → -0.90168
        const r = calcDemandIndex(makeCandles([[1,10],[2,20],[4,40]]), { length: 1 });
        assert.strictEqual(r[0].value, null);
        approxEq(r[1].value, 0, 1e-12);
        const expected = (Math.log(2) * Math.log(20)) / (Math.log(2) - Math.log(20));
        approxEq(r[2].value, expected, 1e-9);
    });

    it('zero deltaP bars are skipped: SMA does not advance, output reuses prev value', () => {
        // length=1. closes=[1,2,2,3], volumes=[10,20,20,30]
        // i=1: dP=1, dV=10 → raw=0 (logDP=0). SMA len=1 → prevValue=0.
        // i=2: dP=0 → skip. Output prevValue=0.
        // i=3: dP=1, dV=10 (prevVol updated to 20 at i=2) → wait, .cs only
        //   updates prevVol on final input, but here at i=2 it WAS updated
        //   via the early-return branch. So at i=3: dP=3-2=1, dV=30-20=10.
        //   Same as i=1 → raw=0.
        const r = calcDemandIndex(makeCandles([[1,10],[2,20],[2,20],[3,30]]), { length: 1 });
        assert.strictEqual(r[0].value, null);
        approxEq(r[1].value, 0, 1e-12);
        approxEq(r[2].value, 0, 1e-12);
        approxEq(r[3].value, 0, 1e-12);
    });

    it('time field passed through unchanged', () => {
        const candles = makeCandles([[1,10],[2,20],[3,30],[4,40]]);
        const r = calcDemandIndex(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r[i].time, candles[i].time);
        }
    });
});
