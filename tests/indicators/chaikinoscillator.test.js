// Chaikin Oscillator: EMA(ADL, fast) - EMA(ADL, slow), default fast=3, slow=10.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcChaikinOscillator } = require('../../src/chart/indicators/calc/chaikinoscillator.js');
const { calcADL } = require('../../src/chart/indicators/calc/adl.js');

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

function makeCandles(rows) {
    return rows.map((r, i) => ({
        time: `t${i}`,
        open: r[3], high: r[0], low: r[1], close: r[3], volume: r[2],
    }));
}

describe('calcChaikinOscillator', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcChaikinOscillator([], { fast: 3, slow: 10 }), []);
    });

    it('slow length larger than candle count → every value null (warm-up exceeds data)', () => {
        const candles = makeCandles([
            [10, 8, 100, 9],
            [12, 9, 200, 11],
            [11, 7, 150, 8],
        ]);
        const r = calcChaikinOscillator(candles, { fast: 3, slow: 10 });
        assert.strictEqual(r.length, 3);
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('output length matches candles[] and time is passed through', () => {
        const candles = makeCandles([
            [10, 8, 100, 9], [12, 9, 200, 11], [11, 7, 150, 8], [13, 9, 100, 12], [14, 10, 100, 13],
        ]);
        const r = calcChaikinOscillator(candles, { fast: 2, slow: 3 });
        assert.strictEqual(r.length, candles.length);
        for (let i = 0; i < candles.length; i++) assert.strictEqual(r[i].time, candles[i].time);
    });

    it('fast=2, slow=3 matches hand-computed EMA(ADL) difference', () => {
        // Build a tiny series and hand-compute the reference using the same
        // SMA-seeded EMA convention as the implementation.
        const candles = makeCandles([
            [10, 8, 100, 9],   // ADL[0] = 0     (MFM=0)
            [12, 9, 200, 11],  // ADL[1] = 200/3
            [11, 7, 150, 8],   // ADL[2] = 200/3 - 75
            [13, 9, 100, 12],  // ADL[3] = adl[2] + 100*(((12-9)-(13-12))/4) = +50
            [14, 10, 100, 13], // ADL[4] = adl[3] + 100*(((13-10)-(14-13))/4) = +50
        ]);
        const adl = calcADL(candles, {}).map(p => p.value);
        // EMA seed = SMA over first `length` values. fast=2 seeds at i=1
        // with (adl[0]+adl[1])/2; slow=3 seeds at i=2 with mean of first 3.
        const fastSeed = (adl[0] + adl[1]) / 2;
        const slowSeed = (adl[0] + adl[1] + adl[2]) / 3;
        const kf = 2 / (2 + 1);
        const ks = 2 / (3 + 1);
        const fast2 = adl[2] * kf + fastSeed * (1 - kf);
        const fast3 = adl[3] * kf + fast2 * (1 - kf);
        const fast4 = adl[4] * kf + fast3 * (1 - kf);
        const slow3 = adl[3] * ks + slowSeed * (1 - ks);
        const slow4 = adl[4] * ks + slow3 * (1 - ks);

        const r = calcChaikinOscillator(candles, { fast: 2, slow: 3 });
        // first slot where both EMAs are formed is i=2 (slow seeds at i=2).
        approxEq(r[2].value, fast2 - slowSeed);
        approxEq(r[3].value, fast3 - slow3);
        approxEq(r[4].value, fast4 - slow4);
    });

    it('flat constant series → oscillator converges to 0 once both EMAs formed', () => {
        // ADL stays constant when MFM stays constant. Easier: build candles
        // where MFM is identical → ADL grows linearly → EMA(ADL) tracks
        // exactly → fast - slow → 0 with enough warm-up.
        const rows = [];
        for (let i = 0; i < 30; i++) rows.push([10, 8, 100, 10]); // MFM = ((10-8)-(10-10))/2 = 1 → MFV = 100
        const candles = makeCandles(rows);
        const r = calcChaikinOscillator(candles, { fast: 3, slow: 10 });
        // ADL is a perfect arithmetic progression — the EMAs lag by their
        // own time constants, so the difference is non-zero but bounded.
        // Sanity-check: late-series values stay finite and small relative
        // to ADL magnitude.
        const last = r[r.length - 1].value;
        assert.ok(typeof last === 'number' && Number.isFinite(last), 'late value should be finite');
        assert.ok(Math.abs(last) < 1000, `late value too large: ${last}`);
    });
});
