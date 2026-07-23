// PVO: percentage volume oscillator — EMA-based percent difference on volume.
// PercentageVolumeOscillator.cs is a BaseComplexIndicator with three
// child outputs (shortEma, longEma, pvo). The JS calc therefore returns
// { shortEma, longEma, pvo } each as a Point[] aligned to the candles.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcPVO } = require('../../src/chart/indicators/calc/pvo.js');

function mkV(volume, i) {
    return { time: `t${i}`, open: 1, high: 1, low: 1, close: 1, volume };
}

describe('calcPVO', () => {
    it('empty candles → empty series', () => {
        assert.deepStrictEqual(calcPVO([], {}), { shortEma: [], longEma: [], pvo: [] });
    });

    it('warm-up: pvo null until longPeriod EMA seeds', () => {
        const c = Array.from({ length: 10 }, (_, i) => mkV(100 + i, i));
        const r = calcPVO(c, { shortPeriod: 3, longPeriod: 5 });
        for (let i = 0; i < 4; i++) assert.strictEqual(r.pvo[i].value, null, `bar ${i}`);
        assert.notStrictEqual(r.pvo[4].value, null);
    });

    it('flat volume → PVO = 0', () => {
        const c = Array.from({ length: 10 }, (_, i) => mkV(100, i));
        const r = calcPVO(c, { shortPeriod: 3, longPeriod: 5 });
        for (let i = 4; i < 10; i++) assert.ok(Math.abs(r.pvo[i].value) < 1e-12);
    });

    it('zero long EMA denominator returns zero', () => {
        const c = Array.from({ length: 6 }, (_, i) => mkV(0, i));
        const r = calcPVO(c, { shortPeriod: 2, longPeriod: 3 });
        assert.strictEqual(r.pvo[2].value, 0);
        assert.strictEqual(r.pvo[5].value, 0);
    });

    it('output length equals input length', () => {
        const c = Array.from({ length: 8 }, (_, i) => mkV(100 + i, i));
        const r = calcPVO(c, { shortPeriod: 2, longPeriod: 4 });
        assert.strictEqual(r.pvo.length, 8);
        assert.strictEqual(r.shortEma.length, 8);
        assert.strictEqual(r.longEma.length, 8);
    });

    it('time field passed through', () => {
        const c = Array.from({ length: 6 }, (_, i) => mkV(100 + i, i));
        const r = calcPVO(c, { shortPeriod: 2, longPeriod: 3 });
        for (let i = 0; i < 6; i++) assert.strictEqual(r.pvo[i].time, c[i].time);
    });
});
