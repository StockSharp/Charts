// Center of Gravity Oscillator: shape, warm-up, hand-computed window,
// constant-series invariant.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcCOG } = require('../../src/chart/indicators/calc/cog.js');

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `2025-01-01T00:${String(i).padStart(2, '0')}:00Z`,
        open: c, high: c, low: c, close: c, volume: 0,
    }));
}

describe('calcCOG', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcCOG([], { length: 10 }), []);
    });

    it('length larger than data → every value null', () => {
        const r = calcCOG(makeCandles([1, 2, 3]), { length: 10 });
        assert.strictEqual(r.length, 3);
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('first (length-1) outputs null', () => {
        const r = calcCOG(makeCandles([1, 2, 3, 4, 5]), { length: 3 });
        assert.strictEqual(r[0].value, null);
        assert.strictEqual(r[1].value, null);
        assert.notStrictEqual(r[2].value, null);
    });

    it('constant series → CGO == 0 once warmed up', () => {
        // For close=k constant, sumWeighted = k * Σ(1..L) = k*L*(L+1)/2,
        // sumPrice = k*L. Ratio = (L+1)/2 = part. So CGO = 0.
        const closes = new Array(10).fill(7);
        const r = calcCOG(makeCandles(closes), { length: 4 });
        for (let i = 0; i < 3; i++) assert.strictEqual(r[i].value, null);
        for (let i = 3; i < 10; i++) approxEq(r[i].value, 0);
    });

    it('hand-computed window: length=3, closes=[1,2,3,4]', () => {
        // window at i=2: [1,2,3], weights [1,2,3]
        //   sumWeighted = 1+4+9 = 14; sumPrice = 6; ratio = 14/6 ≈ 2.3333
        //   part = (3+1)/2 = 2; CGO = 14/6 - 2 = 1/3
        // window at i=3: [2,3,4]
        //   sumWeighted = 2+6+12 = 20; sumPrice = 9; ratio = 20/9 ≈ 2.2222
        //   CGO = 20/9 - 2 = 2/9
        const r = calcCOG(makeCandles([1, 2, 3, 4]), { length: 3 });
        approxEq(r[2].value, 14 / 6 - 2);
        approxEq(r[3].value, 20 / 9 - 2);
    });

    it('rising series puts CGO above zero (mass shifted toward newer/heavier weights)', () => {
        // For a strictly increasing window, the weighted ratio > unweighted
        // mean position, so CGO > 0.
        const r = calcCOG(makeCandles([1, 2, 3, 4, 5, 6, 7, 8]), { length: 5 });
        for (let i = 4; i < 8; i++) {
            assert.ok(r[i].value > 0, `expected CGO[${i}]=${r[i].value} > 0`);
        }
    });

    it('time field passed through unchanged', () => {
        const candles = makeCandles([1, 2, 3, 4, 5]);
        const r = calcCOG(candles, { length: 3 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r[i].time, candles[i].time);
        }
    });
});
