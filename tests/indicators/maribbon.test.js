// MovingAverageRibbon: N SMAs at lengths spaced linearly from short..long.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcMovingAverageRibbon } =
    require('../../src/chart/indicators/calc/maribbon.js');

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `t${i}`,
        open: c, high: c, low: c, close: c, volume: 0,
    }));
}

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcMovingAverageRibbon', () => {
    it('defaults (10/100/10) produce lengths [10,20,30,40,50,60,70,80,90,100]', () => {
        const r = calcMovingAverageRibbon([]);
        assert.deepStrictEqual(r.lengths, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
        assert.strictEqual(r.averages.length, 10);
    });

    it('step uses C# integer division (truncated)', () => {
        // (99-10)/9 = 9 (int) → 10,19,28,37,46,55,64,73,82,91
        const r = calcMovingAverageRibbon([], {
            shortPeriod: 10, longPeriod: 99, ribbonCount: 10,
        });
        assert.deepStrictEqual(r.lengths, [10, 19, 28, 37, 46, 55, 64, 73, 82, 91]);
    });

    it('throws on invalid ribbonCount < 2 or periods < 1', () => {
        assert.throws(() => calcMovingAverageRibbon([], { ribbonCount: 1 }));
        assert.throws(() => calcMovingAverageRibbon([], { shortPeriod: 0 }));
        assert.throws(() => calcMovingAverageRibbon([], { longPeriod: 0 }));
    });

    it('Sequence cascade: each SMA smooths the previous formed output', () => {
        // closes = 1..30. SMA3(close)[i]=i; feeding SMA5 the formed SMA3 output
        // from bar 2 gives SMA5[i]=i-2; then SMA7[i]=i-5; then SMA9[i]=i-9.
        const candles = makeCandles(Array.from({ length: 30 }, (_, i) => i + 1));
        const r = calcMovingAverageRibbon(candles, {
            shortPeriod: 3, longPeriod: 9, ribbonCount: 4,
        });
        // step=(9-3)/3=2 → lengths [3,5,7,9]
        assert.deepStrictEqual(r.lengths, [3, 5, 7, 9]);
        // stage 0 = SMA3(close)
        approxEq(r.averages[0][2].value, 2);
        approxEq(r.averages[0][10].value, 10);
        // stage 1 = SMA5(stage0), fed from bar 2 → i-2 from bar 6
        assert.strictEqual(r.averages[1][5].value, null);
        approxEq(r.averages[1][6].value, 4);
        approxEq(r.averages[1][15].value, 13);
        // stage 2 = SMA7(stage1), fed from bar 6 → i-5 from bar 12
        assert.strictEqual(r.averages[2][11].value, null);
        approxEq(r.averages[2][12].value, 7);
        approxEq(r.averages[2][20].value, 15);
        // stage 3 = SMA9(stage2), fed from bar 12 → i-9 from bar 20
        assert.strictEqual(r.averages[3][19].value, null);
        approxEq(r.averages[3][20].value, 11);
        approxEq(r.averages[3][29].value, 20);
        // time passthrough
        assert.strictEqual(r.averages[0][10].time, candles[10].time);
    });

    it('empty candles → empty per-line arrays but lengths still computed', () => {
        const r = calcMovingAverageRibbon([], { shortPeriod: 2, longPeriod: 6, ribbonCount: 3 });
        // step=(6-2)/2=2 → [2,4,6]
        assert.deepStrictEqual(r.lengths, [2, 4, 6]);
        for (const s of r.averages) assert.deepStrictEqual(s, []);
    });

    it('cascade warm-up: each line forms further out than the previous one', () => {
        const candles = makeCandles(Array.from({ length: 25 }, (_, i) => i + 1));
        const r = calcMovingAverageRibbon(candles, {
            shortPeriod: 3, longPeriod: 9, ribbonCount: 4,
        });
        // lengths [3,5,7,9]; Sequence cascade → firstFormed[0]=len0-1 and
        // firstFormed[k]=firstFormed[k-1]+(len[k]-1) → [2,6,12,20].
        const expectFirst = [2, 6, 12, 20];
        for (let s = 0; s < r.lengths.length; s++) {
            const ff = expectFirst[s];
            assert.strictEqual(r.averages[s][ff - 1].value, null, `line ${s} null at ${ff - 1}`);
            assert.notStrictEqual(r.averages[s][ff].value, null, `line ${s} non-null at ${ff}`);
        }
    });
});
