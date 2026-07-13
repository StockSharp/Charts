// Sine Wave — bar-index driven sin/leadsin.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcSineWave } = require('../../src/chart/indicators/calc/sinewave.js');

function makeCandles(n) {
    const arr = [];
    for (let i = 0; i < n; i++) arr.push({
        time: `2025-01-01T00:${String(i).padStart(2, '0')}:00Z`,
        open: 1, high: 1, low: 1, close: 1, volume: 0,
    });
    return arr;
}

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`);
}

describe('calcSineWave', () => {
    it('empty input → {sine:[], leadsine:[]}', () => {
        assert.deepStrictEqual(calcSineWave([], { length: 14 }), { sine: [], leadsine: [] });
    });

    it('length=4, 4 bars: sine = sin(2pi*i/4), leadsine = sin(2pi*(i+0.5)/4)', () => {
        const r = calcSineWave(makeCandles(4), { length: 4 });
        const twoPi = 2 * Math.PI;
        for (let i = 0; i < 4; i++) {
            approxEq(r.sine[i].value, Math.sin(twoPi * i / 4));
            approxEq(r.leadsine[i].value, Math.sin(twoPi * (i + 0.5) / 4));
        }
    });

    it('both series same length as input', () => {
        const candles = makeCandles(7);
        const r = calcSineWave(candles, { length: 4 });
        assert.strictEqual(r.sine.length, 7);
        assert.strictEqual(r.leadsine.length, 7);
    });

    it('preserves time', () => {
        const candles = makeCandles(5);
        const r = calcSineWave(candles, { length: 3 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r.sine[i].time, candles[i].time);
            assert.strictEqual(r.leadsine[i].time, candles[i].time);
        }
    });

    it('sine values bounded in [-1, 1]', () => {
        const r = calcSineWave(makeCandles(20), { length: 14 });
        for (const p of r.sine) {
            assert.ok(p.value >= -1 - 1e-12 && p.value <= 1 + 1e-12);
        }
        for (const p of r.leadsine) {
            assert.ok(p.value >= -1 - 1e-12 && p.value <= 1 + 1e-12);
        }
    });
});
