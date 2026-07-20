// OptimalTracking: Kalman-style adaptive midprice smoother.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcOptimalTracking } = require('../../src/chart/indicators/calc/optimaltracking.js');

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

function mk(h, l, i) {
    return { time: `t${i}`, open: (h + l) / 2, high: h, low: l, close: (h + l) / 2, volume: 1 };
}

describe('calcOptimalTracking', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcOptimalTracking([], {}), []);
    });

    it('bar 0 not formed (Length=2) → null; bar 1+ are filtered', () => {
        // DecimalLengthIndicator IsFormed = Buffer.Count == Length (=2), so the
        // first bar is not formed and StockSharp reports null; the filter emits
        // from bar 1 onward.
        const candles = [mk(11, 9, 0), mk(13, 11, 1), mk(14, 12, 2)];
        const r = calcOptimalTracking(candles, {});
        assert.strictEqual(r[0].value, null);
        // r[1] is filtered: alpha*12 + (1-alpha)*10. Just check it's between
        // the seed midprice (10) and the new midprice (12).
        assert.ok(r[1].value > 10 && r[1].value < 12,
            `expected r[1]=${r[1].value} between seed 10 and new 12`);
        assert.notStrictEqual(r[2].value, null);
    });

    it('flat range (high==low) for every bar → output equals that constant', () => {
        // halfRange = 0 means smoothRng eventually = 0; lambda stays at its
        // previous value (initially 0). With lambda=0, alpha=0 → result =
        // resultOld. Since resultOld is seeded to the flat midprice, output
        // stays exactly there forever.
        const v = 100;
        const candles = [];
        for (let i = 0; i < 10; i++) candles.push(mk(v, v, i));
        const r = calcOptimalTracking(candles, {});
        assert.strictEqual(r[0].value, null); // Length=2: first bar not formed
        for (let i = 1; i < 10; i++) approxEq(r[i].value, v);
    });

    it('hand-computed first filtered value at bar 1', () => {
        //   bar 0: H=11, L=9   → avg=10, half=1   (seed: value2Old=1, resultOld=10)
        //   bar 1: H=13, L=11  → avg=12, half=1   (formed; PushBack already
        //                                          made Buffer.Count==2)
        //
        // Bar 1 (main branch):
        //   avgDiff   = avg[1] - avg[0] = 12 - 10 = 2
        //   K1 = exp(-0.25), K0 = 1 - K1
        //   smoothDiff = K0*2 + K1*0 = 2*K0
        //   smoothRng  = K0*1 + K1*1 = 1
        //   lambda     = |smoothDiff / smoothRng| = 2*K0
        //   l2         = lambda*lambda
        //   alpha      = (-l2 + sqrt(l2^2 + 16*l2)) / 8
        //   result     = alpha*12 + (1-alpha)*10
        const k1 = Math.exp(-0.25);
        const k0 = 1 - k1;
        const lam = 2 * k0;
        const l2 = lam * lam;
        const alpha = (-l2 + Math.sqrt(l2 * l2 + 16 * l2)) / 8;
        const expected = alpha * 12 + (1 - alpha) * 10;

        const candles = [mk(11, 9, 0), mk(13, 11, 1), mk(15, 13, 2)];
        const r = calcOptimalTracking(candles, {});
        approxEq(r[1].value, expected, 1e-12);
    });

    it('bad bar (NaN high) → null and state untouched (filter resumes on next good bar)', () => {
        const candles = [
            mk(11, 9, 0),
            mk(13, 11, 1),
            { time: 't2', open: 12, high: NaN, low: 11, close: 12, volume: 1 },
            mk(15, 13, 3),
        ];
        const r = calcOptimalTracking(candles, {});
        assert.strictEqual(r[0].value, null); // Length=2: first bar not formed
        // r[1] is no longer the raw midprice — it's the first filtered value
        // (see "hand-computed first filtered value at bar 1" above). Just
        // assert it's between 10 and 12.
        assert.ok(r[1].value > 10 && r[1].value < 12);
        assert.strictEqual(r[2].value, null);
        // r[3] should be the same as if we'd just had bars 0,1,3 in sequence.
        // Compute expected against [mk(11,9), mk(13,11), mk(15,13)]:
        const baseline = calcOptimalTracking([mk(11, 9, 0), mk(13, 11, 1), mk(15, 13, 2)], {});
        approxEq(r[3].value, baseline[2].value, 1e-12);
    });

    it('time field passed through unchanged; output length matches input', () => {
        const candles = [mk(11, 9, 0), mk(13, 11, 1), mk(15, 13, 2), mk(14, 12, 3)];
        const r = calcOptimalTracking(candles, {});
        assert.strictEqual(r.length, 4);
        for (let i = 0; i < 4; i++) assert.strictEqual(r[i].time, `t${i}`);
    });
});
