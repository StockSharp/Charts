// Momentum Pinball tests.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcMomentumPinball } = require('../../src/chart/indicators/calc/momentumpinball.js');

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `2025-01-01T00:0${i}:00Z`,
        open: c, high: c, low: c, close: c, volume: 0,
    }));
}

describe('calcMomentumPinball', () => {
    it('rising series length=3, [1,2,3,4,5]', () => {
        // i=0: buf=[1], count<3 → null.
        // i=1: buf=[1,2], count<3 → null.
        // i=2: buf=[1,2,3]. min=1, max=3, range=2. momentum=3-1=2. val=2/2*100=100.
        // i=3: buf=[2,3,4]. min=2, max=4, range=2. momentum=4-2=2. val=100.
        // i=4: buf=[3,4,5]. min=3, max=5, range=2. momentum=5-3=2. val=100.
        const out = calcMomentumPinball(makeCandles([1, 2, 3, 4, 5]), { length: 3 });
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        assert.strictEqual(out[2].value, 100);
        assert.strictEqual(out[3].value, 100);
        assert.strictEqual(out[4].value, 100);
    });

    it('falling series length=3, [5,4,3,2,1] → -100', () => {
        const out = calcMomentumPinball(makeCandles([5, 4, 3, 2, 1]), { length: 3 });
        // i=2: buf=[5,4,3]. min=3,max=5,range=2. momentum=3-5=-2. val=-100.
        assert.strictEqual(out[2].value, -100);
        assert.strictEqual(out[3].value, -100);
        assert.strictEqual(out[4].value, -100);
    });

    it('constant series → range=0 → 0', () => {
        const out = calcMomentumPinball(makeCandles([5, 5, 5, 5]), { length: 3 });
        assert.strictEqual(out[2].value, 0);
        assert.strictEqual(out[3].value, 0);
    });

    it('mid-range pinball', () => {
        // length=4, closes=[1,3,2,4,2]
        // i=3: buf=[1,3,2,4]. min=1,max=4,range=3. momentum=4-1=3. val=3/3*100=100.
        // i=4: buf=[3,2,4,2]. min=2,max=4,range=2. momentum=2-3=-1. val=-50.
        const out = calcMomentumPinball(makeCandles([1, 3, 2, 4, 2]), { length: 4 });
        assert.strictEqual(out[3].value, 100);
        assert.ok(Math.abs(out[4].value - (-50)) < 1e-9);
    });

    it('empty input → empty output', () => {
        assert.deepStrictEqual(calcMomentumPinball([], { length: 5 }), []);
    });

    it('preserves candle.time', () => {
        const candles = makeCandles([1, 2, 3, 4]);
        const out = calcMomentumPinball(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });
});
