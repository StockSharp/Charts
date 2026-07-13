// PPO: (EMA_short - EMA_long) / EMA_long * 100, plus signal/histogram.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcPPO } = require('../../src/chart/indicators/calc/ppo.js');

function mk(close, i) {
    return { time: `t${i}`, open: close, high: close, low: close, close, volume: 1 };
}

describe('calcPPO', () => {
    it('empty candles → all three series empty', () => {
        assert.deepStrictEqual(calcPPO([], {}), { ppo: [], signal: [], histogram: [] });
    });

    it('shapes: all three series same length as input', () => {
        const c = Array.from({ length: 30 }, (_, i) => mk(100 + i, i));
        const r = calcPPO(c, { shortLength: 3, longLength: 6, signalLength: 2 });
        assert.strictEqual(r.ppo.length, 30);
        assert.strictEqual(r.signal.length, 30);
        assert.strictEqual(r.histogram.length, 30);
    });

    it('warm-up: ppo null until both EMAs seed; signal null until ppo seeds + signalLength', () => {
        // shortLength=3, longLength=5 → ppo seeds at index 4 (longLength-1).
        // signalLength=2 → signal seeds at first valid ppo + 1 more bar = index 5.
        const c = Array.from({ length: 8 }, (_, i) => mk(100 + i, i));
        const r = calcPPO(c, { shortLength: 3, longLength: 5, signalLength: 2 });
        for (let i = 0; i < 4; i++) {
            assert.strictEqual(r.ppo[i].value, null, `ppo[${i}] should be null`);
            assert.strictEqual(r.signal[i].value, null);
            assert.strictEqual(r.histogram[i].value, null);
        }
        assert.notStrictEqual(r.ppo[4].value, null);
    });

    it('hand-computed ppo on flat data → 0 (EMAs equal)', () => {
        const c = Array.from({ length: 10 }, (_, i) => mk(100, i));
        const r = calcPPO(c, { shortLength: 3, longLength: 5, signalLength: 2 });
        for (let i = 4; i < 10; i++) {
            assert.ok(Math.abs(r.ppo[i].value) < 1e-12, `bar ${i}: ${r.ppo[i].value}`);
        }
    });

    it('histogram = ppo - signal where both defined', () => {
        const c = Array.from({ length: 30 }, (_, i) => mk(100 + (i % 5), i));
        const r = calcPPO(c, { shortLength: 3, longLength: 5, signalLength: 3 });
        for (let i = 0; i < 30; i++) {
            if (r.ppo[i].value !== null && r.signal[i].value !== null) {
                assert.ok(Math.abs(r.histogram[i].value - (r.ppo[i].value - r.signal[i].value)) < 1e-12);
            }
        }
    });
});
