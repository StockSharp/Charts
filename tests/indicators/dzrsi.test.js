// Dynamic Zones RSI: empty/oversize warm-up + clamping + linear remap of
// RSI to [0..100] using a trailing-window OS/OB band.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcDZRSI } = require('../../src/chart/indicators/calc/dzrsi.js');

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `t${i}`, open: c, high: c, low: c, close: c, volume: 0,
    }));
}

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcDZRSI', () => {
    it('empty → empty', () => {
        assert.deepStrictEqual(calcDZRSI([], { length: 14 }), []);
    });

    it('length too big → all null', () => {
        // length=14 needs 2*length=28 candles before first non-null.
        const closes = [];
        for (let i = 1; i <= 20; i++) closes.push(i);
        const r = calcDZRSI(makeCandles(closes), { length: 14 });
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('first non-null at index >= 2*length-1', () => {
        // length=3: RSI first at i=3, then need 3 RSI samples to fill
        // dynamic buffer → first at i=5 (= 2*3 - 1).
        const r = calcDZRSI(makeCandles([1,2,3,4,5,6,7,8]), { length: 3 });
        for (let i = 0; i < 5; i++) assert.strictEqual(r[i].value, null);
        assert.notStrictEqual(r[5].value, null);
    });

    it('monotonically rising closes → RSI=100 across the buffer; the .cs `<=` check wins ⇒ output 0', () => {
        // Constant RSI=100 ⇒ min=max=100 ⇒ range=0 ⇒ dynOS=dynOB=100.
        // .cs evaluates `if (rsi <= dynamicOversold)` FIRST, so rsi=100,
        // dynOS=100 ⇒ output 0. This is a faithful port — even if it's
        // a degenerate corner case.
        const closes = [];
        for (let i = 1; i <= 10; i++) closes.push(i);
        const r = calcDZRSI(makeCandles(closes), { length: 3 });
        for (let i = 5; i < r.length; i++) assert.strictEqual(r[i].value, 0);
    });

    it('clamping at the oversold/overbought thresholds', () => {
        // Build a series where RSI varies enough to populate the buffer
        // with distinct min/max. Then check that:
        //   * rsi at min ⇒ 0
        //   * rsi at max ⇒ 100
        //   * mid-range rsi remaps linearly
        // Use closes that go up-then-down sharply.
        const r = calcDZRSI(
            makeCandles([1, 2, 3, 4, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6, 7]),
            { length: 3, oversoldLevel: 0, overboughtLevel: 100 },
        );
        // With OS=0, OB=100: dynOS=min, dynOB=max, range=max-min,
        // remap = (rsi - min) / (max - min) * 100. For each formed bar
        // the result is bounded by [0, 100].
        for (let i = 5; i < r.length; i++) {
            if (r[i].value === null) continue;
            assert.ok(r[i].value >= 0 && r[i].value <= 100,
                `out of [0,100] at i=${i}: ${r[i].value}`);
        }
    });

    it('hand-computed length=2 with OS=0, OB=100 → exact remap of RSI to [0,100]', () => {
        // length=2, RSI first valid at i=2. Buffer fills at i=3 (2 RSI
        // samples). After that: dynOS=min(rsi[2..3]), dynOB=max(rsi[2..3]).
        // closes=[10, 11, 10, 12, 8]
        //   delta[1]=+1, delta[2]=-1, delta[3]=+2, delta[4]=-4
        //   RSI@len=2:
        //     seed at i=2: gainSum=1, lossSum=1, avgG=0.5, avgL=0.5
        //       rsi[2] = 100 - 100/(1+1) = 50
        //     i=3: delta=+2 → g=2,l=0. avgG=(0.5*1 + 2)/2 = 1.25
        //                              avgL=(0.5*1 + 0)/2 = 0.25
        //       rsi[3] = 100 - 100/(1+5) = 100 - 50/3 ≈ 83.333
        //     i=4: delta=-4 → g=0,l=4. avgG=(1.25*1+0)/2=0.625
        //                              avgL=(0.25*1+4)/2=2.125
        //       rsi[4] = 100 - 100/(1 + 0.625/2.125)
        //              = 100 - 100/(1 + 0.29412) ≈ 100 - 77.273 ≈ 22.727
        //
        // First formed DZRSI at i=3: buffer=[rsi[2], rsi[3]]=[50, 83.333]
        //   min=50, max=83.333, range=33.333. OS=0/OB=100 → dynOS=50, dynOB=83.333.
        //   rsi[3]=83.333 >= dynOB → 100.
        // At i=4: buffer=[rsi[3], rsi[4]]=[83.333, 22.727]
        //   min=22.727, max=83.333, range=60.606.
        //   dynOS=22.727, dynOB=83.333.
        //   rsi[4]=22.727 → at the floor → output 0 (rsi <= dynOS).
        const r = calcDZRSI(makeCandles([10, 11, 10, 12, 8]),
            { length: 2, oversoldLevel: 0, overboughtLevel: 100 });
        for (let i = 0; i < 3; i++) assert.strictEqual(r[i].value, null);
        approxEq(r[3].value, 100);
        approxEq(r[4].value, 0);
    });

    it('time field passed through unchanged', () => {
        const candles = makeCandles([1,2,3,4,5,6,7]);
        const r = calcDZRSI(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r[i].time, candles[i].time);
        }
    });
});
